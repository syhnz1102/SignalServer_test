const { coreConnector } = require('../repository/sender');

module.exports = (sessionId, data) => {
  return new Promise(async (resolve, reject) => {
    let result = await coreConnector.start(sessionId, 'post', 'ccc/check', data);
    resolve(result.code === 200);
  })
}
