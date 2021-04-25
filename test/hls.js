const Hls = require('hls-parser');
const fs = require('fs');
const path = require('path');
const util = require('util');
console.log(util.inspect(Hls.parse(fs.readFileSync('./master.m3u8', 'utf8').toString()).variants.length, { depth: 10 }));
