const { coreConnector } = require('./sender');

module.exports = async (sessionId, data) => {
    await coreConnector.start(sessionId, 'post', 'charge/setChargingData', data).catch(err => {
        console.log(err);
    })
}
