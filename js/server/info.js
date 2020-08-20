const config = require('../config')

let serverInfo = {
  signal: {},
  core: [],
  turn: [],
  switch: {
    core: -1,
    turn: -1
  },
  getCore: () => {
    let _self = serverInfo;
    return new Promise((resolve, reject) => {
      _self.switch.core++;
      if (_self.switch.core >= _self.core.length) {
        _self.switch.core = 0;
      }
      resolve(_self.core[_self.switch.core]);
    })
  },
  getTurn: () => {
    let _self = serverInfo;
    return new Promise((resolve, reject) => {
      _self.switch.turn++;
      if (_self.switch.turn >= _self.turn.length) {
        _self.switch.turn = 0;
      }
      resolve(_self.turn[_self.switch.turn]);
    })
  }
};

exports.serverInfo = serverInfo
exports.setServerInfo = signalIo => {
  return new Promise(async (resolve, reject) => {
    serverInfo.signal = signalIo;
    for (let i in config.was) {
      if (config.was.hasOwnProperty(i)) {
        let _url = `${config.was[i].url}:${config.was[i].port}`
        serverInfo.core.push(_url);
      }
    }

    resolve();
  });
};