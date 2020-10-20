const request = require('request');
const { serverInfo } = require('../server/info');
const logger = require('../utils/logger');
const common = require('../utils/common');

exports.signalSocket = {
  emit: (sessionId, respData, reqData) => {
    if (!sessionId || !respData) {
      return;
    }

    serverInfo.signal.to(sessionId).emit('knowledgetalk', respData);


    if(respData.sdp && respData.sdp.sdp){
      respData.sdp.sdp = "SDP info..."
    }
    if(respData.eventOp !== 'KeepAlive'){
      logger.log('info', `[ ### SIGNAL > WEB ### ] ${JSON.stringify(respData)}`);
    }

  },
  broadcast: (socket, roomId, respData, reqData) => {
    if (!roomId || !respData) {
      return;
    }

    socket.broadcast.to(roomId).emit('knowledgetalk', respData);

    if(respData.sdp && respData.sdp.sdp){
      respData.sdp.sdp = "SDP info..."
    }
    logger.log('info',`[ ### SIGNAL > WEB ### ] ${JSON.stringify(respData)}`)
  },
  room: (roomId, respData, reqData) => {

    serverInfo.signal.to(roomId).emit('knowledgetalk', respData);

    if(respData.sdp && respData.sdp.sdp){
      respData.sdp.sdp = "SDP info..."
    }
    logger.log('info', `[ ### SIGNAL > WEB ### ] ${JSON.stringify(respData)}`);
  }
};

exports.coreConnector = {
  start: async (sessionId, type, url, body) => {
    // 190515 ivypark, Core REST 변경 건으로 인한 수정
    const base = await serverInfo.getCore();
    if(url === 'license/licenseValidation'){
      logger.log('info', `[ ### SIGNAL > CORE ## ] license check ${body.cpCode}`);
      body = {
        cpCode : body.cpCode,
        authKey : body.authKey
      }
    } else if(url === 'charge/setChargingData') {
      logger.log('info', `[ ### SIGNAL > CORE ## ] charging check ${JSON.stringify(body)}`);
    }
    return new Promise((resolve, reject) => {

      let time = setTimeout(async () => {
        clearTimeout(time);
        let msg = {
          code: '504',
          message: await common.codeToMsg(504)
        }

        if (!sessionId) {
          logger.error(`FATAL : All Core Server are DEAD.`);
          console.log('FATAL : all core server are DEAD...');
        } else {
          serverInfo.signal.to(sessionId).emit('knowledgetalk', msg);
        }
      }, 3000);

      let OPTIONS = {
        headers: {'Content-Type': 'application/json'},
        url: `${base}/conference/v1/${url}`,
        body: JSON.stringify(body)
      };

      let apiCallback = async (err, res, result) => {
        if (!err) {
          clearTimeout(time);
          if (res.statusCode === 404) {
            let msg = {
              code: '500',
              message: await common.codeToMsg(500)
            };

            if (!sessionId) {
              console.log('FATAL : all core server are DEAD...');
            } else {
              serverInfo.signal.to(sessionId).emit('knowledgetalk', msg);
            }
            // resolve({ code: String(res.statusCode) });
          } else {
            if (!result) {
              return resolve({ code: 500 });
            }
            logger.log('info', `[ ## CORE > SIGNAL ### ] ${result}`);
            resolve({ code: String(res.statusCode), ...JSON.parse(result) });
          }
        }
      };

      switch (type) {
        case 'get':
          OPTIONS.body = undefined;
          request.get(OPTIONS, apiCallback);
          break;

        case 'post':
          request.post(OPTIONS, apiCallback);
          break;

        case 'put':
          request.put(OPTIONS, apiCallback);
          break;

        case 'delete':
          request.delete(OPTIONS, apiCallback);
          break;

        default:
          logger.error(`# [Signal -> Core] HTTP type are not defined. #`);
          break;
      }
    });
  },
  aliveCheck: () => {
    return new Promise((resolve, reject) => {
      const MAX_RETRY_COUNT = serverInfo.core.length;
      let req, cnt = 0;
      (async function retryRequest() {
        let url = await serverInfo.getCore();
        req = request.get(url, (err, resp, body) => {
          if (err.code === 'ECONNREFUSED') {
            cnt++;
            cnt > MAX_RETRY_COUNT ? resolve(null) : retryRequest()
          } else {
            resolve(url);
            req.abort();
          }
        })
      })();
    });
  }
};
