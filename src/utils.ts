import { Injectable } from '@nestjs/common';
import { Consts } from './consts';
import * as path from 'path';
import * as moment from 'moment';
import * as qs from 'querystring';
import * as lodash from 'lodash';

@Injectable()
export class Utils {
  constructor(private consts: Consts) {}
  getValueQuery(manifestfilter: string) {
    if (manifestfilter === undefined) {
      manifestfilter = '';
    }
    const listQuery = manifestfilter.split(';');
    const query = {};
    for (let i = 0; i < listQuery.length; ++i) {
      const keyAndValue = listQuery[i].split(':');
      const type = this.validValueQuery(keyAndValue[0], keyAndValue[1]);
      if (type === 'comma') {
        const listValue = keyAndValue[1].split(',');
        query[keyAndValue[0]] = listValue;
      }
      if (type === 'dash') {
        const listValue = keyAndValue[1].split('-').map((t) => parseInt(t));
        query[keyAndValue[0]] = listValue;
      }
    }
    return query;
  }

  intersection2Array(arr1, arr2) {
    const result = arr1.filter((item1) => arr2.some((item2) => item1.uri === item2.uri));
    return result;
  }

  intersectionMultiArray(listArr) {
    if (listArr.length === 1) {
      return listArr[0];
    }
    if (listArr.length >= 2) {
      let i = 0;
      let result = listArr[0];
      while (i < listArr.length) {
        result = this.intersection2Array(result, listArr[i]);
        i = i + 1;
      }
      return result;
    }
  }

  getMultiListValueFilterFromQueryManifestFilter(variant, query, audioLanguages, videoBitrates, resolutions, videoCodecs) {
    if (Object.keys(query).includes('audio_language')) {
      const listLangue = query['audio_language'];
      for (let j = 0; j < listLangue.length; ++j) {
        listLangue[j] = listLangue[j].toLocaleLowerCase();
      }
      const listAudio = variant.audio;
      if (listAudio.length !== 0 && listLangue.includes(listAudio[0].language)) {
        audioLanguages.push(variant);
      }
    }
    if (Object.keys(query).includes('video_bitrate')) {
      const listVideoBitrate = query['video_bitrate'];
      const averageBandwidth = variant.averageBandwidth;
      if (averageBandwidth !== undefined && parseFloat(listVideoBitrate[0]) <= averageBandwidth && parseFloat(listVideoBitrate[1]) >= averageBandwidth) {
        videoBitrates.push(variant);
      }
    }
    if (Object.keys(query).includes('video_height')) {
      const rangeVideoHeight = query['video_height'];
      if (variant.resolution !== undefined && variant.resolution.height !== undefined) {
        const videoHeight = variant.resolution.height;
        if (parseFloat(rangeVideoHeight[0]) <= videoHeight && parseFloat(rangeVideoHeight[1]) >= videoHeight) {
          resolutions.push(variant);
        }
      }
    }
    if (Object.keys(query).includes('video_codec')) {
      const listVideoCodec = query['video_codec'];
      if (variant.codecs !== undefined) {
        const videoCodecVariant = variant.codecs.slice(0, 4);
        const videoCodecMapping = this.consts.consts.mapping.video_codec;
        const codec = videoCodecMapping[videoCodecVariant];
        if (listVideoCodec.includes(codec)) {
          videoCodecs.push(variant);
        }
      }
    }
    return [audioLanguages, videoBitrates, resolutions, videoCodecs];
  }

  getIntersectionFilter(audioLanguages, videoBitrates, resolutions, videoCodecs) {
    const listData = [];
    if (audioLanguages.length !== 0) {
      listData.push(audioLanguages);
    }
    if (videoBitrates.length !== 0) {
      listData.push(videoBitrates);
    }
    if (resolutions.length !== 0) {
      listData.push(resolutions);
    }
    if (videoCodecs.length !== 0) {
      listData.push(videoCodecs);
    }
    if (listData.length === 0) {
      return [];
    }
    const listVariantIntersection = this.intersectionMultiArray(listData);
    if (listVariantIntersection.length !== 0) {
      return listVariantIntersection;
    }
  }

  validValueQuery(name: string, value: string): any {
    if (!this.consts.consts.listName.includes(name)) {
      return false;
    }
    if (this.consts.consts.listNameDash.includes(name)) {
      if (value.indexOf('-') === -1 || value.split('-').length !== 2) {
        return false;
      }
      const listRangeQuery = value.split('-');
      const minQuery = parseFloat(listRangeQuery[0]);
      const maxQuery = parseFloat(listRangeQuery[1]);
      const listRangeLimit = this.consts.consts[name];
      if (listRangeLimit !== undefined) {
        if (Number.isNaN(minQuery) || Number.isNaN(minQuery) || minQuery < listRangeLimit[0] || maxQuery > listRangeLimit[1]) {
          return false;
        }
        const message = 'dash';
        return message;
      }
      const message = 'dash';
      return message;
    }
    if (this.consts.consts['listNameComma'].includes(name)) {
      const listValueQuery = value.split(',');
      const acceptedValues = this.consts.consts[name];
      if (acceptedValues) {
        for (let i = 0; i < listValueQuery.length; ++i) {
          if (!acceptedValues.includes(listValueQuery[i].toLocaleLowerCase())) {
            throw false;
          }
        }
      }
      const message = 'comma';
      return message;
    }
  }
  checkValidQueryPlayBack(start, stop) {
    if (start.format() === this.consts.consts.INVALID_DATE || stop.format() === this.consts.consts.INVALID_DATE) {
      const err = 'Start, stop time không chính xác';
      throw err;
    }

    if (stop.diff(start) < 60 * 1000) {
      const err = 'Chương trình phải có độ dài lớn hơn 1 phút';
      throw err;
    }

    if (stop.diff(start) > 8 * 60 * 60 * 1000) {
      const err = 'Chương trình phải có độ dài nhỏ hơn 6 tiếng';
      throw err;
    }

    if (stop.diff(moment().subtract(30, 'days')) < 0) {
      const err = 'Chương trình không được phép quá 30 ngày';
      throw err;
    }
  }

  genPlaylistQuery(start: number, stop: number, timeshift: number) {
    const queryPlaylist: any = Object.assign({ media: true }, start ? { start } : null, stop ? { stop } : null, timeshift ? { timeshift } : null);
    return qs.stringify(queryPlaylist);
  }

  convertObjectToArray(obj) {
    if (typeof obj === 'object') {
      if (!lodash.isArray(obj)) {
        obj = [obj];
      }
    } else {
      obj = [];
    }
    return obj;
  }

  filterVideoBitrate(representations, videoBitrateMin, videoBitrateMax) {
    return representations.filter((r) => parseInt(r['@_bandwidth']) >= videoBitrateMin && parseInt(r['@_bandwidth']) <= videoBitrateMax);
  }

  filterVideoCodec(representations) {
    return representations;
  }

  /**
   * filter theo chiều cao của video
   * @param Representations
   */
  filterVideoHeight(representations, heightMin, heightMax) {
    return representations.filter((r) => parseInt(r['@_height']) >= heightMin && parseInt(r['@_height']) <= heightMax);
  }

  filterAudioBitrate(representations, audioBitrateMin, audioBitrateMax) {
    return representations.filter((r) => parseInt(r['@_bandwidth']) >= audioBitrateMin && parseInt(r['@_bandwidth']) <= audioBitrateMax);
  }

  filterAudioSampleRate(representations, audioBitrateMin, audioBitrateMax) {
    return representations.filter((r) => parseInt(r['@_audioSamplingRate']) >= audioBitrateMin && parseInt(r['@_audioSamplingRate']) <= audioBitrateMax);
  }

  validDashMpd(mpdJson) {
    return !!mpdJson?.MPD;
  }

  isRawRequest(startTime, stopTime, timeShift, query) {
    return timeShift < 30 && (!startTime || !stopTime) && !Object.keys(query).length;
  }

  validFilenameManifest(filePath) {
    return path.extname(filePath) === '.m3u8' || path.extname(filePath) === '.mpd';
  }

  mergeAdapToLastPeriod(lastPeriod: any, adaptionSet: any): void {
    const lastAdapSet = lastPeriod.AdaptationSet.find((elem) => {
      return elem['@_contentType'] === adaptionSet['@_contentType'];
    });
    if (!lastAdapSet) {
      return;
    }
    adaptionSet?.SegmentTemplate?.SegmentTimeline?.S?.forEach((seg) => {
      const obj = { ...seg };
      delete obj['@_t'];
      lastAdapSet?.SegmentTemplate?.SegmentTimeline?.S.push(obj);
    });
  }
}
