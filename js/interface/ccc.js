const logger = require('../utils/logger');

const cccService = require('../service/ccc');

module.exports = (socket, signalSocketio, redisInfo) => {
  const sessionId = socket.id;
  socket.on('disconnect', () => {
    logger.log('info', `[Socket : Disconnect Event] User Disconnection, Session Id is : ${sessionId}`);
    cccService.disconnect();
  });
  socket.on('knowledgetalk', async data => {
    logger.log('info', `[Web -> Signal] : ${JSON.stringify(data)}`);
    switch (data.eventOp || data.signalOp) {
      case 'CreateRoom':
        cccService.createRoom(data, sessionId);
        break;

      case 'DestroyRoom':
        cccService.destroyRoom(data);
        break;

      case 'RoomJoin':
        cccService.roomJoin(data, sessionId, redisInfo, socket);
        break;

      case 'StartSession':
        break;

      case 'SDP':
        cccService.sdp();
        break;

      case 'Candidate':
        cccService.candidate();
        break;

      case 'SessionReserve':
        cccService.sessionReserve();
        break;

      case 'SessionReserveEnd':
        cccService.endSessionReserve();
        break;

      case 'ScreenShareConferenceEnd':
        cccService.endScreenShare();
        break;

      case 'SetVideo':
        cccService.setVideo();
        break;

      case 'SetAudio':
        cccService.setAudio();
        break;

      case 'ChangeName':
        cccService.changeName();
        break;
    }
  });
}