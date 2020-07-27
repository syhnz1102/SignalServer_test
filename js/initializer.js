const { setServerInfo } = require('./server/info');

module.exports = (signalSocket) => {
  console.log(
    `write the initialization syntax under the lines.
    (scheduler, setting for server info, janus init, check the jwt.. etc.)`
  );

  setServerInfo(signalSocket);
}