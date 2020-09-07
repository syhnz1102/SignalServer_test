process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const express = require('express');
const cluster = require('cluster');
const fs = require('fs');

const launch = require('./js/launcher');
const config = require('./js/config');

if (cluster.isMaster) {
  for (let i = 0; i < config.process; i++) {
    cluster.fork();
  }
} else {
  const options = {
    key: fs.readFileSync(config.ssl.key),
    cert: fs.readFileSync(config.ssl.cert),
    ca: fs.readFileSync(config.ssl.ca),
    passphrase: config.ssl.passphrase
  };

  const server = https.createServer(options, express()).listen(config.port, '0.0.0.0', function() {
    console.log('::: HTTPS ::: Signal Server Started - PORT : ' + config.port);
  });

  launch(server);
}
