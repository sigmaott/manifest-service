import * as lodash from 'lodash';
import * as parser from 'fast-xml-parser';
import { ManifestFilteringDto } from '../src/dto/manifest-filtering.dto';
import { DefaultOptions } from '../src/helper/dash.helper';
// eslint-disable-next-line @typescript-eslint/no-var-requires
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-var-requires
// eslint-disable-next-line @typescript-eslint/no-var-requires
const JSONparser = require('fast-xml-parser').j2xParser;
const JsonParser = new JSONparser(DefaultOptions);
import * as fs from 'fs';
import { Utils } from '../src/helper/utils';
import { Consts } from '../src/helper/consts';

const utils = new Utils(new Consts());

function genDashMasterPlaylist(filePath: string, manifestDto: ManifestFilteringDto, query): string {
  const mpd = parser.parse(fs.readFileSync(filePath, 'utf8'), DefaultOptions);
  if (!utils.validDashMpd(mpd)) return '';
  const periods = utils.convertObjectToArray(mpd?.MPD?.Period);
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const adaptionSets = utils.convertObjectToArray(period.AdaptationSet);
    let adapLength = adaptionSets.length;
    for (let j = 0; j < adapLength; j++) {
      const adaptionSet = adaptionSets[j];
      let reps = utils.convertObjectToArray(adaptionSet.Representation);
      if (adaptionSet['@_contentType'] === 'video') {
        if (lodash.isArray(query.video_bitrate) && query.video_bitrate.length === 2) {
          reps = utils.filterVideoBitrate(reps, query.video_bitrate[0], query.video_bitrate[1]);
        }
        if (lodash.isArray(query.video_height) && query.video_height.length === 2) {
          reps = utils.filterVideoHeight(reps, query.video_height[0], query.video_height[1]);
        }
      } else if (adaptionSet['@_contentType'] === 'audio') {
        if (lodash.isArray(query.audio_bitrate) && query.audio_bitrate.length === 2) {
          reps = utils.filterAudioBitrate(reps, query.audio_bitrate[0], query.audio_bitrate[1]);
        }
        if (lodash.isArray(query.audio_sample_rate) && query.audio_sample_rate.length === 2) {
          reps = utils.filterAudioSampleRate(reps, query.audio_sample_rate[0], query.audio_sample_rate[1]);
        }
      }
      // remove AdaptionSet if reps length === 0
      if (reps.length === 0) {
        console.log('object');
        adaptionSets.splice(j, 1);
        j--;
        adapLength -= 1;
        continue;
      }
      adaptionSet.Representation = reps;
    }
  }
  return '<?xml version="1.0" encoding="utf-8"?>\n' + JsonParser.parse(mpd, DefaultOptions);
}

(function main() {
  console.log(
    genDashMasterPlaylist(
      '/Users/vietanha34/Documents/workspace/nodejs/manifest-service/test/master.mpd',
      {
        media: false,
        manifestfilter: '',
        start: 0,
        stop: 0,
        timeshift: 0,
        _HLS_msn: 0,
        _HLS_part: 0,
        test: 0,
      },
      { video_bitrate: [0, 1500000] },
    ),
  );
})();
