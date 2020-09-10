const logger = require('../utils/logger');
const common = require('../utils/common');
const checker = require('../server/checker');

const cccService = require('../service/ccc');
const { signalSocket } = require('../repository/sender');

let keepAliveCheck = {};

module.exports = (socket, signalSocketio, redisInfo) => {

  //keepAlive
  keepAliveCheck[socket.id] = setTimeout(() => {
    // socket.disconnect(true);
    logger.log('info', `[Socket : KeepAlive] KeepAlive Timeout!, Session Id is : ${socket.id}`);
  }, 60000)

  const sessionId = socket.id;
  socket.on('disconnect', async () => {
    delete keepAliveCheck[socket.id];
    logger.log('info', `[Socket : Disconnect Event] User Disconnection, Session Id is : ${sessionId}`);
    await cccService.disconnect(socket, redisInfo, sessionId, signalSocketio);
  });
  socket.on('knowledgetalk', async data => {

    //SDP 정보 제외 하고 log 출력
    if(data.eventOp === 'SDP' && data.sdp && data.sdp.sdp) {
      let sdpReqData = data.sdp.sdp;
      data.sdp.sdp = "sdp info...";
      logger.log('info', `[ ### WEB > SIGNAL ### ] : ${JSON.stringify(data)}`);
      data.sdp.sdp = sdpReqData;
    } else {
      logger.log('info', `[ ### WEB > SIGNAL ### ] : ${JSON.stringify(data)}`);
    }

    const isChecked = await checker(sessionId, data);
    if (!isChecked) {
      signalSocket.emit(sessionId, {
        code: '413',
        message: await common.codeToMsg(413)
      });
      return false;
    }

    switch (data.eventOp || data.signalOp) {
      case 'CreateRoom':
        await cccService.createRoom(data, sessionId, redisInfo, socket);
        break;

      case 'DestroyRoom':
        await cccService.destroyRoom(data, sessionId, redisInfo);
        break;

      case 'RoomJoin':
        await cccService.roomJoin(data, sessionId, redisInfo, socket, signalSocketio);
        break;

      case 'StartSession':
        break;

      case 'SDP':
        await cccService.sdp(data, sessionId, redisInfo, socket, signalSocketio);
        break;

      case 'Candidate':
        // cccService.candidate();
        break;

      case 'ReceiveFeed':
        break;

      case 'SendFeed':
        await cccService.feedHandler(data, sessionId, redisInfo);
        break;

      case 'SessionReserve':
        await cccService.sessionReserve(data, sessionId, redisInfo);
        break;

      case 'SessionReserveEnd':
        await cccService.endSessionReserve(data, sessionId, redisInfo);
        break;

      case 'ScreenShareConferenceEnd':
        await cccService.endScreenShare(data, sessionId, redisInfo, socket);
        break;

      case 'SetVideo':
        await cccService.setVideo(data, sessionId, redisInfo, socket);
        break;

      case 'SetAudio':
        await cccService.setAudio(data, sessionId, redisInfo, socket);
        break;

      case 'ChangeName':
        await cccService.changeName(data, sessionId, redisInfo, socket);
        break;

      case 'ExitRoom':
        await cccService.exitRoom(socket, redisInfo, sessionId);
        break;

      case 'KeepAlive':
        await cccService.keepAlive(socket, data, keepAliveCheck);
        break;
    }
  });
}
