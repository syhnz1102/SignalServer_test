const socketio = require("socket.io");
const redis = require("ioredis");
const ioRedis = require("socket.io-redis");

const config = require('./config');
const initialize = require('./initializer');
const doRunCCCIntf = require('./interface/ccc');

module.exports = app => {
  const signalSocket = socketio(app, { reconnect: true, transports: ["websocket", "polling"] });
  signalSocket.adapter(ioRedis({ host : config.sync.url, port: config.sync.port, password : config.sync.auth }));

  const redisInfo = new redis({
    sentinels: [
      { host: config.sync.stn1.url, port: config.sync.stn1.port },
      { host: config.sync.stn2.url, port: config.sync.stn2.port },
      { host: config.sync.stn3.url, port: config.sync.stn3.port },
    ],
    password: config.sync.credential,
    name: config.sync.alias,
    db: config.sync.dbNumber,
  });

  const socketInfo = signalSocket.of('/SignalServer').on('connection', socket => {
    switch (config.serviceType) {
      case 'ccc':
        doRunCCCIntf(socket, socketInfo, redisInfo);
        break;
      case 'talker':
        // todo
        break;
      case 'knowledgetalk':
        // todo
        break;
      default:
        doRunCCCIntf(socket, socketInfo, redisInfo);
        break;
    }
  });

  initialize(socketInfo, redisInfo);
};
