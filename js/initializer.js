const { setServerInfo } = require('./server/info');
const janus = require('./core/janus.service');

module.exports = (signalSocket, redisInfo) => {
  console.log(
    `write the initialization syntax under the lines.
    (scheduler, setting for server info, janus init, check the jwt.. etc.)`
  );

  janus.init(signalSocket, redisInfo);
  setServerInfo(signalSocket);
}