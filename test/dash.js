const parser = require('fast-xml-parser');
const he = require('he');
const JSONparser = require('fast-xml-parser').j2xParser;
const fs = require('fs');
const util = require('util');

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
const mpdJson = parser.parse(fs.readFileSync('./master.mpd').toString('utf-8'), DefaultOptions);
// var parser = new Parser(defaultOptions);
var xml = JsonParser.parse(mpdJson);
console.log(xml);
