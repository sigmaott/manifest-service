/**
 * merge Dash mpd via redis
 *
 */

import cacheManager from 'cache-manager';
import lodash from 'lodash';
import { cache } from './fingerprintWorker';
import fs from 'fs';
import fsExtra from 'fs-extra';
import path from 'path';
import config from 'config';
import he from 'he';
import parser from 'fast-xml-parser';
import consts from '../consts/consts';
import mongoose from 'mongoose';
import ChannelModel from '../models/channelModel';
import EventModel from '../models/eventModel';
import utils from '../utils/utils';
import redis from 'redis';
const JSONparser = require('fast-xml-parser').j2xParser;
const redisClient = redis.createClient({
  host: config.REDIS.HOST,
  port: config.REDIS.PORT,
  password: config.REDIS.PASSWORD,
});

const memoryCache = cacheManager.caching({ store: 'memory', max: 100, ttl: 30 /* seconds */ });

// TODO need to handle ....

const DefaultOptions = {
  attributeNamePrefix: '@_',
  attrNodeName: false, // default is 'false'
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

function mergeMpd(mpds, channelConfig) {
  let baseJson;
  for (let i = 0; i < mpds.length; i++) {
    const json = mpds[i];
    if (!baseJson) {
      const adaptationSets = json.MPD.Period.AdaptationSet;
      for (let j = 0; j < adaptationSets.length; j++) {
        const as = adaptationSets[j];
        if (as['@_contentType'] === 'audio') {
          const representation = as.Representation;
          representation['@_id'] = mpds.length;
        } else if (as['@_contentType'] === 'video') {
          as.Representation = [as.Representation];
        }
      }
      json.MPD['@_minimumBufferTime'] = 'PT20S';
      json.MPD['@_minBufferTime'] = 'PT20S';
      json.MPD['@_suggestedPresentationDelay'] = 'PT20S';
      /// json.MPD['@_minimumUpdatePeriod'] = 'PT60S'
      json.MPD['@_profiles'] = 'urn:mpeg:dash:profile:isoff-live:2011';
      // json.MPD['@_availabilityStartTime'] = 30
      baseJson = json;
    } else {
      const adaptationSets = json.MPD.Period.AdaptationSet;
      for (let j = 0; j < adaptationSets.length; j++) {
        const as = adaptationSets[j];
        if (as['@_contentType'] === 'video') {
          const representation = as.Representation;
          representation['@_id'] = i.toString();
          addRepresentation('video', baseJson.MPD.Period.AdaptationSet, representation);
        } else if (as['@_contentType'] === 'audio') {
          const representation = as.Representation;
          representation['@_id'] = mpds.length;
          addRepresentation('audio', baseJson.MPD.Period.AdaptationSet, representation);
        }
      }
    }
  }
  if (baseJson) {
    baseJson = utils.customPlaylistDash(baseJson, channelConfig);
    return baseJson;
  }
}

function addRepresentation(contenType, adaptationSets, representation) {
  for (let j = 0; j < adaptationSets.length; j++) {
    const as = adaptationSets[j];
    if (as['@_contentType'] === contenType) {
      if (lodash.isArray(as.Representation)) {
        as.Representation.push(representation);
      } else {
        as.Representation = representation;
      }
    }
  }
}

function DashMpdWorker() {
  redisClient.subscribe(consts.REDIS_CHANNEL_MPD);
  redisClient.on('message', handleData);
}

async function handleData(channel, message) {
  try {
    const data = JSON.parse(message);
    const { pathOrigin, profile, channelId, targetId, mpd } = data;
    const { profiles, shortPath } = await getChannelProfile(channelId, targetId);
    if (!profiles.length) {
      return;
    }
    let channelConfig;
    if (lodash.isEqual(lodash.sortBy(profiles), lodash.sortBy([profile]))) {
      // co moi 1 thoi
      if (!parser.validate(rep) === true) {
        // optional (it'll return an object in case it's not valid)
        return;
      }
      const singleMpd = parser.parse(rep, DefaultOptions);
      channelConfig = await findChannelConfig(channelId, targetId);
      const masterMpd = mergeMpd([singleMpd], channelConfig);
      if (masterMpd) {
        fs.writeFileSync(path.join(pathOrigin, 'master.mpd'), JsonParser.parse(masterMpd));
        if (shortPath) {
          genShortPathMpd(masterMpd, shortPath, channelId, targetId);
        }
      }
    }
    const keyName = `${channelId}.${targetId}.mpd`;
    let result = await memoryCache.get(keyName);
    if (!result) {
      result = {};
      result[profile] = mpd;
      memoryCache.set(keyName, result, 60 * 60);
    } else {
      result[profile] = mpd;
      const waitProfile = Object.keys(result);
      if (lodash.isEqual(lodash.sortBy(waitProfile), lodash.sortBy(profiles))) {
        // du roi join vao thoi
        channelConfig = await findChannelConfig(channelId, targetId);
        const masterMpd = mergeMpd(sortReprentation(Object.values(result)), channelConfig);
        if (masterMpd) {
          fs.writeFileSync(path.join(pathOrigin, 'master.mpd'), JsonParser.parse(masterMpd));
          if (shortPath) {
            genShortPathMpd(masterMpd, shortPath, channelId, targetId);
          }
        }
        memoryCache.set(keyName, null, 60 * 60);
      } else {
        memoryCache.set(keyName, result, 60 * 60);
      }
    }
  } catch (error) {
    console.error('error: ', error);
  }
}

function genShortPathMpd(mpd, shortPath, channelId, targetId) {
  const adaptationSets = mpd.MPD.Period.AdaptationSet;
  for (let i = 0; i < adaptationSets.length; i++) {
    const as = adaptationSets[i];
    const reps = as.Representation;
    if (lodash.isArray(reps)) {
      for (let i = 0; i < reps.length; i++) {
        const rep = reps[i];
        changeSegmentTemplatePath(rep, channelId, targetId);
      }
    } else {
      changeSegmentTemplatePath(reps, channelId, targetId);
    }
  }
  const masterDir = path.join(config.DATA_DIR, shortPath);
  fsExtra.ensureDirSync(masterDir);
  fs.writeFileSync(path.join(masterDir, 'master.mpd'), JsonParser.parse(mpd));
}

function changeSegmentTemplatePath(rep, channelId, targetId) {
  if (!rep.SegmentTemplate) {
    return;
  }
  if (rep.SegmentTemplate['@_initialization']) {
    rep.SegmentTemplate['@_initialization'] = path.join('..', channelId, targetId, rep.SegmentTemplate['@_initialization']);
  }
  if (rep.SegmentTemplate['@_media']) {
    rep.SegmentTemplate['@_media'] = path.join('..', channelId, targetId, rep.SegmentTemplate['@_media']);
  }
}

function sortReprentation(reps) {
  reps = reps.map(function (rep) {
    if (!parser.validate(rep) === true) {
      // optional (it'll return an object in case it's not valid)
      return;
    }
    return parser.parse(rep, DefaultOptions);
  });
  reps = lodash.compact(reps);
  return lodash.sortBy(reps, function (rep) {
    const adaptationSets = rep.MPD.Period.AdaptationSet;
    for (let j = 0; j < adaptationSets.length; j++) {
      const as = adaptationSets[j];
      if (as['@_contentType'] === 'video') {
        return Number(as.Representation['@_bandwidth']);
      }
    }
  });
}

async function getChannelProfile(channelId, targetId) {
  const keyName = `${channelId}.${targetId}.profile`;
  let result = await memoryCache.get(keyName);
  if (result) {
    return result;
  }
  result = { profiles: [], shortPath: '' };
  try {
    let channel = await ChannelModel.findOne({
      _id: mongoose.Types.ObjectId(channelId),
      'targets._id': mongoose.Types.ObjectId(targetId),
    }).lean();
    if (!channel) {
      channel = await EventModel.findOne({
        _id: mongoose.Types.ObjectId(channelId),
        'targets._id': mongoose.Types.ObjectId(targetId),
      }).lean();
    }
    if (channel) {
      result = await filterProfile(channel, targetId);
    }
  } catch (error) {
    console.error('findChannelConfig error: ', error);
  } finally {
    await memoryCache.set(keyName, result, 60 * 60);
    return result;
  }
}

function filterProfile(channel, targetId) {
  const target = lodash.find(channel.targets, (t) => {
    return t._id.toString() === targetId.toString();
  });
  if (!target) {
    return { profiles: [] };
  }
  let shortPath;
  if (channel.channelConfig.advance && channel.channelConfig.advance.path) {
    shortPath = channel.channelConfig.advance.path;
  }
  const presets = [];
  for (let i = 0; i < target.presets.length; i++) {
    const preset = target.presets[i].data;
    presets.push(utils.trimAndRemoveSpace(preset.name));
  }
  return { profiles: presets, shortPath };
}

async function findChannelConfig(channelId, targetId) {
  const result = await cache.get(`${channelId}.${targetId}`);
  if (result) {
    return result;
  } else {
    return {
      blockUsers: [],
      catchup: {},
      maintenance: false,
      fingerprint: false,
      mode: 'normal',
    };
  }
}

export default DashMpdWorker;
