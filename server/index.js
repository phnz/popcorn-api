'use strict';

var rangeParser = require('range-parser'),
  pump = require('pump'),
  _ = require('lodash'),
  express = require('express'),
  multipart = require('connect-multiparty'),
  fs = require('fs'),
  path = require('path'),
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
    ready: torrent.torrent.ready,
    progress: progress(torrent.bitfield.buffer)
  };
}

api.get('/torrents/:infoHash', function (req, res) {

  var torrent = store.get(req.params.infoHash, function (torrentFile, torrentStream) {

    if (!torrentFile || !torrentStream) {
      return res.send(404);
    }

    res.send(serialize(torrentStream));
  });

});

api.delete('/torrents/:infoHash', function (req, res) {

  var torrent = store.get(req.params.infoHash, function (torrentFile, torrentStream) {

    if (!torrentFile || !torrentStream) {
      return res.send(404);
    }

    store.remove(req.params.infoHash);
    res.send(200);

  });

});

api.post('/torrents', function (req, res) {
  store.add(req.body.imdb_id, req.body.link, function (err, infoHash) {
    if (err) {
      console.error(err);
      res.send(500, err);
    } else {
      res.send({ infoHash: infoHash });
    }
  });
});

api.get('/torrents/:infoHash/stats', function (req, res) {
  var torrent = store.get(req.params.infoHash, function (torrentFile, torrentStream) {

    if (!torrentFile || !torrentStream) {
      return res.send(404);
    }

    res.send(stats(torrentStream));
  });
});

module.exports = api;
