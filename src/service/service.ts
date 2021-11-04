import { BadRequestException, CACHE_MANAGER, Inject, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Utils } from '../helper/utils';
import { Consts, ManifestContentTypeEnum } from '../helper/consts';
import * as config from 'config';
import * as path from 'path';
import * as HLS from 'hls-parser';
import * as lodash from 'lodash';
import * as events from 'events';
import * as parser from 'fast-xml-parser';
import { RedisFsService } from '../redis-fs';
import { Cache } from 'cache-manager';
import { ManifestFilteringDto } from 'src/dto/manifest-filtering.dto';
import { DefaultOptions } from 'src/helper/dash.helper';
import { IHlsManifestUpdate } from 'src/interface/hls.interface';
import { Moment } from 'moment';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const moment = require('moment');
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-var-requires
const momentDurationFormatSetup = require('moment-duration-format');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSONparser = require('fast-xml-parser').j2xParser;

const JsonParser = new JSONparser(DefaultOptions);

@Injectable()
export class AppService implements OnModuleInit {
  private readonly _manifestEvent = new events.EventEmitter();

  public get manifestEvent() {
    return this._manifestEvent;
  }
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache, private utils: Utils, private consts: Consts, private redisFsService: RedisFsService) {}

  onModuleInit() {
    this._manifestEvent.setMaxListeners(Infinity);
  }

  genHLSMasterPlaylist(playlist, manifestDto: ManifestFilteringDto, query): string {
    const { start, stop, timeshift } = manifestDto;
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
      if (start || stop || timeshift) {
        variant.uri = path.join('/', `${variant.uri}?${this.utils.genPlaylistQuery(manifestDto)}`);
      }
    }
    return HLS.stringify(playlist);
  }

  async genDashMasterPlaylist(filePath: string, manifestDto: ManifestFilteringDto, query): Promise<string> {
    const { start, stop, timeshift } = manifestDto;
    let mpd = parser.parse(await this.redisFsService.read(filePath), DefaultOptions);
    if (!this.utils.validDashMpd(mpd)) return '';
    if (timeshift || (start && stop)) {
      // need to handle timeshifting
      const targetId = mpd.MPD['@_targetId'];
      if (!targetId) {
        return '';
      }
      const dirname = path.join('manifest', targetId);
      if (timeshift) {
        mpd = await this.genDashTimeshiftPlaylist(
          dirname,
          path.basename(filePath, '.mpd'),
          moment().subtract(timeshift + 120, 'seconds'),
          moment().subtract(timeshift, 'seconds'),
          true,
        );
      } else {
        mpd = await this.genDashTimeshiftPlaylist(dirname, path.basename(filePath, '.mpd'), moment(start * 1000), moment(stop * 1000), false);
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
  async genDashTimeshiftPlaylist(dirname: any, baseName: string, start: Moment, stop: Moment, live: boolean): Promise<string> {
    this.utils.checkValidQueryPlayBack(start, stop);
    const compareTime = stop.diff(start, 'hour') + 1;
    let resultPlaylist = null;
    let totalPeriodResult = [];
    let totalDuration = 0;
    let availableTimeStart = null;
    let lastPeriod = null;
    let initTime = 0;
    const fileName = `${baseName}-${live ? config.name_concat?.startover : config.name_concat.catchup}.mpd`;
    for (let j = 0; j <= compareTime; j++) {
      const current = moment(start).utc();
      current.add(j, 'hour');
      const currentTimePath = path.join(dirname, current.format('YYYYMMDDHH'), fileName);
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
              segTemResult['@_initialization'] = segTemResult['@_initialization'].replace(new RegExp('/media-static/[0-9abcdef]*'), config.catchup_replace);
              segTemResult['@_media'] = segTemResult['@_media'].replace(new RegExp('/media-static/[0-9abcdef]*'), config.catchup_replace);
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

  async genHLSMediaPlaylist(manifestDto: ManifestFilteringDto, filePath: string): Promise<string> {
    const { start, stop, timeshift, _HLS_msn, _HLS_part } = manifestDto;
    if (_HLS_msn || _HLS_part) {
      // handle low latency hls
      return this.genLLHLSMediaPlaylist(manifestDto, filePath);
    } else if (start && stop) {
      const startTime = moment(start * 1000);
      const stopTime = moment(stop * 1000);
      this.utils.checkValidQueryPlayBack(startTime, stopTime);
      return this.getDvrPlaylistNotTimeShift(startTime, stopTime, filePath);
    } else if (timeshift) {
      return this.getDvrPlaylistTimeShift(timeshift, filePath);
    }
    return '';
  }

  async genLLHLSMediaPlaylist(manifestDto: ManifestFilteringDto, filePath: string): Promise<string> {
    const { _HLS_msn, _HLS_part } = manifestDto;
    const cacheManifest = await this.cacheManager.get<IHlsManifestUpdate>(`LLHLS-${filePath}`);
    console.log('cacheManifest: ', cacheManifest, filePath);
    if (!cacheManifest) {
      return await this.redisFsService.read(filePath);
    }
    if (_HLS_part && !_HLS_msn) {
      throw new BadRequestException('_HLS_msn must be exist');
    }
    if (_HLS_msn > cacheManifest.msn + 2) {
      throw new BadRequestException('_HLS_msn greater then current 2 segment');
    }

    if (_HLS_msn && !_HLS_part) {
      if (_HLS_msn <= cacheManifest.msn) {
        return this.redisFsService.read(filePath);
      } else {
        return this.deferLLHLSRequest(filePath);
      }
    } else {
      if (_HLS_msn < cacheManifest.msn) {
        return await this.redisFsService.read(filePath);
      } else if (_HLS_msn === cacheManifest.msn) {
        if (_HLS_part <= cacheManifest.part) {
          return this.redisFsService.read(filePath);
        } else {
          return this.deferLLHLSRequest(filePath);
        }
      } else {
        return this.deferLLHLSRequest(filePath);
      }
    }
  }

  async deferLLHLSRequest(filePath: string) {
    try {
      await new Promise((resolve, reject) => {
        this.manifestEvent.once(filePath, resolve);
        setTimeout(() => {
          console.log('timeout');
          this.manifestEvent.removeListener(filePath, resolve);
          console.log('listener count: ', this.manifestEvent.listenerCount(filePath));
          reject();
        }, 5000);
      });
      return this.redisFsService.read(filePath);
    } catch (error) {
      throw new ServiceUnavailableException('long time to wait playlist');
    }
  }

  async manifestFiltering(filePath: string, manifestDto: ManifestFilteringDto): Promise<{ manifest: any; contentType: string }> {
    const { start, stop, timeshift, manifestfilter, media } = manifestDto;
    const query = this.utils.getValueQuery(manifestfilter);
    // this.utils.checkValidFormatPlayListHLS(filePath)
    // check query timeshift
    const manifestType = path.extname(filePath) === '.m3u8' ? 'hls' : path.extname(filePath) === '.mpd' ? 'dash' : null;
    if (!manifestType) {
      if (!(await this.redisFsService.exist(filePath))) {
        throw new NotFoundException('file not found');
      }
      return {
        manifest: await this.redisFsService.read(filePath),
        contentType: path.extname(filePath) === '.f4m' ? ManifestContentTypeEnum.HDS : path.extname(filePath) === '' ? ManifestContentTypeEnum.MSS : null,
      };
    }
    const isRawRequest = this.utils.isRawRequest(start, stop, timeshift, query);
    if (!media && !isRawRequest && manifestType === 'hls') {
      filePath = filePath.split('.m3u8')[0];
      if (timeshift) {
        filePath = filePath + '-' + config.name_concat?.startover + '.m3u8';
      } else {
        filePath = filePath + '-' + config.name_concat?.catchup + '.m3u8';
      }
    }
    if (!media) {
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
          return { manifest: this.genHLSMasterPlaylist(playlist, manifestDto, query), contentType: ManifestContentTypeEnum.HLS };
        }
      } else if (manifestType === 'dash') {
        return {
          manifest: await this.genDashMasterPlaylist(filePath, manifestDto, query),
          contentType: ManifestContentTypeEnum.DASH,
        };
      }
    }
    // handle hls media play list
    console.log('object');
    return { manifest: await this.genHLSMediaPlaylist(manifestDto, filePath), contentType: ManifestContentTypeEnum.HLS };
  }

  async getDvrPlaylistNotTimeShift(start: Moment, stop: Moment, filePath: string): Promise<string> {
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
          segment.uri = segment.uri.replace(new RegExp('/media-static/[0-9abcdef]*'), config.catchup_replace);
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

  async getManifestFromPath(filePath: string, time: Moment): Promise<string> {
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
