'use strict';

var mongoose = require('mongoose');
var config = require('../config');
var events = require('events');
var readTorrent = require('read-torrent');
var engine = require('./engine');
var _ = require('lodash');
var torrents = {};
var options = {};

RegExp.escape = function(text) {
	return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

var File = mongoose.model('File', {
    imdb: String,
    hash: String,
    ready: String,
    complete: String,
    name: String
});

mongoose.connect('mongodb://' + config.dbHosts.join(',') + '/production', {
	db: { native_parser: true },
	replset: {
		rs_name: 'pt0',
		connectWithNoPrimary: true,
		readPreference: 'nearest',
		strategy: 'ping',
		socketOptions: {
			keepAlive: 1
		}
	},
	server: {
		readPreference: 'nearest',
		strategy: 'ping',
		socketOptions: {
			keepAlive: 1
		}
	}
});

module.exports = _.extend(new events.EventEmitter(), {

  add: function (imdb_id, link, callback) {
    readTorrent(link, function (err, torrent) {
      if (err) {
        return callback(err);
      }
      var infoHash = torrent.infoHash;
      if (torrents[infoHash]) {
        return infoHash;
      }

      // maybe it exist ?
      var query  = File.where({ hash: infoHash });
      query.findOne({hash: infoHash}, function (err, torrentFile) {
            if (torrentFile) {
                callback(null, infoHash);
            } else {
                 console.log('adding ' + infoHash);

                 var e = engine(torrent, options);
                 e.on('ready', function() {
                   // auto select 1st file
                   if (e && e.files) {

                     var movieFile = e.files[0];
                     movieFile.select();

                     if (e.files[1]) {
                         var movieImg = e.files[1];
                         movieImg.deselect();
                     }
                   }

                   var file = new File({
                         imdb: imdb_id,
                         hash: torrent.infoHash,
                         ready: false,
                         complete: false,
                         name: torrent.name
                   });

                   file.save(function (err) {
                     torrents[infoHash] = e;
                     callback(null, infoHash);
                   });
                 })


            }
      });

    });
  },

  get: function (infoHash, callback) {
    var self = this;
    var query  = File.where({ hash: infoHash });
    query.findOne({hash: infoHash}, function (err, torrentFile) {
      if (err) callback(false, false);
      // load torrent with peerflix
      self.load(infoHash, function() {
        return callback(torrentFile, torrents[infoHash]);
      });

    });
  },

  remove: function (infoHash) {

    // make sure torrent is initialized
    this.load(infoHash, function() {
        var torrent = torrents[infoHash];
        torrent.destroy();
        torrent.remove(function () {
          torrent.emit('destroyed');
        });
        delete torrents[infoHash];
        File.remove({ hash: infoHash }, function(err) {
            return;
        });
    });

  },

  load: function (infoHash, callback) {

    if (!torrents[infoHash]) {
      console.log('loading ' + infoHash);
      var e = engine('magnet:?xt=urn:btih:' + infoHash, options); // TODO
      torrents[infoHash] = e;
      e.on('ready', function() {
        callback();
      })

    } else {
      callback();
    }

  }
});

function shutdown(signal) {
  if (signal) {
    console.log(signal);
  }

  var keys = Object.keys(torrents);
  if (keys.length) {
    var key = keys[0], torrent = torrents[key];
    torrent.destroy(function () {
      torrent.emit('destroyed');
      delete torrents[key];
      process.nextTick(shutdown);
    });
  } else {
    process.nextTick(process.exit);
  }
}

process.on('SIGTERM', function () {
  shutdown('SIGTERM');
});

process.on('SIGINT', function () {
  shutdown('SIGINT');
});
