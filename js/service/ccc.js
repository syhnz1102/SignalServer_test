const logger = require('../utils/logger');
const utils = require('../utils/common');
const { signalSocket, coreConnector } = require('../repository/sender');
const sync = require('../repository/sync');
const core = require('../core/core');
const commonFn = require('../core/util');
const transaction = require('../repository/transaction');
const charging = require('../repository/charging');
const { license } = require('../server/license');
const config = require('../config');
const common = require('../utils/common')

exports.createRoom = async (data, sessionId, redis, socket) => {
  const room = await utils.makeId(8);
  const createResult = await core.roomCreate(redis, { roomId: room });
  if (createResult.code) {
    signalSocket.emit(sessionId, {
      eventOp: 'CreateRoom',
      code: createResult.code,
      message: await common.codeToMsg(400),
      roomId: room,
    }, data);
    return false;
  }

  await sync.createRoom(redis, room);
  signalSocket.emit(sessionId, {
    eventOp: 'CreateRoom',
    code: '200',
    message: await common.codeToMsg(200),
    roomId: room
  }, data);

  await transaction(sessionId, {
    opCode: 'CreateRoom',
    roomId: room,
    cpCode: data.cpCode || config.license.code,
    clientIp: socket.request.connection._peername.address,
    resultCode: '200'
  })
}

exports.destroyRoom = async (data, sessionId, redis, socket) => {
  await sync.deleteRoom(redis, data.roomId);

  signalSocket.emit(sessionId, {
    eventOp: 'DestroyRoom',
    code: '200',
    message: await common.codeToMsg(200),
  }, data);

  await transaction(sessionId, {
    opCode: 'DestroyRoom',
    roomId: data.roomId,
    cpCode: data.cpCode || config.license.code,
    clientIp: socket.request.connection._peername.address
  })

}

exports.roomJoin = async (data, sessionId, redis, socket, socketIo) => {
  const uid = await utils.makeId();

  let previous = await sync.getRoom(redis, data.roomId);
  if (!previous || !data.roomId) {
    // Room 없거나 Error 시
    signalSocket.emit(sessionId, {
      eventOp: 'RoomJoin',
      code: '400',
      message: await common.codeToMsg(400),
      useMediaSvr: 'N'
    }, data);

    await transaction(sessionId, {
      opCode: 'RoomJoin',
      roomId: data.roomId,
      cpCode: data.cpCode || config.license.code,
      clientIp: socket.request.connection._peername.address,
      userId: uid,
      userCount: 1,
      resultCode: '400'
    })

  } else {
    // Room 있는 경우
    await core.register(socket, redis);
    await core.roomJoin(socketIo, socket, redis, { roomId: data.roomId });
    await sync.setUserInfo(redis, uid, sessionId, 'multi', 'ccc', data.roomId, data.cpCode || config.license.code);
    let enteredRoomInfo = await sync.enterRoom(redis, { uid, sessionId, roomId: data.roomId, userName: 'unknown' });

    signalSocket.emit(sessionId, {
      eventOp: 'RoomJoin',
      code: '200',
      message: await common.codeToMsg(200),
      userId: uid,
      members: enteredRoomInfo.USERS,
      roomId: data.roomId,
      // serverInfo: commonFn.serverInfo.getTurn()
    }, data);

    await transaction(sessionId, {
      opCode: 'RoomJoin',
      roomId: data.roomId,
      cpCode: data.cpCode || config.license.code,
      clientIp: socket.request.connection._peername.address,
      userId: uid,
      userCount: Object.keys(enteredRoomInfo.USERS).length,
      resultCode: '200'
    })

    if (enteredRoomInfo.MULTITYPE === 'N') {
      signalSocket.broadcast(socket, data.roomId, {
        eventOp: 'StartSession',
        useMediaSvr: 'N',
        members: enteredRoomInfo.USERS,
        who: uid
      });

      await transaction(sessionId, {
        opCode: `StartSession`,
        roomId: data.roomId,
        cpCode: data.cpCode || config.license.code,
        clientIp: socket.request.connection._peername.address,
        userId: data.userId,
        resultCode: '200'
      })

    } else if (enteredRoomInfo.MULTITYPE === 'Y') {
      if (previous.MULTITYPE === 'N') {
        // 기존 진행된 통화가 1:1 통화였다면
        try {
          let videoRoomData = await core.joinVideoRoom(sessionId, redis, { roomId: data.roomId, subscribe: true, type: 'cam', host: true });

          if(videoRoomData.code && videoRoomData.code !== '200'){

            signalSocket.room(data.roomId, {
              eventOp: 'StartSession',
              code: videoRoomData.code,
              message: await common.codeToMsg(parseInt(videoRoomData.code))
            });

            await transaction(sessionId, {
              opCode: `StartSession`,
              roomId: data.roomId,
              cpCode: data.cpCode || config.license.code,
              clientIp: socket.request.connection._peername.address,
              userId: data.userId,
              resultCode : videoRoomData.code
            })

            return;
          }

          //방장에게 보내는 Message
          signalSocket.emit(sessionId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            changeView: true,
            who: uid,
            host: true
          }, data);

          //기존 통화중인 user 에 보내는 Message
          signalSocket.broadcast(socket, data.roomId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            changeView: true,
            who: uid,
            host: false
          });

          await transaction(sessionId, {
            opCode: `StartSession`,
            roomId: data.roomId,
            cpCode: data.cpCode || config.license.code,
            clientIp: socket.request.connection._peername.address,
            userId: data.userId,
            resultCode : '200'
          })

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

exports.videoRoomJoin = async (data, sessionId, redis, socket, socketIo) => {
  const uid = await utils.makeId();
  logger.log('info', `[Socket : VideoRoomJoin Event] ${uid} User VideoRoomJoin, Session Id is : ${sessionId}, Room Id : ${data.roomId}`);

  let previous = await sync.getRoom(redis, data.roomId);
  if (!previous || !data.roomId) {
    // Room 없거나 Error 시
    signalSocket.emit(sessionId, {
      eventOp: 'VideoRoomJoin',
      code: '400',
      message: await common.codeToMsg(400),
      useMediaSvr: 'Y'
    }, data);

  } else {
    // Room 있는 경우
    await core.register(socket, redis);
    await core.roomJoin(socketIo, socket, redis, { roomId: data.roomId });
    await sync.setUserInfo(redis, uid, sessionId, 'multi', 'ccc', data.roomId, data.cpCode || config.license.code);
    let enteredRoomInfo = await sync.enterRoom(redis, { uid, sessionId, roomId: data.roomId, userName: data.userName ? data.userName:'unknown', multiType: 'Y' });

    //처음 입장하는 경우
    if(data.host){
      let videoRoomData = await core.joinVideoRoom(sessionId, redis, { roomId: data.roomId, subscribe: true, type: 'cam', host: true });
      if(videoRoomData.code && videoRoomData.code !== '200'){

        signalSocket.room(data.roomId, {
          eventOp: 'StartSession',
          code: videoRoomData.code,
          message: await common.codeToMsg(parseInt(videoRoomData.code))
        });

        return;
      }

      //방장에게 보내는 Message
      signalSocket.emit(sessionId, {
        eventOp: 'StartSession',
        useMediaSvr: 'Y',
        members: enteredRoomInfo.USERS,
        changeView: true,
        who: uid,
        host: true
      }, data);

      signalSocket.emit(sessionId, {
        eventOp: 'VideoRoomJoin',
        code: '200',
        message: await common.codeToMsg(200),
        userId: uid,
        members: enteredRoomInfo.USERS,
        roomId: data.roomId
      }, data);
    }
    //방장이 아니면 그대로 입장
    else {
      signalSocket.emit(sessionId, {
        eventOp: 'VideoRoomJoin',
        code: '200',
        message: await common.codeToMsg(200),
        userId: uid,
        members: enteredRoomInfo.USERS,
        roomId: data.roomId
      }, data);

      try {
        signalSocket.emit(sessionId,{
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

exports.sdp = async (data, sessionId, redis, socket) => {
  if (data.code === '200') return false;
  let roomInfo = await sync.getRoom(redis, data.roomId);

  if (roomInfo.MULTITYPE && roomInfo.MULTITYPE === 'N') {
    data.useMediaSvr = 'N';


    //TODO 1:1 시작 시간 기록 screen만 사용하는 경우는?
    if(data.usage === 'cam'){

      let userData = await sync.getUserInfoBySocketId(redis, sessionId);

      //같은 방에서 새로 시작할 경우 이전 기록 반영
      if(userData.P2P_START) {

        await charging(sessionId, {
          cpCode: data.cpCode,
          userId: data.userId,
          userName: userData.userName?userData.userName:'익명',
          clientIp: socket.request.connection._peername.address,
          roomId: data.roomId,
          startDate: userData.P2P_START,
          usageTime: commonFn.usageTime(userData.P2P_START, commonFn.getDate()),
          usageType: 'P2P'
        })

      }

      userData.P2P_START = commonFn.getDate()
      await sync.setUserInfoWithSocketId(redis, sessionId, userData);
    }

    signalSocket.broadcast(socket, data.roomId, data);

    await transaction(sessionId, {
      opCode: `SDP(${data.sdp.type}_${data.usage})`,
      roomId: data.roomId,
      cpCode: data.cpCode || config.license.code,
      clientIp: socket.request.connection._peername.address,
      userId: data.userId,
      resultCode: '200'
    })


  } else {
    signalSocket.emit(sessionId, {
      eventOp: data.eventOp,
      reqNo: data.reqNo,
      code: '200',
      roomId: data.roomId,
      message: await common.codeToMsg(200)
    }, data);

    try {
      if (data.usage === 'cam') {

        if(!data.host && data.sdp.type === 'offer'){
          let userData = await sync.getUserInfoBySocketId(redis, sessionId);

          //P2P 종료로 인해 과금 반영
          if(userData.P2P_START){
            userData.P2P_END = commonFn.getDate();

            await charging(sessionId, {
              cpCode: data.cpCode,
              userId: data.userId,
              userName: userData.userName?userData.userName:'익명',
              clientIp: socket.request.connection._peername.address,
              roomId: data.roomId,
              startDate: userData.P2P_START,
              usageTime: commonFn.usageTime(userData.P2P_START, userData.P2P_END),
              usageType: 'P2P'
            })

            userData.P2P_START = '';
            userData.P2P_END = '';
            await sync.setUserInfoWithSocketId(redis, sessionId, userData);
          }

          //다자간 전환을 위해 Media Server VideoRoom Join
          let videoRoomData = await core.joinVideoRoom(sessionId, redis, { roomId: data.roomId, subscribe: true, type: 'cam', host: false })

          if(videoRoomData.code && videoRoomData.code !== '200'){
            signalSocket.room(data.roomId, {
              eventOp: 'SDP',
              code: videoRoomData.code,
              message: await common.codeToMsg(parseInt(videoRoomData))
            });

            await transaction(sessionId, {
              opCode: 'SDP(offer_cam)',
              roomId: data.roomId,
              cpCode: data.cpCode || config.license.code,
              clientIp: socket.request.connection._peername.address,
              userId: data.userId,
              resultCode: videoRoomData.code
            })

            return;
          }

        }

        let result = await core.sdpVideoRoom(sessionId, redis, {
          type: data.usage,
          sdp: data.sdp,
          roomId: data.roomId,
          pluginId: data.pluginId
        })

        if (result.code && result.code !== '200') {
          console.log('error');

          await transaction(sessionId, {
            opCode: `SDP(${data.sdp.type}_cam)`,
            roomId: data.roomId,
            cpCode: data.cpCode || config.license.code,
            clientIp: socket.request.connection._peername.address,
            userId: data.userId,
            resultCode: result.code
          })

          return false;
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

          await transaction(sessionId, {
            opCode: 'SDP(offer_cam)',
            roomId: data.roomId,
            cpCode: data.cpCode || config.license.code,
            clientIp: socket.request.connection._peername.address,
            userId: data.userId,
            resultCode: '200'
          })

          await transaction(sessionId, {
            opCode: 'SDP(answer_cam)',
            roomId: data.roomId,
            cpCode: data.cpCode || config.license.code,
            clientIp: socket.request.connection._peername.address,
            userId: data.userId,
            resultCode: '200'
          })

          let userData = await sync.getUserInfoBySocketId(redis, sessionId);
          userData.P2P_END = commonFn.getDate()
          userData.N2N_START = commonFn.getDate()
          await sync.setUserInfoWithSocketId(redis, sessionId, userData);

        } else {
          transaction(sessionId, {
            opCode: 'SDP(answer_cam)',
            roomId: data.roomId,
            cpCode: data.cpCode || config.license.code,
            clientIp: socket.request.connection._peername.address,
            userId: data.userId,
            resultCode: '200'
          })
        }

      } else if (data.usage === 'screen') {
        if (data.sdp.type === 'offer') {
          let videoRoomData = await core.joinVideoRoom(sessionId, redis, { roomId: data.roomId, subscribe: false, type: 'screen' });

          if(videoRoomData.code && videoRoomData.code !== '200'){
            signalSocket.emit(sessionId, {
              eventOp: 'SDP',
              code: '570',
              message: await common.codeToMsg(570)
            }, data);

            signalSocket.broadcast(socket, data.roomId, {
              eventOp: 'SDP',
              code: '570',
              message: await common.codeToMsg(570)
            });

            transaction(sessionId, {
              opCode: 'SDP(offer_screen)',
              roomId: data.roomId,
              cpCode: data.cpCode || config.license.code,
              clientIp: socket.request.connection._peername.address,
              userId: data.userId,
              resultCode: videoRoomData.code
            })

            return;
          }

          let result = await core.sdpVideoRoom(sessionId, redis, {
            type: data.usage,
            sdp: data.sdp,
            roomId: data.roomId,
            pluginId: data.pluginId
          })

          if (result.code && result.code !== '200') {
            console.log('error');

            transaction(sessionId, {
              opCode: 'SDP(offer_screen)',
              roomId: data.roomId,
              cpCode: data.cpCode || config.license.code,
              clientIp: socket.request.connection._peername.address,
              userId: data.userId,
              resultCode: result.code
            })

            return false;
          }

          signalSocket.emit(sessionId, {
            eventOp: 'SDP',
            usage: data.usage,
            userId: data.userId,
            sdp: result.sdp,
            roomId: data.roomId,
            useMediaSvr: 'Y'
          }, data);

          await transaction(sessionId, {
            opCode: 'SDP(offer_screen)',
            roomId: data.roomId,
            cpCode: data.cpCode || config.license.code,
            clientIp: socket.request.connection._peername.address,
            userId: data.userId,
            resultCode: '200'
          })

          await transaction(sessionId, {
            opCode: 'SDP(answer_screen)',
            roomId: data.roomId,
            cpCode: data.cpCode || config.license.code,
            clientIp: socket.request.connection._peername.address,
            userId: data.userId,
            resultCode: '200'
          })


        } else {
          let result = await core.sdpVideoRoom(sessionId, redis, {
            type: data.usage,
            sdp: data.sdp,
            roomId: data.roomId,
            pluginId: data.pluginId
          })

          if (result.code && result.code !== '200') {

            await transaction(sessionId, {
              opCode: 'SDP(answer_screen)',
              roomId: data.roomId,
              cpCode: data.cpCode || config.license.code,
              clientIp: socket.request.connection._peername.address,
              userId: data.userId,
              resultCode: result.code
            })

            return false;

          } else {

            await transaction(sessionId, {
              opCode: 'SDP(answer_screen)',
              roomId: data.roomId,
              cpCode: data.cpCode || config.license.code,
              clientIp: socket.request.connection._peername.address,
              userId: data.userId,
              resultCode: '200'
            })

          }
        }
      }
    } catch (err) {
      console.log("SDP ERROR OCCURRED.", err);
    }
  }
}

exports.candidate = async () => {
}

exports.sessionReserve = async (data, sessionId, redis, socket) => {
  let roomId = data.roomId;
  let userId = data.userId;
  let reserveReturnMsg = {};

  sync.isScreenSharePossible(redis, roomId, userId, async (possible) => {
    if (possible === 'error') {
      // 190314 ivypark, sync function add catch block
      signalSocket.emit(sessionId, {
        eventOp: data.eventOp,
        code: '543',
        message: await common.codeToMsg(543)
      }, data);

      await transaction(sessionId, {
        opCode: 'SessionReserve',
        roomId: data.roomId,
        cpCode: data.cpCode || config.license.code,
        clientIp: socket.request.connection._peername.address,
        userId: data.userId,
        resultCode: '543'
      })

      return;
    }

    if (typeof possible === 'boolean' && possible) {
      sync.setScreenShareFlag(redis, roomId, userId, async err => {
        if (err) {
          console.log(err);

          await transaction(sessionId, {
            opCode: 'SessionReserve',
            roomId: data.roomId,
            cpCode: data.cpCode || config.license.code,
            clientIp: socket.request.connection._peername.address,
            userId: data.userId,
            resultCode: '500'
          })

          return;
        }

        reserveReturnMsg.eventOp = 'SessionReserve';
        reserveReturnMsg.reqNo = data.reqNo;
        reserveReturnMsg.code = '200';
        reserveReturnMsg.message = await common.codeToMsg(200);
        signalSocket.emit(sessionId, reserveReturnMsg, data);

        await transaction(sessionId, {
          opCode: 'SessionReserve',
          roomId: data.roomId,
          cpCode: data.cpCode || config.license.code,
          clientIp: socket.request.connection._peername.address,
          userId: data.userId,
          resultCode: '200'
        })

      })
    } else {
      reserveReturnMsg.eventOp = 'SessionReserve'
      reserveReturnMsg.reqNo = data.reqNo
      reserveReturnMsg.code = '440' // Resources already in use
      reserveReturnMsg.message = await common.codeToMsg(440);
      signalSocket.emit(sessionId, reserveReturnMsg, data);

      await transaction(sessionId, {
        opCode: 'SessionReserve',
        roomId: data.roomId,
        cpCode: data.cpCode || config.license.code,
        clientIp: socket.request.connection._peername.address,
        userId: data.userId,
        resultCode: '440'
      })

    }
  });
}

exports.endSessionReserve = async (data, sessionId, redis, socket) => {
  let reserveEndReturnMsg = {};

  let err = await sync.resetScreenShareFlag(redis, data.userId, data.roomId);
  if (err === 'error') {
    // 190314 ivypark, sync function add catch block
    signalSocket.emit(sessionId, {
      eventOp: data.eventOp,
      code: '543',
      message: await common.codeToMsg(543)
    });

    logger.log('warn', 'Room Id를 찾을 수 없음 , room ID가 잘못 전송 된 경우.');

    await transaction(sessionId, {
      opCode: 'SessionReserveEnd',
      roomId: data.roomId,
      cpCode: data.cpCode || config.license.code,
      clientIp: socket.request.connection._peername.address,
      userId: data.userId,
      resultCode: '543'
    })

    return;
  } else if (err === 'user error') {
    signalSocket.emit(sessionId, {
      eventOp: data.eventOp,
      code: '440',
      message: await common.codeToMsg(440)
    });

    await transaction(sessionId, {
      opCode: 'SessionReserveEnd',
      roomId: data.roomId,
      cpCode: data.cpCode || config.license.code,
      clientIp: socket.request.connection._peername.address,
      userId: data.userId,
      resultCode: '440'
    })

    return;
  }

  if (err) {
    reserveEndReturnMsg.eventOp = 'SessionReserveEnd';
    reserveEndReturnMsg.reqNo = data.reqNo;
    reserveEndReturnMsg.code = '559'; // DB Unknown Error
    reserveEndReturnMsg.message = await common.codeToMsg(559);

    signalSocket.emit(sessionId, reserveEndReturnMsg);

    await transaction(sessionId, {
      opCode: 'SessionReserveEnd',
      roomId: data.roomId,
      cpCode: data.cpCode || config.license.code,
      clientIp: socket.request.connection._peername.address,
      userId: data.userId,
      resultCode: '559'
    })

    return;
  }

  reserveEndReturnMsg.eventOp = 'SessionReserveEnd';
  reserveEndReturnMsg.reqNo = data.reqNo;
  reserveEndReturnMsg.code = '200';
  reserveEndReturnMsg.message = await common.codeToMsg(200);

  signalSocket.emit(sessionId, reserveEndReturnMsg);

  await transaction(sessionId, {
    opCode: 'SessionReserveEnd',
    roomId: data.roomId,
    cpCode: data.cpCode || config.license.code,
    clientIp: socket.request.connection._peername.address,
    userId: data.userId,
    resultCode: '200'
  })
}

exports.endScreenShare = async (data, sessionId, redis, socket) => {
  if (!data.code) {
    if (data.useMediaSvr === 'Y') {
      await core.exitVideoRoom(socket, redis, { type: 'screen', roomId: data.roomId })
    }

    let recvData = {
      eventOp: 'ScreenShareConferenceEnd',
      reqNo: data.reqNo,
      roomId: data.roomId,
      code: '200',
      message: await common.codeToMsg(200)
    };

    let endSenderData = {
      eventOp: "ScreenShareConferenceEndSvr",
      userId: data.userId,
      roomId: data.roomId,
    };

    signalSocket.emit(sessionId, recvData);
    signalSocket.broadcast(socket, data.roomId, endSenderData);

    await transaction(sessionId, {
      opCode: 'ScreenShareConferenceEnd',
      roomId: data.roomId,
      cpCode: data.cpCode || config.license.code,
      clientIp: socket.request.connection._peername.address,
      userId: data.userId,
      resultCode: '200'
    })
  }
}

exports.setVideo = async (data, sessionId, redis, socket) => {
  await sync.changeItemInRoom(redis, data.roomId, data.userId, 'VIDEO', data.status);
  signalSocket.broadcast(socket, data.roomId, {
    signalOp: 'SetVideo',
    userId: data.userId,
    reqDate: data.reqDate,
    roomId: data.roomId,
    status: data.status
  });
}

exports.setAudio = async (data, sessionId, redis, socket) => {
  await sync.changeItemInRoom(redis, data.roomId, data.userId, 'AUDIO', data.status);
  signalSocket.broadcast(socket, data.roomId, {
    signalOp: 'SetAudio',
    userId: data.userId,
    reqDate: data.reqDate,
    roomId: data.roomId,
    status: data.status
  });
}

exports.changeName = async (data, sessionId, redis, socket) => {
  await license.user.insert(sessionId, { cpCode: data.cpCode || config.license.code, name: data.name }, socket);
  await sync.changeItemInRoom(redis, data.roomId, data.userId, 'NAME', data.name);
  let userData = await sync.getUserInfoBySocketId(redis, sessionId);
  userData.userName = data.name;

  await sync.setUserInfoWithSocketId(redis, sessionId, userData);

  signalSocket.broadcast(socket, data.roomId, {
    signalOp: 'ChangeName',
    userId: data.userId,
    name: data.name
  });
}

exports.exitRoom = async (socket, redis, sessionId) => {
  let o = await sync.getUserInfoBySocketId(redis, sessionId);
  if (!o || !Object.keys(o).length) return;

  let roomId = Object.keys(o.roomInfo)[0];
  let userId = o.ID;
  let cp = o.CP;
  let roomInfo = await sync.getRoom(redis, roomId);

  if(roomInfo.MULTITYPE && roomInfo.MULTITYPE === 'N' && o.P2P_START){

    await charging(sessionId, {
      cpCode: cp,
      userId: userId,
      userName: o.userName?o.userName:'익명',
      clientIp: socket.request.connection._peername.address,
      roomId: roomId,
      startDate: o.P2P_START,
      usageTime: commonFn.usageTime(o.P2P_START, o.P2P_END),
      usageType: 'P2P'
    })

    o.P2P_START = '';
    o.P2P_END = '';
    await sync.setUserInfoWithSocketId(redis, sessionId, o);
  }

  else if(roomInfo.MULTITYPE && roomInfo.MULTITYPE === 'Y' && o.N2N_START){

    if(o.P2P_START && o.P2P_END){
      await charging(sessionId, {
        cpCode: cp,
        userId: userId,
        userName: o.userName?o.userName:'익명',
        clientIp: socket.request.connection._peername.address,
        roomId: roomId,
        startDate: o.P2P_START,
        usageTime: commonFn.usageTime(o.P2P_START, o.P2P_END),
        usageType: 'P2P'
      })

      //과금 반영 후 Sync Server 시간정보 초기화
      o.P2P_START = '';
      o.P2P_END = '';
    }

    await charging(sessionId, {
      cpCode: cp,
      userId: userId,
      userName: o.userName?o.userName:'익명',
      clientIp: socket.request.connection._peername.address,
      roomId: roomId,
      startDate: o.N2N_START,
      usageTime: commonFn.usageTime(o.N2N_START, o.N2N_END),
      usageType: 'N2N'
    })

    //과금 반영 후 Sync Server 시간정보 초기화
    o.N2N_START = '';
    o.N2N_END = '';
    await sync.setUserInfoWithSocketId(redis, sessionId, o);

  }

  await transaction(sessionId, {
    opCode: 'ExitRoom',
    roomId: roomId,
    userId: userId,
    cpCode: cp || config.license.code,
    clientIp: socket.request.connection._peername.address,
    count: Object.keys(roomInfo.USERS).length,
    resultCode: '200'
  })

  signalSocket.emit(sessionId, {
    eventOp: "ExitRoom",
    code: '200',
    message: 'OK',
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

  if(roomInfo.MULTITYPE && roomInfo.MULTITYPE === 'N' && o.P2P_START){
    o.P2P_END = commonFn.getDate()
    await charging(sessionId, {
      cpCode: cp,
      userId: userId,
      userName: o.userName?o.userName:'익명',
      clientIp: socket.request.connection._peername.address,
      roomId: roomId,
      startDate: o.P2P_START,
      usageTime: commonFn.usageTime(o.P2P_START, o.P2P_END),
      usageType: 'P2P'
    })

    //과금 반영 후 Sync Server 시간정보 초기화
    o.P2P_START = '';
    o.P2P_END = '';
    await sync.setUserInfoWithSocketId(redis, sessionId, o);
  }

  else if(roomInfo.MULTITYPE && roomInfo.MULTITYPE === 'Y' && o.N2N_START){

    //N2N 전환 전 P2P를 사용했다면 과금 반영
    if(o.P2P_START && o.P2P_END){

      await charging(sessionId, {
        cpCode: cp,
        userId: userId,
        userName: o.userName?o.userName:'익명',
        clientIp: socket.request.connection._peername.address,
        roomId: roomId,
        startDate: o.P2P_START,
        usageTime: commonFn.usageTime(o.P2P_START, o.P2P_END),
        usageType: 'P2P'
      })

      //과금 반영 후 Sync Server 시간정보 초기화
      o.P2P_START = '';
      o.P2P_END = '';
    }

    o.N2N_END = commonFn.getDate();
    await charging(sessionId, {
      cpCode: cp,
      userId: userId,
      userName: o.userName?o.userName:'익명',
      clientIp: socket.request.connection._peername.address,
      roomId: roomId,
      startDate: o.N2N_START,
      usageTime: commonFn.usageTime(o.N2N_START, o.N2N_END),
      usageType: 'N2N'
    })

    //과금 반영 후 Sync Server 시간정보 초기화
    o.N2N_START = '';
    o.N2N_END = '';
    await sync.setUserInfoWithSocketId(redis, sessionId, o);

  }

  if (roomInfo.SCREEN && userId === roomInfo.SCREEN.USERID) {
    await sync.resetScreenShareFlag(redis, userId, roomId);
    signalSocket.broadcast(socket, roomId, {
      eventOp: 'ScreenShareConferenceEndSvr',
      roomId,
      code: '200',
      message: await common.codeToMsg(200)
    });
  }

  await transaction(sessionId, {
    opCode: 'Disconnect',
    roomId: roomId,
    userId: userId,
    cpCode: cp || config.license.code,
    clientIp: socket.request.connection._peername.address,
    count: Object.keys(roomInfo.USERS).length,
    resultCode: '200'
  })

  signalSocket.broadcast(socket, roomId, {
    signalOp: 'Presence',
    userId: userId,
    action: 'exit'
  });

  await sync.leaveRoom(redis, roomId, sessionId);
  await core.disconnect(socket, redis, socketIo);
}

exports.keepAlive = async (socket, data, keepAlive) => {
  clearTimeout(keepAlive[socket.id]);

  signalSocket.emit(socket.id,{
    eventOp:'KeepAlive',
    code: '200',
    message: 'OK'
  })

  keepAlive[socket.id] = setTimeout(() => {
    // socket.disconnect(true);
    logger.log('info', `[Socket : KeepAlive] KeepAlive Timeout!, Session Id is : ${socket.id}`);
  },60000)
}

exports.startCall = async (data, sessionId, redis, socket) => {

  await transaction(sessionId, {
    opCode: 'StartCall',
    roomId: data.roomId,
    userId: data.userId,
    cpCode: data.cpCode || config.license.code,
    clientIp: socket.request.connection._peername.address,
    resultCode: '200'
  })

  signalSocket.emit(socket.id,{
    eventOp:'StartCall',
    code: '200',
    message: 'OK'
  })
}

exports.endCall = async (data, sessionId, redis, socket) => {

  let userData = await sync.getUserInfoBySocketId(redis, sessionId);
  let roomData = await sync.getRoom(redis, data.roomId);

  if(roomData.MULTITYPE && roomData.MULTITYPE === 'N' && userData.P2P_START){
    userData.P2P_END = commonFn.getDate();

    await charging(sessionId, {
      cpCode: data.cpCode,
      userId: data.userId,
      userName: userData.userName?userData.userName:'익명',
      clientIp: socket.request.connection._peername.address,
      roomId: data.roomId,
      startDate: userData.P2P_START,
      usageTime: commonFn.usageTime(userData.P2P_START, userData.P2P_END),
      usageType: 'P2P'
    })

    //과금 반영 후 Sync Server 시간정보 초기화
    userData.P2P_START = '';
    userData.P2P_END = '';

    await sync.setUserInfoWithSocketId(redis, sessionId, userData);
  }
  else if(roomData.MULTITYPE && roomData.MULTITYPE === 'Y' && userData.N2N_START){
    userData.N2N_END = commonFn.getDate();

    await charging(sessionId, {
      cpCode: data.cpCode,
      userId: data.userId,
      userName: userData.userName?userData.userName:'익명',
      clientIp: socket.request.connection._peername.address,
      roomId: data.roomId,
      startDate: userData.N2N_START,
      usageTime: commonFn.usageTime(userData.N2N_START, userData.N2N_END),
      usageType: 'N2N'
    })

    //과금 반영 후 Sync Server 시간정보 초기화
    userData.N2N_START = '';
    userData.N2N_END = '';

    await sync.setUserInfoWithSocketId(redis, sessionId, userData);
  }

  await transaction(sessionId, {
    opCode: 'EndCall',
    roomId: data.roomId,
    userId: data.userId,
    cpCode: data.cpCode || config.license.code,
    clientIp: socket.request.connection._peername.address,
    resultCode: '200'
  })

  signalSocket.emit(socket.id,{
    eventOp:'EndCall',
    code: '200',
    message: 'OK'
  })
}

exports.kickOut = async (data, sessionId, redis, socket) => {
  if (!data.roomId || !data.userId) {
    signalSocket.emit(socket.id,{
      eventOp: 'KickOut',
      code: '400',
      message: 'Request Error.'
    })
  }

  transaction(sessionId, {
    eventOp: 'KickOut',
    roomId: data.roomId,
    userId: data.userId,
    cpCode: data.cpCode || config.license.code,
    ip: socket.request.connection._peername.address
  })

  const obj = await sync.getRoom(redis, data.roomId);
  if (obj.ADMIN !== sessionId) {
    return signalSocket.emit(socket.id,{
      eventOp: 'KickOut',
      code: '413',
      message: 'Permission Error.'
    })
  } else {
    signalSocket.emit(socket.id,{
      eventOp: 'KickOut',
      code: '200',
      message: 'OK'
    })

    signalSocket.emit((await sync.getUserInfoByUserId(redis, data.userId)).SOCKET_ID, {
      signalOp: 'Presence',
      userId: data.userId,
      action: 'kick'
    });
  }
}

exports.chat = async (data, sessionId, redis, socket) => {
  signalSocket.broadcast(socket, data.roomId, {
    signalOp: 'Chat',
    userId: data.userId,
    message: data.message
  })
}
