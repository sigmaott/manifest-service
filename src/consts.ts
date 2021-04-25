export enum ManifestContentTypeEnum {
  HLS = 'application/vnd.apple.mpegurl',
  DASH = 'application/dash+xml',
}

export class Consts {
  consts = {
    listName: [
      'audio_channels',
      'audio_codec',
      'audio_language',
      'audio_sample_rate',
      'subtitle_language',
      'video_bitrate',
      'video_codec',
      'video_dynamic_range',
      'video_framerate',
      'video_height',
      'audio_bitrate',
    ],
    listNameDash: ['audio_channels', 'audio_sample_rate', 'video_bitrate', 'video_framerate', 'video_height', 'audio_bitrate'],
    listNameComma: ['audio_codec', 'audio_language', 'subtitle_language', 'video_codec', 'video_dynamic_range'],
    listNameCommaNotCheck: ['audio_language', 'startTime', 'stopTime', 'subtitle_language'],
    audio_channels: [1, 32767],
    audio_codec: ['aacl', 'aach', 'ac-3', 'ec-3'],
    audio_sample_rate: [0, 2147483647],
    video_bitrate: [0, 2147483647],
    audio_bitrate: [0, 2147483647],
    video_codec: ['h264', 'h265'],
    video_height: [1, 32767],
    video_dynamic_range: ['hdr10', 'hlg', 'sdr'],
    video_framerate: [1, 999.999],
    live: [true, false],
    mapping: {
      video_codec: {
        hev1: 'h265',
        hvc1: 'h265',
        avc1: 'h264',
        avc3: 'h264',
      },
    },
    EXT_NAME: {
      PLAYLIST_HLS: '.m3u8',
      PLAYLIST_DASH: '.mpd',
      DASH_SEGMENT: '.m4s',
      HLS_SEGMENT: '.ts',
      IMAGE_JPG: '.jpg',
      IMAGE_PNG: '.png',
      MP4: '.mp4',
    },
    INVALID_DATE: 'Invalid date',
  };
}
