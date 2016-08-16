/* require external dependencies */
const five      = require('johnny-five'); // Johnny-Five!
const Tessel    = require('tessel-io'); // J5 I/O plugin for Tessel boards
const suncalc   = require('suncalc'); // For calculating sunrise/set, etc., times
const Moment    = require('moment'); // For wrangling Dates because otherwise ugh
// Require other modules from sunriseMachine's code:
const config    = require('./config');
const Recording = require('./recording');
const tweetGIF  = require('./tweet');

// Instantiate a new `Board` object for the Tessel
const board = new five.Board({
  io: new Tessel() // Use the Tessel-IO plugin
});

// Instantiate some variables for later
var currentRecording, scheduled;

board.on('ready', () => { // Here we go. The board is ready. Let's go!
  // Instantiate J5 component objects: a pushbutton and RGB status LED
  const button    = new five.Button('A2');
  const statusLED = new five.Led.RGB(['A5', 'A6', 'B5']);
  // When the button is `press`ed, invoke the `toggle` function
  button.on('press', toggle);
  // Put the sunrise machine in standby mode
  standBy();

  // Put the sunrise machine in standby. Schedule the next recording if needed
  function standBy () {
    currentRecording      = null;       // There is no active recording. Explicitly.
    const scheduleDetails = schedule(); // See if there is a recording to schedule
    // `scheduled` is a Timeout object if there is a scheduled recording
    // if it's falsey, there is nothing scheduled, so put the SM in regular standby
    const nextStatus      = (scheduled) ? 'scheduled' : 'standby';
    // Set the sunrise machine's status and log any message returned by
    // the schedule function
    setStatus(nextStatus, scheduleDetails);
  }

  // button `press` callback. Start a manual recording, or cancel an in-progress recording
  function toggle () {
    if (currentRecording) { // if currentRecording is truthy, there is an in-progress recording
      currentRecording.cancel(); // so, cancel it
    } else { // otherwise, start a new recording
      record('Manual recording');
    }
  }

  function schedule () { // Schedule to record next autoSchedule event
    if (!config.autoSchedule) { // auto-scheduling is disabled in config
      return 'Nothing to schedule! Sunrise machine in auto mode';
    }
    const eventName    = config.autoSchedule;
    const now          = Moment();
    // Using noon explicitly when querying about sun events adds a level
    // of safety; using times near the start or end of the day can kick up
    // some unexpected results sometimes.
    const noonToday    = Moment().hour(12).minute(0);
    const noonTomorrow = Moment().add(1, 'days').hour(12).minute(0);

    // Ask `suncalc` for the times of various sun events today, at the
    // lat/long defined in the config
    var sunEvents = suncalc.getTimes(noonToday.valueOf(),
      config.lat, config.long);
    var eventDate, delta;

    if (!sunEvents.hasOwnProperty(eventName)) { // Invalid value for config.autoSchedule
      return `Not scheduling: ${eventName} is not a known suncalc event`;
    }

    if (sunEvents[eventName].getTime() < now.valueOf()) {
      // The event has already happened for today. Check when tomorrow's is...
      sunEvents = suncalc.getTimes(noonTomorrow.valueOf(),
        config.lat, config.long);
    }

    // Using the config.utcOffset value to bring the date into local timezone
    // Note that the actual date underneath is not changing, just its representation
    eventDate = Moment(sunEvents[eventName]).utcOffset(config.utcOffset);
    // How long is the event from now, in milliseconds?
    delta = eventDate - now;
    if (!scheduled) { // Don't reschedule if already scheduled
      // Schedule the recording by setting a timeout for the number of milliseconds
      // until the event
      scheduled = setTimeout(() => {
        record(`Automatic ${eventName} recording`); // Kick off a recording
        scheduled = null; // Unset scheduled because we're done here
      }, delta);
    }
    return `Scheduled for ${eventName}: ${eventDate.format(config.dateFormat)}`;
  }

  // Kick off a time-lapse recording!
  function record (name) {
    if (currentRecording) {
      log('Another recording session already in progress');
      return false;
    }
    // Create a new Recording object to do some heavy lifting for us
    const recording = new Recording(name, config);
    // Bind to a bunch of events on the Recording. Several of these update
    // the SM's status and/or log a message:
    recording.once('start', () => {
      setStatus('recording', `${recording.name} starting`);
    });
    recording.on('calibrate', () => setStatus('calibrating'));
    recording.on('capture:start', () => setStatus('capturing'));
    recording.once('cancel', () => log(`${recording.name} canceled`));

    // When one of the stills in a session is successfully captured, take note!
    recording.on('capture:done',  (filepath, images, totalnum) => {
      setStatus('recording',
        `Oh, snap! Captured ${images.length} of ${totalnum}`);
    });
    // When the stills are captured and the movies made, Tweet the result
    // if config indicates it should be done
    recording.once('done', videoFile => {
      if (config.postToTwitter) {
        tweetGIF(config, videoFile, config.tweetBody);
      }
      log(`${recording.name} complete`);
    });
    // Once the Recording exits, put the SM back in standby (this will
    // cause the next recording to get scheduled, if needed)
    recording.once('exit', standBy);

    // Start the recording!
    recording.start();

    // Reference this Recording as the SM's currentRecording
    currentRecording = recording;
    return recording;
  }

  // Indicate the sunrise machine's "status" by changing the state of the
  // RGB LED and optionally logging a message
  function setStatus (status, msg) {
    if (!config.statusLED) return; // Leave it alone if it's not enabled
    statusLED.stop().on(); // Stop any blinking that may be going on
    switch (status) {
      case 'standby':
        statusLED.color('blue');
        break;
      case 'scheduled':
        statusLED.color('green');
        break;
      case 'recording':
        statusLED.color('yellow');
        break;
      case 'calibrating':
        statusLED.color('orange').blink(500);
        break;
      case 'capturing':
        statusLED.color('red').blink(250);
        break;
      default:
        // Hmmm, I don't understand this status :)
        statusLED.color('purple').blink(1000);
        break;
    }
    if (msg) {
      log(msg);
    }
  }

  // This log function could be altered to log to a file, e.g.
  function log (msg) {
    const now = Moment().utcOffset(config.utcOffset).format(config.dateFormat);
    console.log(`${now}:
      ${msg}`);
  }
});
