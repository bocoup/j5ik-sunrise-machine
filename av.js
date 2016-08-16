'use strict';
const cp = require('child_process');

// Spawn an `ffmpeg` process and return a Promise
function ffmpeg (opts) {
  opts.unshift('-v', 'fatal'); // Comment out to see ffmpeg logging
  const ffmpegProcess = cp.spawn('ffmpeg', opts);
  return new Promise((resolve, reject) => {
    ffmpegProcess.on('exit', code => {
      if (code != 0) {
        console.error(code);
        reject(code);
      } else {
        resolve();
      }
    });
    ffmpegProcess.stderr.on('data', data => {
      console.log(data.toString()); // Logging when not suppressed
    });
  });
}

// "Calibrate" a camera for `duration` seconds by letting it output to /dev/null
module.exports.calibrate = function (duration) {
  const videoArgs = [
    '-y', // Overwrite
    '-s', '320x240', // maximum resolution the Tessel 2's memory can handle
    '-input_format', 'yuyv422',
    '-r', '15', // framerate
    '-i', '/dev/video0', // input from mounted camera
    '-vframes', duration * 15, // total frames to generate
    '-f', 'mp4', // output format (can't be derived from extension here)
    '-b:v', '64k', // bitrate
    '/dev/null' // chuck it away
  ];
  return ffmpeg(videoArgs).then(() => '/dev/null');
};

// Capture a single still image at 320x240 from the attached USB camera
module.exports.captureStill = function (filepath) {
  const captureArgs = [
    '-y', // Overwrite
    '-s', '320x240', // maximum resolution the Tessel 2's memory can handle
    '-r', '15', // Framerate
    '-i', '/dev/video0', // Mount location of video camera
    '-q:v', '2', // Quality (1 - 31, 1 is highest)
    '-vframes', '1', // Total number of frames in the "video"
    filepath
  ];
  return ffmpeg(captureArgs).then(() => filepath);
};

// Build an MP4 video from a collection of JPGs indicated by `glob`
module.exports.videoFromStills = function (glob, outfile) {
  const stillArgs = [
    '-y', // overwrite
    '-s', '320x240', // maximum resolution the Tessel 2's memory can handle
    '-f', 'image2', // Input format
    '-pattern_type', 'glob', // Set it up to use a glob of filenames
    '-framerate', '6', // framerate
    '-i', glob, // input files are a glob
    outfile // the video file
  ];
  return ffmpeg(stillArgs).then(() => outfile);
};

// Create an animated GIF from an MP4 video. First, generate a palette.
module.exports.animatedGIFFromVideo = function (videofile, outfile) {
  const paletteFile = '/tmp/palette.png'; // TODO better place for this?
  const paletteArgs = [
    '-y', // overwrite
    '-i', videofile, // input is video file
    '-vf', 'fps=6,scale=320:-1:flags=lanczos,palettegen', // filtergraph: generate a palette
    paletteFile
  ];
  return ffmpeg(paletteArgs).then(() => {
    const gifArgs = [
      '-y', // overwrite
      '-i', videofile, // video as input
      '-i', paletteFile, // palette also as input
      '-lavfi', 'paletteuse', // filter complex, multiple inputs, use palette
      outfile
    ];
    return ffmpeg(gifArgs).then(() => outfile);
  });
};
