#!/usr/bin/env node
'use strict';

var express = require('express'),
  http = require('http'),
  path = require('path'),
  api = require('./');

var server = http.createServer(api);

server.listen(9000);
