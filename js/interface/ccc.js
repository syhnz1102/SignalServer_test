const logger = require('../utils/logger');
const checker = require('../server/checker');

const cccService = require('../service/ccc');
const { signalSocket } = require('../repository/sender');

module.exports = (socket, signalSocketio, redisInfo) => {
  const sessionId = socket.id;
  socket.on('disconnect', () => {
    logger.log('info', `[Socket : Disconnect Event] User Disconnection, Session Id is : ${sessionId}`);
    cccService.disconnect(socket, redisInfo, sessionId, signalSocketio);
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
      signalSocket.emit(sessionId, { code: '413', message: 'Auth Error' });
      return false;
    }

    switch (data.eventOp || data.signalOp) {
      case 'CreateRoom':
        cccService.createRoom(data, sessionId, redisInfo, socket);
        break;

      case 'DestroyRoom':
        cccService.destroyRoom(data, sessionId, redisInfo);
        break;

      case 'RoomJoin':
        cccService.roomJoin(data, sessionId, redisInfo, socket, signalSocketio);
        break;

      case 'StartSession':
        break;

      case 'SDP':
        cccService.sdp(data, sessionId, redisInfo, socket, signalSocketio);
        break;

      case 'Candidate':
        // cccService.candidate();
        break;

      case 'ReceiveFeed':
        break;

      case 'SendFeed':
        cccService.feedHandler(data, sessionId, redisInfo);
        break;

      case 'SessionReserve':
        cccService.sessionReserve(data, sessionId, redisInfo);
        break;

      case 'SessionReserveEnd':
        cccService.endSessionReserve(data, sessionId, redisInfo);
        break;

      case 'ScreenShareConferenceEnd':
        cccService.endScreenShare(data, sessionId, redisInfo, socket);
        break;

      case 'SetVideo':
        cccService.setVideo(data, sessionId, redisInfo, socket);
        break;

      case 'SetAudio':
        cccService.setAudio(data, sessionId, redisInfo, socket);
        break;

      case 'ChangeName':
        cccService.changeName(data, sessionId, redisInfo, socket);
        break;

      case 'Disconnect':
        cccService.disconnect(socket, redisInfo, sessionId, signalSocketio);
        break;
    }
  });
}
