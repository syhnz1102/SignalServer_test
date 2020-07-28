const logger = require('../utils/logger');

const cccService = require('../service/ccc');

module.exports = (socket, signalSocketio, redisInfo) => {
  const sessionId = socket.id;
  socket.on('disconnect', () => {
    logger.log('info', `[Socket : Disconnect Event] User Disconnection, Session Id is : ${sessionId}`);
    cccService.disconnect(socket, redisInfo, sessionId, signalSocketio);
  });
  socket.on('knowledgetalk', async data => {
    // logger.log('info', `[Web -> Signal] : ${JSON.stringify(data)}`);
    switch (data.eventOp || data.signalOp) {
      case 'CreateRoom':
        cccService.createRoom(data, sessionId, redisInfo);
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
    }
  });
}