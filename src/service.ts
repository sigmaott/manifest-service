import { BadRequestException, CACHE_MANAGER, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Utils } from './utils';
import { Consts, ManifestContentTypeEnum } from './consts';
import * as config from 'config';
import * as path from 'path';
import * as HLS from 'hls-parser';
import * as lodash from 'lodash';
import * as parser from 'fast-xml-parser';
import * as he from 'he';
import { RedisFsService } from './redis-fs';
import { Cache } from 'cache-manager';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const moment = require('moment');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-var-requires
const momentDurationFormatSetup = require('moment-duration-format');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSONparser = require('fast-xml-parser').j2xParser;

const DefaultOptions = {
  attributeNamePrefix: '@_',
  // attrNodeName: 'false', // default is 'false'
  textNodeName: '#text',
  ignoreAttributes: false,
  ignoreNameSpace: false,
  allowBooleanAttributes: false,
  parseNodeValue: true,
  parseAttributeValue: false,
  trimValues: true,
  format: true,
  cdataTagName: '__cdata', // default is 'false'
  cdataPositionChar: '\\c',
  localeRange: '', // To support non english character in tag/attribute values.
  parseTrueNumberOnly: false,
  attrValueProcessor: (a) => he.decode(a, { isAttributeValue: true }), // default is a=>a
  tagValueProcessor: (a) => he.decode(a), // default is a=>a
};

const JsonParser = new JSONparser(DefaultOptions);

@Injectable()
export class AppService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache, private utils: Utils, private consts: Consts, private redisFsService: RedisFsService) {}

  genHLSMasterPlaylist(playlist, startTime, stopTime, timeShift, query) {
    let variants = playlist.variants;
    if (lodash.isArray(query.video_bitrate) && query.video_bitrate.length === 2) {
      variants = variants.filter((v) => {
        return (v.bandwidth >= query.video_bitrate[0] && v.bandwidth <= query.video_bitrate[1]) || v.isIFrameOnly;
      });
    }
    if (lodash.isArray(query.video_height) && query.video_height.length === 2) {
      variants = variants.filter((v) => {
        return (v.resolution && v.resolution.height >= query.video_height[0] && v.resolution.height <= query.video_height[1]) || v.isIFrameOnly;
      });
    }
    playlist.variants = variants;
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (startTime || stopTime || timeShift) {
        variant.uri = path.join('/', `${variant.uri}?${this.utils.genPlaylistQuery(startTime, stopTime, timeShift)}`);
      }
    }
    return HLS.stringify(playlist);
  }

  async genDashMasterPlaylist(mpd, startTime, stopTime, timeShift, query) {
    if (!this.utils.validDashMpd(mpd)) return {};
    if (timeShift > 30 || (startTime && stopTime)) {
      // need to handle timeshifting
      const targetId = mpd.MPD['@_targetId'];
      if (!targetId) {
        return '';
      }
      const dirname = path.join('manifest', targetId);
      if (timeShift > 30) {
        mpd = await this.genDashTimeshiftPlaylist(dirname, moment().subtract(timeShift + 120, 'seconds'), moment().subtract(timeShift, 'seconds'), true);
      } else {
        mpd = await this.genDashTimeshiftPlaylist(dirname, moment(startTime * 1000), moment(stopTime * 1000), false);
      }
    }
    const periods = this.utils.convertObjectToArray(mpd?.MPD?.Period);
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      const adaptionSets = this.utils.convertObjectToArray(period.AdaptationSet);
      let adapLength = adaptionSets.length;
      for (let j = 0; j < adapLength; j++) {
        const adaptionSet = adaptionSets[j];
        let reps = this.utils.convertObjectToArray(adaptionSet.Representation);
        if (adaptionSet['@_contentType'] === 'video') {
          if (lodash.isArray(query.video_bitrate) && query.video_bitrate.length === 2) {
            reps = this.utils.filterVideoBitrate(reps, query.video_bitrate[0], query.video_bitrate[1]);
          }
          if (lodash.isArray(query.video_height) && query.video_height.length === 2) {
            reps = this.utils.filterVideoHeight(reps, query.video_height[0], query.video_height[1]);
          }
        } else if (adaptionSet['@_contentType'] === 'audio') {
          if (lodash.isArray(query.audio_bitrate) && query.audio_bitrate.length === 2) {
            reps = this.utils.filterAudioBitrate(reps, query.audio_bitrate[0], query.audio_bitrate[1]);
          }
          if (lodash.isArray(query.audio_sample_rate) && query.audio_sample_rate.length === 2) {
            reps = this.utils.filterAudioSampleRate(reps, query.audio_sample_rate[0], query.audio_sample_rate[1]);
          }
        }
        // remove AdaptionSet if reps length === 0
        if (reps.length === 0) {
          adaptionSets.splice(j, 1);
          adapLength -= 1;
          continue;
        }
        adaptionSet.Representation = reps;
      }
    }
    return '<?xml version="1.0" encoding="utf-8"?>\n' + JsonParser.parse(mpd, DefaultOptions);
  }

  /**
   *
   * - cắt danh sách ts: sửa ở SegmentTemplate
   * + id của period chứa thời gian bắt đầu
   * + Xóa tag <S /> và tăng startNumber
   * + Nếu period không còn tag <S /> thì xóa đi
   * + tag <S /> đầu tiên bắt buộc phải có field t là start time của video
   * - tạo VOD playlist:
   * + sửa type=static
   * + bỏ hết thuộc tính sau type
   * + thêm thuộc tính mediaPresentationDuration là tổng thời gian video đã cắt
   * - tạo LIVE playlist:
   * + set publishTime là thời gian hiện tại
   * + set availabilityStartTime = publishTime - tổng thời gian video đã cắt
   * @param dirname
   * @param start
   * @param stop
   * @param live
   * @returns
   */
  async genDashTimeshiftPlaylist(dirname: any, start: any, stop: any, live: boolean): Promise<string> {
    this.utils.checkValidQueryPlayBack(start, stop);
    const compareTime = stop.diff(start, 'hour') + 1;
    let resultPlaylist = null;
    let totalPeriodResult = [];
    let totalDuration = 0;
    let availableTimeStart = null;
    let lastPeriod = null;
    let initTime = 0;
    for (let j = 0; j <= compareTime; j++) {
      const current = moment(start).utc();
      current.add(j, 'hour');
      const currentTimePath = path.join(dirname, current.format('YYYYMMDDHH'), 'master.mpd');
      const currentPlaylistString = await this.getManifestFromPath(currentTimePath, current);
      if (!currentPlaylistString) {
        continue;
      }
      const currentPlaylist = parser.parse(currentPlaylistString, DefaultOptions);
      // valid mpd
      if (!this.utils.validDashMpd(currentPlaylist)) continue;
      if (!resultPlaylist) {
        const startPlaylist = lodash.cloneDeep(currentPlaylist);
        resultPlaylist = lodash.cloneDeep(startPlaylist);
        if (!live) {
          let isType = false;
          const removeKeys = Object.keys(resultPlaylist.MPD).filter((t) => {
            if (isType && t.indexOf('@_') > -1) {
              return true;
            }
            if (t === '@_type') {
              isType = true;
            }
            return false;
          });
          for (let i = 0; i < removeKeys.length; i++) {
            const key = removeKeys[i];
            delete resultPlaylist.MPD[key];
          }
          resultPlaylist.MPD['@_type'] = 'static';
        }
      }
      const periods = this.utils.convertObjectToArray(currentPlaylist?.MPD?.Period);
      const resultPeriods = [];
      let periodBreak = false;
      for (let i = 0; i < periods.length; i++) {
        const period = periods[i];
        let needMergePeriod = false;
        const periodResult = lodash.cloneDeep(period);
        if (!live) {
          periodResult['@_start'] = moment.duration(totalDuration, 'seconds').format('PTHH[H]mm[M]s.SSS[S]');
        }
        if (lastPeriod && period['@_id'] === lastPeriod['@_id']) {
          needMergePeriod = true;
        }
        const timeStart = moment.utc(period['@_id'], 'YYYYMMDDHHmmss');
        if (!availableTimeStart) {
          availableTimeStart = moment(timeStart).utc();
        }
        const adapSets = this.utils.convertObjectToArray(period?.AdaptationSet);
        const adapSetsResult = [];
        let allowPeriod = false;
        for (let j = 0; j < adapSets.length; j++) {
          const adapSet = adapSets[j];
          const contentType = adapSet['@_contentType'];
          const adapSetResult = lodash.cloneDeep(adapSet);
          // delete adapSetResult.SegmentTemplate;
          const segTem = adapSet?.SegmentTemplate;
          // TODO valid segment Template
          if (!segTem) continue;
          const segTemResult = lodash.cloneDeep(segTem);
          // delete segTemResult.SegmentTimeline;
          const timeScale = parseInt(segTem['@_timescale']);
          const startNumber = parseInt(segTem['@_startNumber']);
          let countStartNumber = 0;
          const segments = this.utils.convertObjectToArray(segTem?.SegmentTimeline?.S);
          const currentTime = moment(timeStart).utc();
          let segmentTimeInit = 0;
          const resultSegment = [];
          for (let z = 0; z < segments.length; z++) {
            const segment = segments[z];
            let { '@_t': t, '@_d': d, '@_r': r } = segment;
            if (t) {
              segmentTimeInit = parseInt(t);
              // currentTime.add(segmentTimeInit / timeScale, 'seconds');
            }
            const repeatSegment = parseInt(r) + 1 || 1;
            let allow = false;
            r = 0;
            for (let x = 0; x < repeatSegment; x++) {
              if (currentTime.diff(start) < 0) {
                // remove segment
                segmentTimeInit += parseInt(d);
                countStartNumber += 1;
                currentTime.add(parseInt(d) / timeScale, 'seconds');
                continue;
              }
              if (currentTime.diff(stop) > 0) {
                periodBreak = true;
                break;
              }
              currentTime.add(parseInt(d) / timeScale, 'seconds');
              if (!initTime && t) initTime = parseInt(t) / timeScale;
              t = segmentTimeInit;
              d = d;
              r += 1;
              allow = true;
              if (contentType === 'video') {
                totalDuration += parseInt(d) / timeScale;
              }
            }
            if (allow) {
              const segmentResult: Record<string, any> = {
                '@_d': d,
              };
              if (r > 1) {
                segmentResult['@_r'] = (r - 1).toString();
              }
              if (resultSegment.length === 0) {
                segmentResult['@_t'] = segmentTimeInit.toString();
              }
              resultSegment.push(segmentResult);
            }
          }
          segTemResult['@_startNumber'] = (startNumber + countStartNumber).toString();
          if (!live) segTemResult['@_presentationTimeOffset'] = segmentTimeInit.toString();
          if (resultSegment.length === 0) {
            // xoá hết period này luôn
            break;
          } else {
            segTemResult.SegmentTimeline.S = resultSegment;
            if (config.catchup_replace && !live) {
              segTemResult['@_initialization'] = segTemResult['@_initialization'].replace(new RegExp('/media-static/[1-9abcdef]*'), config.catchup_replace);
              segTemResult['@_media'] = segTemResult['@_media'].replace(new RegExp('/media-static/[1-9abcdef]*'), config.catchup_replace);
            }
            adapSetResult.SegmentTemplate = segTemResult;
            if (needMergePeriod) {
              this.utils.mergeAdapToLastPeriod(lastPeriod, adapSetResult);
            } else {
              allowPeriod = true;
              adapSetsResult.push(adapSetResult);
            }
          }
        }
        if (allowPeriod) {
          lastPeriod = periodResult;
          periodResult.AdaptationSet = adapSetsResult;
          resultPeriods.push(periodResult);
        }
        if (periodBreak) {
          break;
        }
      }
      totalPeriodResult = totalPeriodResult.concat(resultPeriods);
      if (periodBreak) {
        break;
      }
    }
    if (!resultPlaylist) {
      resultPlaylist = {};
    } else {
      resultPlaylist.MPD.Period = totalPeriodResult;
      if (!live) {
        resultPlaylist.MPD['@_mediaPresentationDuration'] = moment.duration(totalDuration, 'seconds').format('PTHH[H]mm[M]s.SSS[S]');
      } else {
        resultPlaylist.MPD['@_publishTime'] = moment().toISOString();
        resultPlaylist.MPD['@_availabilityStartTime'] = availableTimeStart.subtract(initTime, 'seconds').toISOString();
      }
    }
    return resultPlaylist;
  }

  async genHLSMediaPlaylist(startTime: number, stopTime: number, timeShift: number, filePath: string) {
    if (startTime && stopTime) {
      const start = moment(startTime * 1000);
      const stop = moment(stopTime * 1000);
      this.utils.checkValidQueryPlayBack(start, stop);
      return this.getDvrPlaylistNotTimeShift(start, stop, filePath);
    } else if (timeShift > 30) {
      return this.getDvrPlaylistTimeShift(timeShift, filePath);
    }
    return '';
  }

  async manifestFiltering(
    filePath: string,
    manifestfilter: string | undefined,
    startTime: number,
    stopTime: number,
    timeShift: number,
    isMedia: boolean,
  ): Promise<{ manifest: any; contentType: string }> {
    const query = this.utils.getValueQuery(manifestfilter);
    // this.utils.checkValidFormatPlayListHLS(filePath)
    // check query timeshift
    const manifestType = path.extname(filePath) === '.m3u8' ? 'hls' : path.extname(filePath) === '.mpd' ? 'dash' : null;
    if (!manifestType) {
      throw new BadRequestException('This file not is a master playlist');
    }
    const isRawRequest = this.utils.isRawRequest(startTime, stopTime, timeShift, query);
    if (!isMedia && (timeShift > 30 || (startTime > 0 && stopTime > 0)) && manifestType === 'hls') {
      filePath = filePath.split('.m3u8')[0];
      filePath = filePath + '-' + config.name_concat + '.m3u8';
    }
    if (!isMedia) {
      if (!(await this.redisFsService.exist(filePath))) {
        throw new NotFoundException('file not found');
      }
      if (isRawRequest) {
        return {
          manifest: await this.redisFsService.read(filePath),
          contentType: manifestType === 'hls' ? ManifestContentTypeEnum.HLS : ManifestContentTypeEnum.DASH,
        };
      }
      if (manifestType === 'hls') {
        const playlist = HLS.parse(await this.redisFsService.read(filePath));
        if (playlist.isMasterPlaylist) {
          return { manifest: this.genHLSMasterPlaylist(playlist, startTime, stopTime, timeShift, query), contentType: ManifestContentTypeEnum.HLS };
        }
      } else if (manifestType === 'dash') {
        return {
          manifest: await this.genDashMasterPlaylist(
            parser.parse(await this.redisFsService.read(filePath), DefaultOptions),
            startTime,
            stopTime,
            timeShift,
            query,
          ),
          contentType: ManifestContentTypeEnum.DASH,
        };
      }
    }
    return { manifest: await this.genHLSMediaPlaylist(startTime, stopTime, timeShift, filePath), contentType: ManifestContentTypeEnum.HLS };
  }

  async getDvrPlaylistNotTimeShift(start, stop, filePath): Promise<string> {
    const dirname = path.dirname(filePath);
    const nameFile = path.basename(filePath);
    const compareTime = stop.diff(start, 'hour') + 1;
    let resultPlaylist = null;
    let lastProgramDateTime;
    for (let j = 0; j <= compareTime; j++) {
      const current = moment(start);
      current.add(j, 'hour');
      const currentTimePath = path.join(dirname, current.format('YYYYMMDDHH'), nameFile);
      const currentPlaylistString = await this.getManifestFromPath(currentTimePath, current);
      if (!currentPlaylistString) {
        continue;
      }
      const playlist = HLS.parse(currentPlaylistString);
      if (!resultPlaylist) {
        resultPlaylist = lodash.cloneDeep(playlist);
        resultPlaylist.segments.splice(0, resultPlaylist.segments.length);
        resultPlaylist.playlistType = 'VOD';
        resultPlaylist.endlist = true;
        resultPlaylist.start = undefined;
      }
      const currentPlaylist = playlist;
      for (let k = 0; k < currentPlaylist.segments.length; k++) {
        const segment = currentPlaylist.segments[k];
        let currentMoment;
        if (segment.programDateTime) {
          lastProgramDateTime = segment.programDateTime;
          currentMoment = moment(segment.programDateTime);
        } else {
          if (lastProgramDateTime) {
            currentMoment = moment(lastProgramDateTime);
          }
        }
        if (!currentMoment) {
          continue;
        }
        if (currentMoment.diff(start) < 0) {
          continue;
        }
        if (currentMoment.diff(stop) > 0) {
          break;
        }
        // if (segment.key && segment.key.uri) {
        //   if(!live){
        //     segment.key.uri = segment.key.uri.replace(
        //       "mode=live",
        //       "mode=catchup"
        //     );
        //   }
        // }
        if (config.catchup_replace) {
          segment.uri = segment.uri.replace(new RegExp('/media-static/[1-9abcdef]*'), config.catchup_replace);
        }
        delete segment.programDateTime;
        resultPlaylist.segments.push(segment);
      }
    }
    if (!resultPlaylist) {
      return '';
    }
    return HLS.stringify(resultPlaylist).split(',undefined').join('');
  }

  async getDvrPlaylistTimeShift(timeShift: number, filePath): Promise<string> {
    const dirname = path.dirname(filePath);
    const nameFile = path.basename(filePath);
    const currTimeStamp = Date.now();
    const startTimeStamp = currTimeStamp - timeShift * 1000;
    const start = moment(startTimeStamp);
    const stop = moment(currTimeStamp);
    const compareTime = stop.diff(start, 'hour') + 1;
    let resultPlaylist = null;
    let lastProgramDateTime;
    const firstChunk = false;
    for (let j = 0; j <= compareTime; j++) {
      const current = moment(start);
      current.add(j, 'hour');
      const currentTimePath = path.join(dirname, current.format('YYYYMMDDHH'), nameFile);
      const currentPlaylistString = await this.getManifestFromPath(currentTimePath, current);
      if (!currentPlaylistString) {
        continue;
      }
      const playlist = HLS.parse(currentPlaylistString);
      if (!resultPlaylist) {
        resultPlaylist = lodash.cloneDeep(playlist);
        resultPlaylist.segments.splice(0, resultPlaylist.segments.length);
        resultPlaylist.playlistType = 'LIVE';
        resultPlaylist.endlist = false;
        resultPlaylist.start = undefined;
      }
      const currentPlaylist = playlist;
      for (let k = 0; k < currentPlaylist.segments.length; k++) {
        const segment = currentPlaylist.segments[k];
        let currentMoment;
        if (segment.programDateTime) {
          lastProgramDateTime = segment.programDateTime;
          currentMoment = moment(segment.programDateTime);
        } else {
          if (lastProgramDateTime) {
            currentMoment = moment(lastProgramDateTime);
          }
        }
        if (!currentMoment) {
          continue;
        }
        if (currentMoment.diff(start) < 0) {
          continue;
        }
        if (currentMoment.diff(stop) > 0) {
          break;
        }
        // if (segment.key && segment.key.uri) {
        //   if(!live){
        //     segment.key.uri = segment.key.uri.replace(
        //       "mode=live",
        //       "mode=catchup"
        //     );
        //   }
        // }
        delete segment.programDateTime;
        if (resultPlaylist.segments.length >= 10) {
          break;
        }
        resultPlaylist.segments.push(segment);
        if (!firstChunk) resultPlaylist.mediaSequenceBase = segment.mediaSequenceNumber;
      }
    }
    if (!resultPlaylist) {
      return '';
    }
    return HLS.stringify(resultPlaylist).split(',undefined').join('');
  }

  async getManifestFromPath(filePath, time): Promise<string> {
    let data = await this.cacheManager.get(filePath);
    if (data) {
      console.log('get from cache: ', filePath);
      return data.toString();
    }
    if (!(await this.redisFsService.exist(filePath))) {
      return '';
    }
    data = await this.redisFsService.read(filePath);
    if (data) {
      let ttl = 30;
      if (time) {
        const now = moment();
        if (now.subtract(5, 'minutes').startOf('hour').isAfter(time)) {
          ttl = 5 * 60;
        }
      }
      await this.cacheManager.set(filePath, data, { ttl });
    }
    return data.toString();
  }
}
