import { BadRequestException, CACHE_MANAGER, Inject, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Cache } from 'cache-manager';
import * as config from 'config';
import * as events from 'events';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import * as HLS from 'hls-parser';
import * as lodash from 'lodash';
import * as moment from 'moment';
import { Moment } from 'moment';
import 'moment-duration-format';
import * as path from 'path';
import { ManifestFilteringDto } from '../dto/manifest-filtering.dto';
import { Consts, ManifestContentTypeEnum } from '../helper/consts';
import { DefaultOptions } from '../helper/dash.helper';
import { IHlsManifestUpdate } from '../helper/interface/hls.interface';
import { Utils } from '../helper/utils';
import { RedisFsService } from '../redis-fs/service';

declare module 'moment' {
  interface Duration {
    format(template: string): string;
  }
}

@Injectable()
export class AppService implements OnModuleInit {
  private readonly _manifestEvent = new events.EventEmitter();
  private readonly logger = new Logger(AppService.name);
  private readonly parser: XMLParser;
  private readonly builder: XMLBuilder;

  public get manifestEvent() {
    return this._manifestEvent;
  }
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private utils: Utils,
    private consts: Consts,
    private readonly redisFsService: RedisFsService, // private readonly redisFsService: StorageFsService,
  ) {
    this.parser = new XMLParser(DefaultOptions);
    this.builder = new XMLBuilder(DefaultOptions);
  }

  // constructor(
  //   @Inject(CACHE_MANAGER) private cacheManager: Cache,
  //   private utils: Utils,
  //   private consts: Consts,
  //   private readonly redisFsService: StorageHttpService,
  // ) {}

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
        if (variant.audio?.length) {
          for (let j = 0; j < variant.audio.length; j++) {
            const audio = variant.audio[j];
            audio.uri = path.join('/', `${audio.uri}?${this.utils.genPlaylistQuery(manifestDto)}`);
          }
        }
      }
    }
    return HLS.stringify(playlist);
  }

  async genDashMasterPlaylist(filePath: string, manifestDto: ManifestFilteringDto, query): Promise<string> {
    const { start, stop, timeshift } = manifestDto;
    let mpd = this.parser.parse(await this.redisFsService.read(filePath));
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
    if (!Array.isArray(periods)) {
      return '<?xml version="1.0" encoding="utf-8"?>\n' + this.builder.build(mpd);
    }
    periods.sort((a, b) => {
      if (!a['@_start'] || !b['@_start']) {
        return 0;
      }
      return moment.duration(a['@_start']).asSeconds() - moment.duration(b['@_start']).asSeconds();
    });
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
          j--;
          adapLength -= 1;
          continue;
        }
        adaptionSet.Representation = reps;
      }
    }
    return '<?xml version="1.0" encoding="utf-8"?>\n' + this.builder.build(mpd);
  }

  /**
   *
   * - cắt danh sách ts: sửa ở SegmentTemplate
   * + id của period chứa thởi gian bắt đầu
   * + Xóa tag <S /> và tăng startNumber
   * + Nếu period không còn tag <S /> thì xóa đi
   * + tag <S /> đầu tiên bắt buộc phải có field t là start time của video
   * - tạo VOD playlist:
   * + sửa type=static
   * + bỏ hết thuộc tính sau type
   * + thêm thuộc tính mediaPresentationDuration là tổng thởi gian video đã cắt
   * - tạo LIVE playlist:
   * + set publishTime là thởi gian hiện tại
   * + set availabilityStartTime = publishTime - tổng thởi gian video đã cắt
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
    const fileName = `${baseName}-${live ? config.get('name_concat.startover') : config.get('name_concat.catchup')}.mpd`;
    for (let j = 0; j <= compareTime; j++) {
      const current = moment(start).utc();
      current.add(j, 'hour');
      const currentTimePath = path.join(dirname, current.format('YYYYMMDDHH'), fileName);
      const currentPlaylistString = await this.getManifestFromPath(currentTimePath, current);
      if (!currentPlaylistString) {
        continue;
      }
      const currentPlaylist = this.parser.parse(currentPlaylistString);
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
        const adapSets = this.utils.convertObjectToArray(period?.AdaptationSet).sort((a) => {
          if (a['@_contentType'] === 'video') {
            return -1;
          }
          return 1;
        });
        let videoCountStartNumber = 0;
        let videoAdapId = ''; // video AdaptionSetId
        const adapSetsResult = [];
        let allowPeriod = false;
        let videoInitTimeOffset = 0;
        for (let j = 0; j < adapSets.length; j++) {
          const adapSet = adapSets[j];
          const contentType = adapSet['@_contentType'];
          const adapId = adapSet['@_id'];

          if (!videoAdapId && contentType === 'video') videoAdapId = adapId;

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
          let initTimeOffset = 0;
          for (let z = 0; z < segments.length; z++) {
            const segment = segments[z];
            let { '@_t': t, '@_d': d, '@_r': r } = segment;
            if (t) {
              segmentTimeInit = parseInt(t);
              initTimeOffset = parseInt(t);
              if (contentType === 'video' && videoAdapId === adapId) {
                videoInitTimeOffset = segmentTimeInit / timeScale;
              }
              // currentTime.add(segmentTimeInit / timeScale, 'seconds');
            }
            const repeatSegment = parseInt(r) + 1 || 1;
            let allow = false;
            r = 0;
            for (let x = 0; x < repeatSegment; x++) {
              if (contentType === 'audio' && countStartNumber < videoCountStartNumber) {
                // remove segment
                // console.log(currentTime.diff(start), countStartNumber, contentType);
                segmentTimeInit += parseInt(d);
                countStartNumber += 1;
                currentTime.add(parseInt(d) / timeScale, 'seconds');
                continue;
              }

              if (contentType === 'video' && currentTime.diff(start) < 0 && videoAdapId === adapId) {
                // remove segment
                // console.log(currentTime.diff(start), countStartNumber, contentType);
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
              if (contentType === 'video' && videoAdapId === adapId) {
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

          if (contentType === 'video' && videoAdapId === adapId) {
            videoCountStartNumber = countStartNumber;
          }

          segTemResult['@_startNumber'] = (startNumber + countStartNumber).toString();
          if (!live) {
            segTemResult['@_presentationTimeOffset'] = segmentTimeInit.toString();
          } else {
            periodResult['@_start'] = moment.duration(videoInitTimeOffset, 'seconds').format('PTHH[H]mm[M]s.SSS[S]');
            segTemResult['@_presentationTimeOffset'] = initTimeOffset.toString();

            // delete segTemResult['@_presentationTimeOffset'];
          }
          if (resultSegment.length === 0) {
            // xoá hết period này luôn
            break;
          } else {
            segTemResult.SegmentTimeline.S = resultSegment;
            if (config.get('catchup_replace') && !live) {
              segTemResult['@_initialization'] = segTemResult['@_initialization'].replace(
                new RegExp('/media-static/[0-9abcdef]*'),
                config.get('catchup_replace'),
              );
              segTemResult['@_media'] = segTemResult['@_media'].replace(new RegExp('/media-static/[0-9abcdef]*'), config.get('catchup_replace'));
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
        totalDuration = Math.ceil(totalDuration);
        resultPlaylist.MPD['@_mediaPresentationDuration'] = moment.duration(totalDuration, 'seconds').format('PTHH[H]mm[M]s.SSS[S]');
      } else {
        resultPlaylist.MPD['@_publishTime'] = moment().toISOString();
        // resultPlaylist.MPD['@_availabilityStartTime'] = availableTimeStart.add(initTime, 'seconds').toISOString();
      }
    }
    return resultPlaylist;
  }

  async genHLSMediaPlaylist(manifestDto: ManifestFilteringDto, filePath: string): Promise<string> {
    const { start, stop, timeshift } = manifestDto;
    if (start && stop) {
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
    if (!cacheManifest) {
      return await this.redisFsService.read(filePath);
    }
    if (this.utils.checkFalsy(_HLS_msn)) {
      throw new BadRequestException('_HLS_msn must be exist');
    }
    if (_HLS_msn > cacheManifest.msn + 2) {
      throw new BadRequestException('_HLS_msn greater then current 2 segment');
    }

    if (_HLS_msn < cacheManifest.msn) return this.redisFsService.read(filePath);

    if (_HLS_msn > cacheManifest.msn || this.utils.checkFalsy(_HLS_part) || _HLS_part > cacheManifest.part) {
      return this.deferLLHLSRequest(filePath);
    } else {
      return this.redisFsService.read(filePath);
    }
  }

  async deferLLHLSRequest(filePath: string) {
    try {
      await new Promise((resolve, reject) => {
        this.manifestEvent.once(filePath, resolve);
        setTimeout(() => {
          this.manifestEvent.removeListener(filePath, resolve);
          reject();
        }, 5000);
      });
      return this.redisFsService.read(filePath);
    } catch (error) {
      throw new ServiceUnavailableException('long time to wait playlist');
    }
  }

  async manifestFiltering(filePath: string, manifestDto: ManifestFilteringDto): Promise<{ manifest: any; contentType: string }> {
    const { start, stop, timeshift, manifestfilter, media, _HLS_msn, _HLS_part } = manifestDto;
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
      if (timeshift) {
        filePath = filePath.split('.m3u8')[0];
        filePath = filePath + '-' + config.get('name_concat.startover') + '.m3u8';
      } else if (start && stop) {
        filePath = filePath.split('.m3u8')[0];
        filePath = filePath + '-' + config.get('name_concat.catchup') + '.m3u8';
      }
    }
    if (lodash.isNumber(_HLS_msn) || lodash.isNumber(_HLS_part)) {
      return { manifest: await this.genLLHLSMediaPlaylist(manifestDto, filePath), contentType: ManifestContentTypeEnum.HLS };
    } else if (!media) {
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
      const currentPlaylist = playlist as any;
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
        if (config.get('catchup_replace')) {
          segment.uri = segment.uri.replace(new RegExp('/media-static/[0-9abcdef]*'), config.get('catchup_replace'));
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
      const currentPlaylist = playlist as any;
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
      await this.cacheManager.set(filePath, data, ttl);
    }
    return data.toString();
  }
}
