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

    // for (let i in commonConfig.serverURL.coreServer) {
    //   if (commonConfig.serverURL.coreServer.hasOwnProperty(i)) {
    //     let _url = commonConfig.serverURL.coreServer[i] + ':'
    //       + commonConfig.serverPort.coreServer[i] + '/'
    //       + commonConfig.nameSpace.coreServer;
    //
    //     serverInfo.core.push(_url);
    //   }
    // }
    //
    // let result = await coreConnector.start('', 'get', 'info/servers', {})
    // serverInfo.turn = result.servers;
    resolve();
  });
};