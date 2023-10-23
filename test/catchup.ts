import { Moment } from 'moment';
import * as path from 'path';
import * as lodash from 'lodash';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const moment = require('moment');
import * as config from 'config';
import { DefaultOptions } from '../src/helper/dash.helper';
import * as parser from 'fast-xml-parser';
import * as fs from 'fs';
import { Utils } from '../src/helper/utils';
import { Consts } from '../src/helper/consts';
const momentDurationFormatSetup = require('moment-duration-format');

const utils = new Utils(new Consts());

const func = function genDashTimeshiftPlaylist(dirname: any, baseName: string, start: Moment, stop: Moment, live: boolean): Promise<string> {
  // utils.checkValidQueryPlayBack(start, stop);
  const compareTime = stop.diff(start, 'hour') + 1;
  let resultPlaylist = null;
  let totalPeriodResult = [];
  let totalDuration = 0;
  let availableTimeStart = null;
  let lastPeriod = null;
  let initTime = 0;
  //   const fileName = `${baseName}-${live ? config.name_concat?.startover : config.name_concat.catchup}.mpd`;
  for (let j = 0; j <= compareTime; j++) {
    const current = moment(start).utc();
    current.add(j, 'hour');
    // const currentTimePath = path.join(dirname, current.format('YYYYMMDDHH'), fileName);
    const currentPlaylistString = fs.readFileSync('./master.mpd').toString('utf-8');
    if (!currentPlaylistString) {
      continue;
    }
    const currentPlaylist = parser.parse(currentPlaylistString, DefaultOptions);
    // valid mpd
    if (!utils.validDashMpd(currentPlaylist)) continue;
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
    const periods = utils.convertObjectToArray(currentPlaylist?.MPD?.Period);
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
      //
      const adapSets = utils.convertObjectToArray(period?.AdaptationSet).sort((a, b) => {
        if (a['@_contentType'] === 'video') {
          return -1;
        }
        return 1;
      });
      let videoCountStartNumber = 0;
      //
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
        const segments = utils.convertObjectToArray(segTem?.SegmentTimeline?.S);
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
            if (contentType === 'audio' && countStartNumber < videoCountStartNumber) {
              // remove segment
              console.log(currentTime.diff(start), countStartNumber, contentType);
              segmentTimeInit += parseInt(d);
              countStartNumber += 1;
              currentTime.add(parseInt(d) / timeScale, 'seconds');
              continue;
            }

            if (contentType === 'video' && currentTime.diff(start) < 0) {
              // remove segment
              console.log(currentTime.diff(start), countStartNumber, contentType);
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
        ///
        if (contentType === 'video') {
          videoCountStartNumber = countStartNumber;
        }
        ///
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
            utils.mergeAdapToLastPeriod(lastPeriod, adapSetResult);
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
};

const result = func('', '', moment(1672745400000), moment(1672746400000), false);
console.log(result);
