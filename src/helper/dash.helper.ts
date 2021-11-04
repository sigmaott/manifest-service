import * as he from 'he';

export const DefaultOptions = {
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
