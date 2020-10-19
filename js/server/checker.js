const { coreConnector } = require('../repository/sender');

module.exports = (sessionId, data) => {
  return new Promise(async (resolve, reject) => {
    if(data.code == '200'){
      resolve(true)
      return
    }
    let result = await coreConnector.start(sessionId, 'post', 'license/licenseValidation', data);
    resolve(result.code === 200);
  })
}
