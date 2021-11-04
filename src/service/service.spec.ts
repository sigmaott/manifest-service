import { CacheModule } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Consts } from '../helper/consts';
import { AppService } from './service';
import { Utils } from '../helper/utils';
import * as moment from 'moment';
import { j2xParser as JSONparser } from 'fast-xml-parser';
import * as he from 'he';
import * as util from 'util';

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

describe('AppController', () => {
  let appService: AppService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [CacheModule.register()],
      providers: [Utils, AppService, Consts],
    }).compile();

    appService = await app.resolve(AppService);
  });

  describe('testing dash mpd timeshift ok', () => {
    it('should be return ok', () => {
      //   appService.genDashTimeshiftPlaylist(
      //     '/Users/vietanha34/Documents/workspace/nodejs/livestream-media/test',
      //     moment(1616548545000).utc(),
      //     moment(1616548845000).utc(),
      //     0,
      //   );
      let mpd = appService.genDashTimeshiftPlaylist(
        '/Users/vietanha34/Documents/workspace/nodejs/livestream-media/test',
        moment(1616550845000).utc(),
        moment(1616551845000).utc(),
        false,
      );
      console.log(util.inspect(mpd, { depth: 10 }));
      mpd = JsonParser.parse(mpd);
      console.log(mpd);
    });
  });
});
