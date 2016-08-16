'use strict';
const EventEmitter = require('events');
const path         = require('path');
const fs           = require('fs');
const Moment       = require('moment');
const av           = require('./av');

class Recording extends EventEmitter {
  constructor (name, options) {
    super();
    this.opts = options;
    this.filedir = path.join(this.opts.basedir,
      Moment().utcOffset(this.opts.utcOffset).format('YYYY-MM-DD-HHmmss'));
    this.imageFiles = [];
    this.canceled = false;
    this.name = name;
  }

  checkdir (dirpath) {
    return new Promise((resolve, reject) => {
      fs.stat(dirpath, (err, stats) => {
        if (err || !stats || !stats.isDirectory()) {
          fs.mkdir(dirpath, resolve);
        } else {
          resolve();
        }
      });
    });
  }

  start () {
    return Promise.all([
      this.checkdir(this.opts.basedir),
      this.checkdir(this.filedir)
    ])
    .then(this.captureStills.bind(this))
    .then(this.makeGIF.bind(this))
    .then(videoFile => {
      this.emit('done', videoFile);
      this.emit('exit', videoFile);
      return this;
    })
    .catch(err => console.log(err));
  }

  cancel () {
    clearTimeout(this.timer);
    this.canceled = true;
    this.emit('cancel');
    this.emit('exit', null);
  }

  captureStills () {
    var freq = this.opts.captureFrequency - +this.opts.calibrateCamera;
    if (freq < 0) { freq = 0; }
    return new Promise((resolve, reject) => {
      this.emit('start');
      function nextStill (filepath) {
        if (this.canceled) {
          return reject('Still capture canceled');
        }
        this.imageFiles.push(filepath);
        this.emit('capture:done',
          filepath, this.imageFiles, this.opts.captureCount);
        if (this.imageFiles.length < this.opts.captureCount) {
          this.timer = setTimeout(() => {
            this.captureStill().then(nextStill.bind(this));
          }, freq * 1000);
        } else {
          this.emit('stop');
          resolve(this.imageFiles);
        }
      }
      this.captureStill().then(nextStill.bind(this));
    });
  }

  captureStill () {
    const filenumber       = this.imageFiles.length + 1;
    const pad              = (filenumber < 10) ? '0' : '';
    const filename         = `capture-${pad}${filenumber}.jpg`;
    const filepath         = path.join(this.filedir, filename);
    var calibratePromise   = Promise.resolve();
    if (this.opts.calibrateCamera) {
      calibratePromise = av.calibrate(this.opts.calibrateCamera);
      this.emit('calibrate');
    }
    return calibratePromise.then(() => {
      this.emit('capture:start');
      return av.captureStill(filepath);
    });
  }

  makeVideo () {
    const glob    = path.join(this.filedir, 'capture-*.jpg');
    const outfile = path.join(this.filedir, 'video.mp4');
    return av.videoFromStills(glob, outfile);
  }

  makeGIF () {
    return this.makeVideo().then(videofile => {
      return av.animatedGIFFromVideo(videofile,
        path.join(this.filedir, 'video.gif'));
    });
  }
}

module.exports = Recording;
