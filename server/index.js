'use strict';

var rangeParser = require('range-parser'),
  pump = require('pump'),
  _ = require('lodash'),
  express = require('express'),
  multipart = require('connect-multiparty'),
  fs = require('fs'),
  path = require('path'),
  ffmpeg = require('./ffmpeg'),
  store = require('./store'),
  progress = require('./progressbar'),
  stats = require('./stats'),
  api = express();

api.use(express.json());
api.use(express.logger('dev'));

function serialize(torrent) {
  if (!torrent.torrent) {
    return { infoHash: torrent.infoHash };
  }
  return {
    infoHash: torrent.infoHash,
    name: torrent.torrent.name,
    interested: torrent.amInterested,
    ready: torrent.torrent.ready,
    files: torrent.torrent.files,
    progress: progress(torrent.bitfield.buffer)
  };
}

api.get('/torrents', function (req, res) {
  res.send(store.list().map(serialize));
});

api.get('/torrents/:infoHash', function (req, res) {
  var torrent = store.get(req.params.infoHash);
  if (!torrent) {
    return res.send(404);
  }
  res.send(serialize(torrent));
});

api.delete('/torrents/:infoHash', function (req, res) {
  var torrent = store.get(req.params.infoHash);
  if (!torrent) {
    return res.send(404);
  }
  store.remove(req.params.infoHash);
  res.send(200);
});

api.post('/torrents', function (req, res) {
  store.add(req.body.link, function (err, infoHash) {
    if (err) {
      console.error(err);
      res.send(500, err);
    } else {
      res.send({ infoHash: infoHash });
    }
  });
});

api.post('/upload', multipart(), function (req, res) {
  var file = req.files && req.files.file;
  if (!file) {
    return res.send(500, 'file is missing');
  }
  store.add(file.path, function (err, infoHash) {
    if (err) {
      console.error(err);
      res.send(500, err);
    } else {
      res.send({ infoHash: infoHash });
    }
    fs.unlink(file.path);
  });
});

api.get('/torrents/:infoHash/stats', function (req, res) {
  var torrent = store.get(req.params.infoHash);
  if (!torrent) {
    return res.send(404);
  }
  res.send(stats(torrent));
});

api.get('/torrents/:infoHash/files', function (req, res) {
  var torrent = store.get(req.params.infoHash);
  if (!torrent) {
    return res.send(404);
  }
  res.setHeader('Content-Type', 'application/x-mpegurl; charset=utf-8');
  res.send('#EXTM3U\n' + torrent.files.map(function (f) {
    return '#EXTINF:-1,' + f.path + '\n' +
      req.protocol + '://' + req.get('host') + '/torrents/' + req.params.infoHash + '/files/' + encodeURIComponent(f.path);
  }).join('\n'));
});

api.get('/iframe/:infoHash', function (req, res) {
  var torrent = store.get(req.params.infoHash);
  if (!torrent) {
    return res.send(404);
  }

  var file = torrent.files[0].path;
  if (typeof req.query.ffmpeg !== 'undefined') {
    file = file + '?ffmpeg=' + req.query.ffmpeg
  }
  res.send('<link href="//vjs.zencdn.net/4.11/video-js.css" rel="stylesheet"><script src="//vjs.zencdn.net/4.11/video.js"></script><video id="' + req.params.infoHash + '" class="video-js vjs-default-skin" controls autoplay preload="auto" width="645" height="365" src="/torrents/' + req.params.infoHash + '/files/' + file +'"></video><script>videojs("' + req.params.infoHash + '", { "controls": true, "autoplay": true, "preload": "auto" });</script>')
});

api.all('/torrents/:infoHash/files/:path([^"]+)', function (req, res) {
  var torrent = store.get(req.params.infoHash), file;

  if (!torrent || !(file = _.find(torrent.files, { path: req.params.path }))) {
    return res.send(404);
  }

  if (typeof req.query.ffmpeg !== 'undefined') {
    return ffmpeg(req, res, torrent, file);
  }

  var range = req.headers.range;
  range = range && rangeParser(file.length, range)[0];
  res.setHeader('Accept-Ranges', 'bytes');
  res.type(file.name);
  req.connection.setTimeout(3600000);

  if (!range) {
    res.setHeader('Content-Length', file.length);
    if (req.method === 'HEAD') {
      return res.end();
    }
    return pump(file.createReadStream(), res);
  }

  res.statusCode = 206;
  res.setHeader('Content-Length', range.end - range.start + 1);
  res.setHeader('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + file.length);

  if (req.method === 'HEAD') {
    return res.end();
  }
  pump(file.createReadStream(range), res);
});

module.exports = api;
