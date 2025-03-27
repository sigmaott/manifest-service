export const DefaultOptions = {
  attributeNamePrefix: '@_',
  // attrNodeName: 'false', // default is 'false'
  textNodeName: '#text',
  ignoreAttributes: false,
  ignoreNameSpace: false,
  allowBooleanAttributes: true,
  suppressBooleanAttributes: false,
  parseNodeValue: true,
  parseAttributeValue: false,
  trimValues: true,
  format: true,
  cdataTagName: '__cdata', // default is 'false'
  cdataPositionChar: '\\c',
  localeRange: '', // To support non english character in tag/attribute values.
  parseTrueNumberOnly: false,
};
