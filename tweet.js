const Twitter = require('twitter');
const fs      = require('fs');

/**
 * Upload the animated GIF located at `filepath` to Twitter and then
 * Tweet about it using the contents of `tweetBody`.
 * @param Object config       Config object; needs to contain Twitter creds
 * @param String filepath     Location of GIF
 * @param String tweetBody    The tweet to tweet
 * @return Promise            Resolves to Tweet data (Object) returned by API
 */
function tweetGIF (config, filepath, tweetBody) {
  const client = new Twitter({
    consumer_key       : config.consumer_key,
    consumer_secret    : config.consumer_secret,
    access_token_key   : config.access_token_key,
    access_token_secret: config.access_token_secret
  });

  /**
   * Send a POST request to the Twitter API
   * @param String endpoint  e.g. 'statuses/upload'
   * @param Object params    Params object to send
   * @return Promise         Rejects if response is error
   */
  function makePost (endpoint, params) {
    return new Promise((resolve, reject) => {
      client.post(endpoint, params, (error, data, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Step 1 of 3: Initialize a media upload
   * @return Promise resolving to String mediaId
   */
  function initUpload () {
    return makePost('media/upload', {
      command    : 'INIT',
      total_bytes: fs.statSync(filepath).size,
      media_type : 'image/gif'
    }).then(data => data.media_id_string);
  }

  /**
   * Step 2 of 3: Append file chunk
   * @param String mediaId    Reference to media object being uploaded
   * @return Promise resolving to mediaId (for chaining)
   */
  function appendUpload (mediaId) {
    return makePost('media/upload', {
      command      : 'APPEND',
      media_id     : mediaId,
      media        : fs.readFileSync(filepath),
      segment_index: 0
    }).then(data => mediaId);
  }

  /**
   * Step 3 of 3: Finalize upload
   * @param String mediaId   Reference to media
   * @return Promise resolving to mediaId (for chaining)
   */
  function finalizeUpload (mediaId) {
    return makePost('media/upload', {
      command : 'FINALIZE',
      media_id: mediaId
    }).then(data => mediaId);
  }

  /**
   * Do all three steps...
   */
  function uploadGIF () {
    return initUpload(filepath)
      .then(appendUpload)
      .then(finalizeUpload);
  }

  /**
   * Post tweet with reference to uploaded media
   */
  function postTweet (mediaId) {
    return makePost('statuses/update', {
      status   : tweetBody,
      media_ids: mediaId
    });
  }

  /**
   * All together, now.
   **/
  return uploadGIF()
    .then(postTweet)
    .then(tweet => console.log('Tweet sent!'))
    .catch(err => console.log(`Uh oh. Error: ${err}`));
}

module.exports = tweetGIF;
