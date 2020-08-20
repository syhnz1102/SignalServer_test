const { coreConnector } = require('../repository/sender');
const config = require('../config');

exports.license = {
  user: {
    insert: async (sessionId, data, socket) => {
      if (config.license.type === 'free' || !data.cpCode) return false;
      Object.assign(data, { ip: socket.request.connection._peername.address })
      await coreConnector.start(sessionId, 'post', 'ccc/insertUser', data);
    },
  }
}

exports.lic = {
  // emit: (body) => {
  //   request.post({
  //     headers: {'Content-Type': 'application/json'},
  //     url: 'http://localhost/onm/license/report',
  //     body: JSON.stringify(body)
  //   }, (err, res, result) => {
  //     console.log(err, result);
  //     return false;
  //   });
  // },
  //
  // check: async (license, type) => {
  //   // type: default: all(undefined) | 'user' | 'date' | 'schedule'
  //
  //   const ip = require('ip').address();
  //
  //   let today = new Date();
  //   let endDate = new Date(license.endDate);
  //
  //   let { result } = await coreConnector.start('', 'get', `users/n/count`, {});
  //
  //   if (type === 'schedule') lic.emit({name: license.name, report: `check`, count: result, ip});
  //
  //   if (today > endDate) { // 기간 만료
  //     logger.error('===== FATAL ===== licence expire date.');
  //
  //     lic.emit({name: license.name, report: `expire date.`, count: result, ip});
  //     setTimeout(() => { process.exit(0); }, 2000);
  //   }
  //
  //   if (Number(result) > Number(license.maxUser)) { // 인원 초과
  //     logger.error('===== FATAL ===== licence user exceed.');
  //
  //     lic.emit({name: license.name, report: `user exceed.`, count: result, ip});
  //     setTimeout(() => { process.exit(0); }, 2000);
  //   }
  // }
};