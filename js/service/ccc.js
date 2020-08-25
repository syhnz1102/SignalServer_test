const logger = require('../utils/logger');
const utils = require('../utils/common');
const { signalSocket, coreConnector } = require('../repository/sender');
const sync = require('../repository/sync');
const core = require('../core/core');
const transaction = require('../repository/transaction');
const { license } = require('../server/license');
const config = require('../config');

exports.createRoom = async (data, sessionId, redis, socket) => {
  const room = await utils.makeId(8);
  const createResult = await core.roomCreate(redis, { roomId: room });
  console.log(createResult)
  if (createResult.code && createResult.code !== 200) {
    signalSocket.emit(sessionId, {
      eventOp: 'CreateRoom',
      code: '400',
      message: 'room is already exist.',
      roomId: room,
    }, data);
    return false;
  }

  await sync.createRoom(redis, room);
  signalSocket.emit(sessionId, {
    eventOp: 'CreateRoom',
    code: '200',
    message: 'OK',
    roomId: room
  }, data);

  transaction(sessionId, {
    eventOp: 'create',
    roomId: room,
    cpCode: data.cpCode || config.license.code,
    ip: socket.request.connection._peername.address
  })
}

exports.destroyRoom = async (data, sessionId, redis) => {
  await sync.deleteRoom(redis, data.roomId);

  signalSocket.emit(sessionId, {
    eventOp: 'DestroyRoom',
    code: '200',
    message: 'OK',
  }, data);
}

exports.roomJoin = async (data, sessionId, redis, socket, socketIo) => {
  const uid = await utils.makeId();
  logger.log('info', `[Socket : RoomJoin Event] ${uid} User RoomJoin, Session Id is : ${sessionId}, Room Id : ${data.roomId}`);

  let previous = await sync.getRoom(redis, data.roomId);
  if (!previous || !data.roomId) {
    // Room 없거나 Error 시
    signalSocket.emit(sessionId, {
      eventOp: 'RoomJoin',
      code: '400',
      message: 'Error',
      useMediaSvr: 'N'
    }, data);
  } else {
    // Room 있는 경우
    await core.register(socket, redis);
    await core.roomJoin(socketIo, socket, redis, { roomId: data.roomId });
    await sync.setUserInfo(redis, uid, sessionId, 'multi', 'ccc', data.roomId, data.cpCode || config.license.code);
    let enteredRoomInfo = await sync.enterRoom(redis, { uid, sessionId, roomId: data.roomId, userName: 'unknown' });

    signalSocket.emit(sessionId, {
      eventOp: 'RoomJoin',
      code: '200',
      message: 'OK',
      userId: uid,
      members: enteredRoomInfo.USERS,
      roomId: data.roomId,
      // serverInfo: commonFn.serverInfo.getTurn()
    }, data);

    transaction(sessionId, {
      eventOp: 'join',
      roomId: data.roomId,
      cpCode: data.cpCode || config.license.code,
      ip: socket.request.connection._peername.address,
      userId: uid,
      count: Object.keys(enteredRoomInfo.USERS).length
    })

    if (enteredRoomInfo.MULTITYPE === 'N') {
      signalSocket.broadcast(socket, data.roomId, {
        eventOp: 'StartSession',
        useMediaSvr: 'N',
        members: enteredRoomInfo.USERS,
        who: uid
      });
    } else if (enteredRoomInfo.MULTITYPE === 'Y') {
      if (previous.MULTITYPE === 'N') {
        // 기존 진행된 통화가 1:1 통화였다면
        try {
          let videoRoomData = await core.joinVideoRoom(sessionId, redis, { roomId: data.roomId, subscribe: true, type: 'cam', host: true });

          if(videoRoomData.code && videoRoomData.code !== 200){
            signalSocket.emit(sessionId, {
              eventOp: 'StartSession',
              code: 570,
              message: 'Media Server Error'
            }, data);

            signalSocket.broadcast(socket, data.roomId, {
              eventOp: 'StartSession',
              code: 570,
              message: 'Media Server Error'
            });

            return;
          }

          signalSocket.emit(sessionId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            changeView: true,
            who: uid,
            host: true
          }, data);

          signalSocket.broadcast(socket, data.roomId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            changeView: true,
            who: uid,
            host: false
          });
        } catch (e) {
          console.error(e);
        }
      } else if (previous.MULTITYPE === 'Y') {
        // 기존 진행된 통화가 다자간 통화였다면
        try {
          signalSocket.emit(sessionId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            who: uid,
            host: false
          }, data);

          signalSocket.broadcast(socket, data.roomId, {
            signalOp: 'Presence',
            members: enteredRoomInfo.USERS,
            who: uid,
            action: "join"
          });

        } catch (err) {
          console.log("JOIN WITH JANUS ERROR", err);
        }
      }
    }
  }
}

exports.sdp = async (data, sessionId, redis, socket) => {
  if (data.code === '200') return false;
  const roomInfo = await sync.getRoom(redis, data.roomId);
  if (roomInfo.MULTITYPE && roomInfo.MULTITYPE === 'N') {
    data.useMediaSvr = 'N';
    signalSocket.broadcast(socket, data.roomId, data);
  } else {
    signalSocket.emit(sessionId, {
      eventOp: data.eventOp,
      reqNo: data.reqNo,
      code: '200',
      roomId: data.roomId,
      message: 'OK'
    }, data);

    try {
      if (data.usage === 'cam') {

        if(!data.host && data.sdp.type === 'offer'){
          let videoRoomData = await core.joinVideoRoom(sessionId, redis, { roomId: data.roomId, subscribe: true, type: 'cam', host: false })

          if(videoRoomData.code && videoRoomData.code !== 200){
            signalSocket.emit(sessionId, {
              eventOp: 'StartSession',
              code: 570,
              message: 'Media Server Error'
            }, data);

            signalSocket.broadcast(socket, data.roomId, {
              eventOp: 'StartSession',
              code: 570,
              message: 'Media Server Error'
            });

            return;
          }

        }

        let result = await core.sdpVideoRoom(sessionId, redis, {
          type: data.usage,
          sdp: data.sdp,
          roomId: data.roomId,
          pluginId: data.pluginId
        })

        if (result.code && result.code !== 200) {
          console.log('error');
        }

        if (data.sdp.type === 'offer') {
          signalSocket.emit(sessionId, {
            eventOp: 'SDP',
            usage: data.usage,
            userId: data.userId,
            sdp: result.sdp,
            roomId: data.roomId,
            useMediaSvr: 'Y'
          }, data);
        }
      } else if (data.usage === 'screen') {
        if (data.sdp.type === 'offer') {
          let videoRoomData = await core.joinVideoRoom(sessionId, redis, { roomId: data.roomId, subscribe: false, type: 'screen' });

          if(videoRoomData.code && videoRoomData.code !== 200){
            signalSocket.emit(sessionId, {
              eventOp: 'SDP',
              code: 570,
              message: 'Media Server Error'
            }, data);

            signalSocket.broadcast(socket, data.roomId, {
              eventOp: 'SDP',
              code: 570,
              message: 'Media Server Error'
            });

            return;
          }

          let result = await core.sdpVideoRoom(sessionId, redis, {
            type: data.usage,
            sdp: data.sdp,
            roomId: data.roomId,
            pluginId: data.pluginId
          })

          if (result.code && result.code !== 200) {
            console.log('error');
          }

          signalSocket.emit(sessionId, {
            eventOp: 'SDP',
            usage: data.usage,
            userId: data.userId,
            sdp: result.sdp,
            roomId: data.roomId,
            useMediaSvr: 'Y'
          }, data);
        } else {
          let result = await core.sdpVideoRoom(sessionId, redis, {
            type: data.usage,
            sdp: data.sdp,
            roomId: data.roomId,
            pluginId: data.pluginId
          })

          if (result.code && result.code !== 200) {
            console.log('error');
          }
        }
      }
    } catch (err) {
      console.log("SDP ERROR OCCURRED.", err);
    }
  }
}

exports.feedHandler = async (data, sessionId, redis) => {
  // subscribe
  const result = await core.receiveFeed(sessionId, data);
  let displayId = result.display.indexOf('_screen') > -1 ? result.display : (await sync.getUserInfoBySocketId(redis, result.display)).ID;

  signalSocket.emit(sessionId, {
    eventOp: 'SDP',
    usage: result.type,
    userId: data.userId,
    sdp: result.sdp,
    pluginId: result.pluginId,
    displayId: displayId,
    roomId: data.roomId,
    useMediaSvr: 'Y'
  }, data);
}

exports.candidate = async () => {
}

exports.sessionReserve = async (data, sessionId, redis) => {
  let roomId = data.roomId;
  let userId = data.userId;
  let reserveReturnMsg = {};

  sync.isScreenSharePossible(redis, roomId, userId, function (possible) {
    if (possible === 'error') {
      // 190314 ivypark, sync function add catch block
      signalSocket.emit(sessionId, {
        eventOp: data.eventOp,
        code: '543',
        message: 'Internal Server Error.'
      }, data);
      return;
    }

    if (typeof possible === 'boolean' && possible) {
      sync.setScreenShareFlag(redis, roomId, userId, function (err) {
        if (err) {
          console.log(err);
          return;
        }
        reserveReturnMsg.eventOp = 'SessionReserve';
        reserveReturnMsg.reqNo = data.reqNo;
        reserveReturnMsg.code = '200';
        reserveReturnMsg.message = 'OK';
        signalSocket.emit(sessionId, reserveReturnMsg, data);
      })
    } else {
      reserveReturnMsg.eventOp = 'SessionReserve'
      reserveReturnMsg.reqNo = data.reqNo
      reserveReturnMsg.code = '440' // Resources already in use
      reserveReturnMsg.message = 'Resources already in use';
      signalSocket.emit(sessionId, reserveReturnMsg, data);
    }
  });
}

exports.endSessionReserve = async (data, sessionId, redis) => {
  let reserveEndReturnMsg = {};

  let err = await sync.resetScreenShareFlag(redis, data.userId, data.roomId);
  if (err === 'error') {
    // 190314 ivypark, sync function add catch block
    signalSocket.emit(sessionId, {
      eventOp: data.eventOp,
      code: '543',
      message: 'Internal Server Error'
    });
    console.log('Room Id를 찾을 수 없음 ');
    logger.log('warn', 'Room Id를 찾을 수 없음 , room ID가 잘못 전송 된 경우.');
    return;
  } else if (err === 'user error') {
    signalSocket.emit(sessionId, {
      eventOp: data.eventOp,
      code: '440',
      message: 'Resources already in use'
    });
    return;
  }

  if (err) {
    reserveEndReturnMsg.eventOp = 'SessionReserveEnd';
    reserveEndReturnMsg.reqNo = data.reqNo;
    reserveEndReturnMsg.code = '559'; // DB Unknown Error
    reserveEndReturnMsg.message = 'DB Unknown Error';

    signalSocket.emit(sessionId, reserveEndReturnMsg);
    return;
  }

  reserveEndReturnMsg.eventOp = 'SessionReserveEnd';
  reserveEndReturnMsg.reqNo = data.reqNo;
  reserveEndReturnMsg.code = '200';
  reserveEndReturnMsg.message = 'OK';

  signalSocket.emit(sessionId, reserveEndReturnMsg);
}

exports.endScreenShare = async (data, sessionId, redis, socket) => {
  if (!data.code) {
    if (data.useMediaSvr === 'Y') {
      await core.exitVideoRoom(socket, redis, { type: 'screen', roomId: data.roomId })
    }

    let recvData = {
      'eventOp': 'ScreenShareConferenceEnd',
      'reqNo': data.reqNo,
      'roomId': data.roomId,
      'code': '200',
      'message': 'OK'
    };

    let endSenderData = {
      'eventOp': "ScreenShareConferenceEndSvr",
      'userId': data.userId,
      'roomId': data.roomId,
    };

    signalSocket.emit(sessionId, recvData);
    signalSocket.broadcast(socket, data.roomId, endSenderData);
  }
}

exports.setVideo = async (data, sessionId, redis, socket) => {
  await sync.changeItemInRoom(redis, data.roomId, data.userId, 'VIDEO', data.status);
  signalSocket.broadcast(socket, data.roomId, {
    'signalOp': 'SetVideo',
    'userId': data.userId,
    'reqDate': data.reqDate,
    'roomId': data.roomId,
    'status': data.status
  });
}

exports.setAudio = async (data, sessionId, redis, socket) => {
  await sync.changeItemInRoom(redis, data.roomId, data.userId, 'AUDIO', data.status);
  signalSocket.broadcast(socket, data.roomId, {
    'signalOp': 'SetAudio',
    'userId': data.userId,
    'reqDate': data.reqDate,
    'roomId': data.roomId,
    'status': data.status
  });
}

exports.changeName = async (data, sessionId, redis, socket) => {
  await license.user.insert(sessionId, { cpCode: data.cpCode || config.license.code, name: data.name }, socket);
  await sync.changeItemInRoom(redis, data.roomId, data.userId, 'NAME', data.name);
  signalSocket.broadcast(socket, data.roomId, {
    signalOp: 'ChangeName',
    userId: data.userId,
    name: data.name
  });
}

exports.disconnect = async (socket, redis, sessionId, socketIo) => {
  let o = await sync.getUserInfoBySocketId(redis, sessionId);
  if (!o || !Object.keys(o).length) return;

  // FIXME: 200728 ivypark, add process when if multiple room id
  // if (Object.keys(o.roomInfo).length > 1) return false;

  let roomId = Object.keys(o.roomInfo)[0];
  let userId = o.ID;
  let cp = o.CP;
  let roomInfo = await sync.getRoom(redis, roomId);

  if (roomInfo.SCREEN && userId === roomInfo.SCREEN.USERID) {
    await sync.resetScreenShareFlag(redis, userId, roomId);
    signalSocket.broadcast(socket, roomId, {
      eventOp: 'ScreenShareConferenceEndSvr',
      roomId,
      code: '200',
      message: 'OK'
    });
  }

  transaction(sessionId, {
    eventOp: 'exit',
    roomId: roomId,
    userId: userId,
    cpCode: cp || config.license.code,
    ip: socket.request.connection._peername.address,
    count: Object.keys(roomInfo.USERS).length
  })

  signalSocket.broadcast(socket, roomId, {
    signalOp: 'Presence',
    userId: userId,
    action: 'exit'
  });

  await sync.leaveRoom(redis, roomId, sessionId);
  await core.disconnect(socket, redis, socketIo);
}