const { coreConnector } = require('./sender');

module.exports = async (sessionId, data) => {
  await coreConnector.start(sessionId, 'post', 'ccc/insert', data)
}