const logger = require('../utils/logger');
const utils = require('../utils/common');
const { signalSocket, coreConnector } = require('../repository/sender');
const sync = require('../repository/sync');
const core = require('../core/core');

exports.createRoom = async (data, sessionId) => {
  let room = await utils.makeId(8);

  signalSocket.emit(sessionId, {
    eventOp: 'CreateRoom',
    code: '200',
    message: 'OK',
    roomId: room,
  }, data);
}

exports.destroyRoom = async () => {
  // 200616 ivypark, CCC
  // await syncFn.deleteRoom(redisInfo, data.roomId);
  //
  // signalSocket.emit(sessionId, {
  //   eventOp: 'DestroyRoom',
  //   code: '200',
  //   message: 'OK',
  // }, data);
}

exports.roomJoin = async (data, sessionId, redis, socket) => {
  const uid = await utils.makeId();
  logger.log('info', `[Socket : RoomJoin Event] ${uid} User RoomJoin, Session Id is : ${sessionId}, Room Id : ${data.roomId}`);

  // await core.register({  });
  // await core.roomJoin({ roomId: data.roomId });
  let previous = await sync.getRoom(redis, data.roomId);
  if (!previous) {
    // Room 없거나 Error 시
    signalSocket.emit(sessionId, {
      eventOp: 'RoomJoin',
      code: '400',
      message: 'Error',
      useMediaSvr: 'N'
    }, data);
  } else {
    // Room 있는 경우
    sync.setUserInfo(redis, uid, sessionId, 'multi', 'ccc');
    let enteredRoomInfo = await syncFn.cccEnterRoom(redisInfo, {uid, sessionId, roomId: data.roomId, userName: 'unknown'});

    signalSocket.emit(sessionId, {
      eventOp: 'RoomJoin',
      code: '200',
      message: 'OK',
      userId: uid,
      members: enteredRoomInfo.USERS,
      roomId: data.roomId,
      // serverInfo: commonFn.serverInfo.getTurn()
    }, data);

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
          let janus_url = await fn_janus.getMediaServer();
          await syncFn.setJanusServer(redisInfo, {roomId: data.roomId, janus_url: janus_url});
          let createroom = await fn_janus.createRoom(janus_url, 50);
          let __data = {roomId: data.roomId, janus_room_id: createroom.janusRoomId};
          await syncFn.setJanusRoomId(redisInfo, __data);

          for(let each_id in enteredRoomInfo.USERS) {
            let user_id_data = await syncFn.getUserInfo(redisInfo, each_id);
            let _data = {
              roomId: user_id_data.ROOM_ID,
              userId: each_id,
              janus_url: janus_url,
              janusRoomId: createroom.janusRoomId
            };
            await fn_janus.processJoinVideoRoom(user_id_data.SOCKET_ID, _data);
          }

          signalSocket.emit(sessionId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            changeView: true,
            who: uid
          }, data);

          signalSocket.broadcast(socket, data.roomId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            changeView: true,
            who: uid
          });
        } catch (e) {
          console.error(e);
        }
      } else if (previous.MULTITYPE === 'Y') {
        // 기존 진행된 통화가 다자간 통화였다면
        try {
          console.log(await syncFn.getJanusRoomId(redisInfo, data.roomId));
          await fn_janus.processJoinVideoRoom(sessionId, {
            janus_url: await syncFn.getJanusServerByRoomId(redisInfo, data.roomId),
            janusRoomId: await syncFn.getJanusRoomId(redisInfo, data.roomId),
            roomId: data.roomId,
            userId: uid
          });

          signalSocket.emit(sessionId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            who: uid
          }, data);

          signalSocket.broadcast(socket, data.roomId, {
            eventOp: 'StartSession',
            useMediaSvr: 'Y',
            members: enteredRoomInfo.USERS,
            who: uid
          });
        } catch (err) {
          console.log("JOIN WITH JANUS ERROR", err);
        }
      }
    }
  }
}

exports.sdp = async (data, sessionId, redis, socket) => {
  const roomInfo = await sync.getRoom(redis, data.roomId);
  if (roomInfo.MULTITYPE && roomInfo.MULTITYPE === 'N') {
    // await core.sdp();
    data.useMediaSvr = 'N';
    signalSocket.broadcast(socket, data.roomId, data);
  } else {
    if (data.code === '200') return false;

    signalSocket.emit(sessionId, {
      'eventOp': data.eventOp,
      'reqNo': data.reqNo,
      'code': "200",
      'roomId': data.roomId,
      'message': 'OK'
    }, data);

    try {
      let sdp_to_json = sjj.toSessionJSON(data.sdp.sdp, {
        creators: ['initiator', 'initiator'],
        role: 'initiator',
        direction: 'outgoing'
      })

      let ufrag = sdp_to_json.contents[0].transport.ufrag;
      let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);

      if (data.sdp.type === 'offer') {
        let socket_data_from_redis = await syncFn.getUserSocketInfo(redisInfo, sessionId);
        let videoRoomPluginId = socket_data_from_redis['JANUS_PUBLISHER_PLUGIN_ID'];

        await syncFn.setSdpUfragToJanusVideoPluginId(redisInfo, {ufrag: ufrag, videoRoomPluginId: videoRoomPluginId})
        let _data = {
          socketio_session_id: sessionId,
          ufrag: ufrag,
          janus_plugin_id: videoRoomPluginId,
          usage: data.usage
        }
        await syncFn.setJanusPluginInfo(redisInfo, _data);

        await fn_janus.sendOffer(janus_url, videoRoomPluginId, data.sdp, true);
      } else { // SDP ANSWER
        let videoRoomPluginId = sessionDataFromRedis['QUEUING_JANUS_PLUGIN_ID'];
        data.pluginIdFromRedis = videoRoomPluginId;

        fn_janus.processSDPOfferQueue(sessionId, sessionDataFromRedis.ROOM_ID);

        await syncFn.setSdpUfragToJanusVideoPluginId(redisInfo, {ufrag: ufrag, videoRoomPluginId: videoRoomPluginId});
        let janusRoomId = await syncFn.getJanusRoomId(redisInfo, data.roomId);

        let _data = {
          sdp: data.sdp,
          janusRoomId: janusRoomId,
          videoRoomPluginId: videoRoomPluginId
        };
        // setTimeout(() => {
        //     fn_janus.sendAnswerAndStartRemoteVideo(janus_url, _data)
        // }, 1500);
        await fn_janus.sendAnswerAndStartRemoteVideo(janus_url, _data);
      }

    } catch (err) {
      console.log("SDP ERROR OCCURRED.", err);
    }


  }

  // if (data.usage === 'cam') {
  //   syncFn.getRoom(redisInfo, data.roomId).then(async function (roomResult) {
  //   else {
  //       if (data.code === '200') {
  //         return false;
  //       }
  //
  //       //janus.
  //       if(data.isSfu === true) {
  //         let sdpData = {
  //           'eventOp': data.eventOp,
  //           'reqNo': data.reqNo,
  //           'code': "200",
  //           'resDate': commonFn.getDate(),
  //           'roomId': data.roomId,
  //           'message': 'OK'
  //         };
  //         signalSocketio.to(sessionId).emit('knowledgetalk', sdpData);
  //
  //         try {
  //           let sdp_to_json = sjj.toSessionJSON(data.sdp.sdp, {
  //             creators: ['initiator', 'initiator'],
  //             role: 'initiator',
  //             direction: 'outgoing'
  //           })
  //
  //           let ufrag = sdp_to_json.contents[0].transport.ufrag;
  //           let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);
  //
  //           if(data.sdp.type === 'offer') {
  //             let socket_data_from_redis = await syncFn.getUserSocketInfo(redisInfo, sessionId);
  //             let videoRoomPluginId = socket_data_from_redis['JANUS_PUBLISHER_PLUGIN_ID'];
  //
  //             await syncFn.setSdpUfragToJanusVideoPluginId(redisInfo, {ufrag: ufrag, videoRoomPluginId: videoRoomPluginId})
  //             let _data = {
  //               socketio_session_id: sessionId,
  //               ufrag: ufrag,
  //               janus_plugin_id: videoRoomPluginId,
  //               usage: data.usage
  //             }
  //             await syncFn.setJanusPluginInfo(redisInfo, _data);
  //
  //             await fn_janus.sendOffer(janus_url, videoRoomPluginId, data.sdp, true);
  //           } else { // SDP ANSWER
  //             let videoRoomPluginId = sessionDataFromRedis['QUEUING_JANUS_PLUGIN_ID'];
  //             data.pluginIdFromRedis = videoRoomPluginId;
  //
  //             fn_janus.processSDPOfferQueue(sessionId, sessionDataFromRedis.ROOM_ID);
  //
  //             await syncFn.setSdpUfragToJanusVideoPluginId(redisInfo, {ufrag: ufrag, videoRoomPluginId: videoRoomPluginId});
  //             let janusRoomId = await syncFn.getJanusRoomId(redisInfo, data.roomId);
  //
  //             let _data = {
  //               sdp: data.sdp,
  //               janusRoomId: janusRoomId,
  //               videoRoomPluginId: videoRoomPluginId
  //             };
  //             // setTimeout(() => {
  //             //     fn_janus.sendAnswerAndStartRemoteVideo(janus_url, _data)
  //             // }, 1500);
  //             await fn_janus.sendAnswerAndStartRemoteVideo(janus_url, _data);
  //           }
  //
  //         } catch (err) {
  //           console.log("SDP ERROR OCCURRED.", err);
  //         }
  //         return false;
  //       }
  //     }
  //   })
  //     .catch((err) => {
  //       // 190314 ivypark, sync function add catch block
  //       signalSocket.emit(sessionId, {
  //         eventOp: data.eventOp,
  //         resDate: commonFn.getDate(),
  //         code: err.code,
  //         message: err.message
  //       }, data);
  //       console.log('Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 ', '내용이 없음');
  //       logger.log('warn', 'Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우,  내용이 없음');
  //     });
  // } else if (data.usage === 'screen') {
  //   let isHWAccelation = data.isHWAccelation || (typeof data.isHWAccelation === 'undefined' && data.type === 'maker');
  //   let isRTPShare = data.isRTPShare;
  //
  //   if (typeof data.isRTPShare === 'undefined' && data.type === 'maker') {
  //     isRTPShare = true;
  //   }
  //
  //   syncFn.getRoom(redisInfo, data.roomId).then(async function (roomResult) {
  //
  //     let multiType = data.useMediaSvr ? data.useMediaSvr : roomResult.MULTITYPE;
  //     if (data.code === '200' && multiType === 'Y') {
  //       return false;
  //     }
  //
  //     if (typeof data.isHWAccelation === 'undefined' && data.type === 'user') {
  //       isHWAccelation = roomResult.isHWAcceleration;
  //     }
  //
  //     if (multiType && multiType === 'N') {
  //
  //       if (data.sdp) {
  //
  //         if (data.sdp.type === 'answer') {
  //           isRTPShare = typeof roomResult.isRTPShare !== 'undefined' ? roomResult.isRTPShare : true;
  //         }
  //
  //         if (!data.userId) {
  //           console.log('userId false, --> Guest');
  //           data.userId = 'Guest';
  //         }
  //
  //         let isHost = (data.sdp.type === 'offer');
  //
  //         if (isRTPShare) {
  //         } else {
  //           data.useMediaSvr = 'N';
  //           commonFn.reqNo().then(function (reqResult) {
  //             syncFn.msgManager.save(redisInfo, data, reqResult, sessionId, pid).then(function () {
  //               data.reqNo = reqResult;
  //               logger.log('info', `roomResult ${JSON.stringify(roomResult)}`);
  //               syncFn.setShareSettings(redisInfo, data.roomId, isHWAccelation, isRTPShare);
  //               if (!roomResult) {
  //                 syncFn.getUserSocketId(redisInfo, data.userId).then(function (sid) {
  //                   signalSocket.emit(sid, data);
  //                 });
  //               } else {
  //                 signalSocket.broadcast(socket, data.roomId, data);
  //               }
  //               // logger.log('info', `[Socket : ' ${data.eventOp}' Event / 다자간 화상회의] *\n* 현재 처리중 방향 : [Signal -> App (Req)] *\n* eventOp : '${data.eventOp} ' *\n 1:1 P2P 상황. ' ${data.userId} '가 보낸 SDP를 상대에게 전달중. \n ReqNo 생성 완료. App으로 전달할 Data : ', ${JSON.stringify(data)}`);
  //             });
  //           }).catch(function () {
  //             console.log('error');
  //           });
  //         }
  //       } else {
  //         syncFn.msgManager.load(redisInfo, data, sessionId, pid).then(function (respObj) {
  //           data.reqNo = respObj.reqNo;
  //           signalSocket.emit(sessionId, data);
  //           // logger.log('info', `[Socket : '  ${data.eventOp} ' Event / 다자간 화상회의] *\n* 현재 처리중 방향 : [Signal -> App (Resp)] *\n* eventOp : ' ${data.eventOp} ' *\n SDP 요청에 대한 response \n App으로 전달할 Data : ', ${JSON.stringify(data)}`);
  //         });
  //       }
  //     } else {
  //
  //       // 180802 ivypark, 1627 다자간 화면공유 SDP
  //       if (data.code) {
  //         return false;
  //       }
  //
  //       if (data.type === 'user') {
  //         isRTPShare = typeof roomResult.isRTPShare !== 'undefined' ? roomResult.isRTPShare : true;
  //       }
  //
  //       if (!data.userId) {
  //         data.userId = 'Guest';
  //       }
  //
  //       let sdpOkResp = {
  //         'eventOp': data.eventOp,
  //         'reqNo': data.reqNo,
  //         'code': "200",
  //         'message': 'OK',
  //         'resDate': commonFn.getDate(),
  //         'roomId': data.roomId,
  //         'usage': 'screen'
  //       };
  //
  //       signalSocket.emit(sessionId, sdpOkResp, data);
  //
  //       let isHost = (data.type === 'maker');
  //
  //       //janus.
  //       if(commonFn.isSfu() === true) {
  //         try {
  //           if(data.sdp.type === 'offer') {
  //             let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);
  //             let janusRoomId = await syncFn.getJanusRoomId(redisInfo, data.roomId);
  //
  //             let _data = {
  //               janus_url: janus_url,
  //               janusRoomId: janusRoomId,
  //               sdp: data.sdp,
  //               userId: data.userId
  //             };
  //
  //             let res = await fn_janus.processJoinVideoRoomForScreenShare(sessionId, _data);
  //           } else {
  //             let sdp_to_json = sjj.toSessionJSON(data.sdp.sdp, {
  //               creators: ['initiator', 'initiator'],
  //               role: 'initiator',
  //               direction: 'outgoing'
  //             })
  //
  //             let ufrag = sdp_to_json.contents[0].transport.ufrag;
  //             let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);
  //
  //             let videoRoomPluginId = sessionDataFromRedis['QUEUING_JANUS_PLUGIN_ID'];
  //
  //             fn_janus.processSDPOfferQueue(sessionId, sessionDataFromRedis.ROOM_ID);
  //
  //             await syncFn.setSdpUfragToJanusVideoPluginId(redisInfo, {ufrag: ufrag, videoRoomPluginId: videoRoomPluginId});
  //             let janusRoomId = await syncFn.getJanusRoomId(redisInfo, data.roomId);
  //
  //             let _data = {
  //               sdp: data.sdp,
  //               janusRoomId: janusRoomId,
  //               videoRoomPluginId: videoRoomPluginId
  //             }
  //
  //             await fn_janus.sendAnswerAndStartRemoteVideo(janus_url, _data);
  //
  //           }
  //         } catch (e) {
  //           logger.log('error', `sfu screenshare ERROR..${e}`);
  //         }
  //         return false;
  //       }
  //       //janus end.
  //     }
  //   })
  //     .catch((err) => {
  //       // 190314 ivypark, sync function add catch block
  //       signalSocket.emit(sessionId, {
  //         eventOp: data.eventOp,
  //         resDate: commonFn.getDate(),
  //         code: err.code,
  //         message: err.message
  //       }, data);
  //       console.log('Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 ', '내용이 없음');
  //       logger.log('warn', 'Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 내용이 없음');
  //     });
  // }
}

exports.recesdp = async () => {
  // if (data.usage === 'cam') {
  //   syncFn.getRoom(redisInfo, data.roomId).then(async function (roomResult) {
  //     if (roomResult.MULTITYPE && roomResult.MULTITYPE === 'N') {
  //       if (data.sdp) {
  //         if (!data.userId) {
  //           console.log('userId false, --> Guest');
  //           data.userId = 'Guest';
  //         }
  //
  //         data.useMediaSvr = 'N';
  //         commonFn.reqNo().then(function (reqResult) {
  //           syncFn.msgManager.save(redisInfo, data, reqResult, sessionId, pid).then(function () {
  //             data.reqNo = reqResult;
  //             signalSocket.broadcast(socket, data.roomId, data);
  //           });
  //         }).catch(function () {
  //           console.log('error');
  //         });
  //       } else {
  //         syncFn.msgManager.load(redisInfo, data, sessionId, pid).then(function (respObj) {
  //           data.reqNo = respObj.reqNo;
  //           data.userId = respObj.userId;
  //           data.message = 'OK';
  //           signalSocket.broadcast(socket, data.roomId, data);
  //           // logger.log('info', `[Socket : ' ${data.eventOp} ' Event / 다자간 화상회의] *\n* 현재 처리중 방향 : [Signal -> App (Resp)] *\n* eventOp : ' ${data.eventOp} ' *\n SDP 요청에 대한 response \n App으로 전달할 Data : ', ${JSON.stringify(data)}`);
  //         });
  //       }
  //     } else {
  //       if (data.code === '200') {
  //         return false;
  //       }
  //
  //       //janus.
  //       if(data.isSfu === true) {
  //         let sdpData = {
  //           'eventOp': data.eventOp,
  //           'reqNo': data.reqNo,
  //           'code': "200",
  //           'resDate': commonFn.getDate(),
  //           'roomId': data.roomId,
  //           'message': 'OK'
  //         };
  //         signalSocketio.to(sessionId).emit('knowledgetalk', sdpData);
  //
  //         try {
  //           let sdp_to_json = sjj.toSessionJSON(data.sdp.sdp, {
  //             creators: ['initiator', 'initiator'],
  //             role: 'initiator',
  //             direction: 'outgoing'
  //           })
  //
  //           let ufrag = sdp_to_json.contents[0].transport.ufrag;
  //           let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);
  //
  //           if(data.sdp.type === 'offer') {
  //             let socket_data_from_redis = await syncFn.getUserSocketInfo(redisInfo, sessionId);
  //             let videoRoomPluginId = socket_data_from_redis['JANUS_PUBLISHER_PLUGIN_ID'];
  //
  //             await syncFn.setSdpUfragToJanusVideoPluginId(redisInfo, {ufrag: ufrag, videoRoomPluginId: videoRoomPluginId})
  //             let _data = {
  //               socketio_session_id: sessionId,
  //               ufrag: ufrag,
  //               janus_plugin_id: videoRoomPluginId,
  //               usage: data.usage
  //             }
  //             await syncFn.setJanusPluginInfo(redisInfo, _data);
  //
  //             await fn_janus.sendOffer(janus_url, videoRoomPluginId, data.sdp, true);
  //           } else { // SDP ANSWER
  //             let videoRoomPluginId = sessionDataFromRedis['QUEUING_JANUS_PLUGIN_ID'];
  //             data.pluginIdFromRedis = videoRoomPluginId;
  //
  //             fn_janus.processSDPOfferQueue(sessionId, sessionDataFromRedis.ROOM_ID);
  //
  //             await syncFn.setSdpUfragToJanusVideoPluginId(redisInfo, {ufrag: ufrag, videoRoomPluginId: videoRoomPluginId});
  //             let janusRoomId = await syncFn.getJanusRoomId(redisInfo, data.roomId);
  //
  //             let _data = {
  //               sdp: data.sdp,
  //               janusRoomId: janusRoomId,
  //               videoRoomPluginId: videoRoomPluginId
  //             };
  //             // setTimeout(() => {
  //             //     fn_janus.sendAnswerAndStartRemoteVideo(janus_url, _data)
  //             // }, 1500);
  //             await fn_janus.sendAnswerAndStartRemoteVideo(janus_url, _data);
  //           }
  //
  //         } catch (err) {
  //           console.log("SDP ERROR OCCURRED.", err);
  //         }
  //         return false;
  //       }
  //     }
  //   })
  //     .catch((err) => {
  //       // 190314 ivypark, sync function add catch block
  //       signalSocket.emit(sessionId, {
  //         eventOp: data.eventOp,
  //         resDate: commonFn.getDate(),
  //         code: err.code,
  //         message: err.message
  //       }, data);
  //       console.log('Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 ', '내용이 없음');
  //       logger.log('warn', 'Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우,  내용이 없음');
  //     });
  // } else if (data.usage === 'screen') {
  //   let isHWAccelation = data.isHWAccelation || (typeof data.isHWAccelation === 'undefined' && data.type === 'maker');
  //   let isRTPShare = data.isRTPShare;
  //
  //   if (typeof data.isRTPShare === 'undefined' && data.type === 'maker') {
  //     isRTPShare = true;
  //   }
  //
  //   syncFn.getRoom(redisInfo, data.roomId).then(async function (roomResult) {
  //
  //     let multiType = data.useMediaSvr ? data.useMediaSvr : roomResult.MULTITYPE;
  //     if (data.code === '200' && multiType === 'Y') {
  //       return false;
  //     }
  //
  //     if (typeof data.isHWAccelation === 'undefined' && data.type === 'user') {
  //       isHWAccelation = roomResult.isHWAcceleration;
  //     }
  //
  //     if (multiType && multiType === 'N') {
  //
  //       if (data.sdp) {
  //
  //         if (data.sdp.type === 'answer') {
  //           isRTPShare = typeof roomResult.isRTPShare !== 'undefined' ? roomResult.isRTPShare : true;
  //         }
  //
  //         if (!data.userId) {
  //           console.log('userId false, --> Guest');
  //           data.userId = 'Guest';
  //         }
  //
  //         let isHost = (data.sdp.type === 'offer');
  //
  //         if (isRTPShare) {
  //         } else {
  //           data.useMediaSvr = 'N';
  //           commonFn.reqNo().then(function (reqResult) {
  //             syncFn.msgManager.save(redisInfo, data, reqResult, sessionId, pid).then(function () {
  //               data.reqNo = reqResult;
  //               logger.log('info', `roomResult ${JSON.stringify(roomResult)}`);
  //               syncFn.setShareSettings(redisInfo, data.roomId, isHWAccelation, isRTPShare);
  //               if (!roomResult) {
  //                 syncFn.getUserSocketId(redisInfo, data.userId).then(function (sid) {
  //                   signalSocket.emit(sid, data);
  //                 });
  //               } else {
  //                 signalSocket.broadcast(socket, data.roomId, data);
  //               }
  //               // logger.log('info', `[Socket : ' ${data.eventOp}' Event / 다자간 화상회의] *\n* 현재 처리중 방향 : [Signal -> App (Req)] *\n* eventOp : '${data.eventOp} ' *\n 1:1 P2P 상황. ' ${data.userId} '가 보낸 SDP를 상대에게 전달중. \n ReqNo 생성 완료. App으로 전달할 Data : ', ${JSON.stringify(data)}`);
  //             });
  //           }).catch(function () {
  //             console.log('error');
  //           });
  //         }
  //       } else {
  //         syncFn.msgManager.load(redisInfo, data, sessionId, pid).then(function (respObj) {
  //           data.reqNo = respObj.reqNo;
  //           signalSocket.emit(sessionId, data);
  //           // logger.log('info', `[Socket : '  ${data.eventOp} ' Event / 다자간 화상회의] *\n* 현재 처리중 방향 : [Signal -> App (Resp)] *\n* eventOp : ' ${data.eventOp} ' *\n SDP 요청에 대한 response \n App으로 전달할 Data : ', ${JSON.stringify(data)}`);
  //         });
  //       }
  //     } else {
  //
  //       // 180802 ivypark, 1627 다자간 화면공유 SDP
  //       if (data.code) {
  //         return false;
  //       }
  //
  //       if (data.type === 'user') {
  //         isRTPShare = typeof roomResult.isRTPShare !== 'undefined' ? roomResult.isRTPShare : true;
  //       }
  //
  //       if (!data.userId) {
  //         data.userId = 'Guest';
  //       }
  //
  //       let sdpOkResp = {
  //         'eventOp': data.eventOp,
  //         'reqNo': data.reqNo,
  //         'code': "200",
  //         'message': 'OK',
  //         'resDate': commonFn.getDate(),
  //         'roomId': data.roomId,
  //         'usage': 'screen'
  //       };
  //
  //       signalSocket.emit(sessionId, sdpOkResp, data);
  //
  //       let isHost = (data.type === 'maker');
  //
  //       //janus.
  //       if(commonFn.isSfu() === true) {
  //         try {
  //           if(data.sdp.type === 'offer') {
  //             let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);
  //             let janusRoomId = await syncFn.getJanusRoomId(redisInfo, data.roomId);
  //
  //             let _data = {
  //               janus_url: janus_url,
  //               janusRoomId: janusRoomId,
  //               sdp: data.sdp,
  //               userId: data.userId
  //             };
  //
  //             let res = await fn_janus.processJoinVideoRoomForScreenShare(sessionId, _data);
  //           } else {
  //             let sdp_to_json = sjj.toSessionJSON(data.sdp.sdp, {
  //               creators: ['initiator', 'initiator'],
  //               role: 'initiator',
  //               direction: 'outgoing'
  //             })
  //
  //             let ufrag = sdp_to_json.contents[0].transport.ufrag;
  //             let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);
  //
  //             let videoRoomPluginId = sessionDataFromRedis['QUEUING_JANUS_PLUGIN_ID'];
  //
  //             fn_janus.processSDPOfferQueue(sessionId, sessionDataFromRedis.ROOM_ID);
  //
  //             await syncFn.setSdpUfragToJanusVideoPluginId(redisInfo, {ufrag: ufrag, videoRoomPluginId: videoRoomPluginId});
  //             let janusRoomId = await syncFn.getJanusRoomId(redisInfo, data.roomId);
  //
  //             let _data = {
  //               sdp: data.sdp,
  //               janusRoomId: janusRoomId,
  //               videoRoomPluginId: videoRoomPluginId
  //             }
  //
  //             await fn_janus.sendAnswerAndStartRemoteVideo(janus_url, _data);
  //
  //           }
  //         } catch (e) {
  //           logger.log('error', `sfu screenshare ERROR..${e}`);
  //         }
  //         return false;
  //       }
  //       //janus end.
  //     }
  //   })
  //     .catch((err) => {
  //       // 190314 ivypark, sync function add catch block
  //       signalSocket.emit(sessionId, {
  //         eventOp: data.eventOp,
  //         resDate: commonFn.getDate(),
  //         code: err.code,
  //         message: err.message
  //       }, data);
  //       console.log('Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 ', '내용이 없음');
  //       logger.log('warn', 'Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 내용이 없음');
  //     });
  // }
}

exports.candidate = async () => {
  // setTimeout(function() {
  //   if (data.usage === 'cam') {
  //     syncFn.getRoom(redisInfo, data.roomId).then(async function (roomResult) {
  //       if (data.code === '200' && roomResult.MULTITYPE === 'Y') {
  //         return false;
  //       }
  //
  //       if (roomResult.MULTITYPE && roomResult.MULTITYPE === 'N') {
  //         if (data.candidate) {
  //           if (!data.userId) {
  //             data.userId = 'Guest';
  //           }
  //           data.useMediaSvr = "N";
  //           commonFn.reqNo().then(function (reqResult) {
  //             syncFn.msgManager.save(redisInfo, data, reqResult, sessionId, pid).then(function () {
  //               data.reqNo = reqResult;
  //               signalSocket.broadcast(socket, data.roomId, data);
  //               logger.log('info', `[Socket : '${data.eventOp} ' Event / 다자간 화상회의] *\n* 현재 처리중 방향 : [Signal -> App (Req)] *\n* Candidate 전달요청자 : ' ${data.userId} ' *\n* eventOp : ' ${data.eventOp} ' *\n 1:1 P2P 상황. ' ${data.userId} '가 보낸 Candidate를 상대에게 전달중. \n ReqNo 생성 완료. App으로 전달할 Data : ', ${JSON.stringify(data)}`);
  //             });
  //           }).catch(function () {
  //             console.log('error');
  //           });
  //         } else {
  //           console.log('# candidate 200 answer ---> ', data.reqNo);
  //           logger.log('info', `# candidate 200 answer ---> ${data.reqNo}`);
  //           syncFn.msgManager.load(redisInfo, data, sessionId, pid).then(function (respObj) {
  //             data.reqNo = respObj.reqNo;
  //             data.userId = respObj.userId;
  //             signalSocket.broadcast(sessionId, data);
  //             logger.log('info', `[Socket : '${data.eventOp}' Event / 다자간 화상회의] *\n* 현재 처리중 방향 : [Signal -> App (Req)] *\n* Candidate 전달요청자 : '${data.userId} ' *\n* eventOp : ' ${data.eventOp} ' *\n Candidate 200 Response, App으로 전달할 Data : ', ${JSON.stringify(data)}`);
  //           });
  //         }
  //       } else {
  //         if (data.candidate) {
  //           let cadidateData = {
  //             'eventOp': 'Candidate',
  //             'reqNo': data.reqNo,
  //             'code': "200",
  //             'message': 'OK',
  //             'usage': 'cam',
  //             'useMediaSvr': 'Y',
  //             'resDate': commonFn.getDate(),
  //             'roomId': data.roomId
  //           };
  //
  //           signalSocket.emit(sessionId, cadidateData, data);
  //           logger.log('info', `[Socket : ' ${data.eventOp} ' Event / 다자간 화상회의] *\n* 현재 처리중 방향 : [Signal -> App (Req)] *\n* Candidate 전달요청자 :  '${data.userId} ' *\n* eventOp : ' ${data.eventOp} ' *\n Candidate 요청이 오면 여기서 바로 response가 나감. (socket.event 1671) \n App으로 전달할 Data : ', ${JSON.stringify(cadidateData)}`);
  //
  //           //janus.
  //           if(data.isSfu === true) {
  //             try {
  //               setTimeout(async () => {
  //                 let ufragIdx = data.candidate.candidate.indexOf("ufrag");
  //                 let ufrag = data.candidate.candidate.substr(ufragIdx + 6, 4);
  //                 let videoRoomPluginId = await syncFn.getJanusPluginIdFromUfrag(redisInfo, ufrag);
  //                 if(videoRoomPluginId) {
  //                   let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);
  //                   fn_janus.onIceCandidate(janus_url, videoRoomPluginId, data.candidate);
  //                 } else {
  //                   // webrtcup 으로 candidate가 맺어지면 더이상 보낼 필요가 없기 떄문에 redis에서 제거해도 무방하다.
  //                   console.log('ufrag does not exists.');
  //                 }
  //                 return false;
  //               }, 1500);
  //             } catch (err) {
  //               console.log('PROCESS ICECANDIDATE ERROR.', err);
  //               return false;
  //             }
  //           } else {
  //             fn_Kurento.onIceCandidate(sessionId, data.candidate);
  //           }
  //           //janus end.
  //         }
  //       }
  //     })
  //       .catch((err) => {
  //         // 190314 ivypark, sync function add catch block
  //         signalSocket.emit(sessionId, {
  //           eventOp: data.eventOp,
  //           resDate: commonFn.getDate(),
  //           code: err.code,
  //           message: err.message
  //         }, data);
  //         console.log('Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 ', '내용이 없음');
  //         logger.log('warn', 'Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 내용이 없음');
  //       });
  //   } else if (data.usage === 'screen') {
  //     let isMexServer = commonFn.getMediaServerSelector();
  //     syncFn.getRoom(redisInfo, data.roomId).then(async function (roomResult) {
  //       let isHWAccelation = data.isHWAccelation || (typeof data.isHWAccelation === 'undefined' && data.type === 'maker');
  //       if (typeof data.isHWAccelation === 'undefined' && data.type === 'user') {
  //         isHWAccelation = roomResult.isHWAcceleration;
  //       }
  //
  //       console.log('isHWAccelation :: ', data.isHWAccelation, isMexServer);
  //
  //       let multiType = data.useMediaSvr ? data.useMediaSvr : roomResult.MULTITYPE;
  //       if (data.code === '200' && multiType === 'Y') {
  //         return false;
  //       }
  //
  //       if (multiType && multiType === 'N') {
  //         if (data.candidate) {
  //           if (!data.userId) {
  //             data.userId = 'Guest';
  //           }
  //
  //           //1:1 SDP 교환
  //           data.useMediaSvr = 'N';
  //           commonFn.reqNo().then(function (reqResult) {
  //             syncFn.msgManager.save(redisInfo, data, reqResult, sessionId, pid).then(function () {
  //               data.reqNo = reqResult;
  //               if (!roomResult) {
  //                 syncFn.getUserSocketId(redisInfo, data.userId).then(function (sid) {
  //                   signalSocket.emit(sid, data);
  //                 });
  //               } else {
  //                 signalSocket.broadcast(socket, data.roomId, data);
  //               }
  //             });
  //           }).catch(function () {
  //             console.log('error');
  //           });
  //         } else {
  //           syncFn.msgManager.load(redisInfo, data, sessionId, pid)
  //             .then(function (respObj) {
  //               data.reqNo = respObj.reqNo;
  //               signalSocket.emit(sessionId, data);
  //             });
  //         }
  //       } else {
  //         if (data.candidate) {
  //           let cadidateData = {
  //             'eventOp': 'Candidate',
  //             'usage': 'screen',
  //             'reqNo': data.reqNo,
  //             'code': "200",
  //             'message': 'OK',
  //             'resDate': commonFn.getDate(),
  //             'roomId': data.roomId
  //           };
  //
  //           signalSocket.emit(sessionId, cadidateData, data);
  //
  //           //janus.
  //           if(data.isSfu === true) {
  //             try {
  //               // let ufrag = data.candidate.usernameFragment;
  //               let ufragIdx = data.candidate.candidate.indexOf("ufrag");
  //               let ufrag = data.candidate.candidate.substr(ufragIdx + 6, 4);
  //               let videoRoomPluginId = await syncFn.getJanusPluginIdFromUfrag(redisInfo, ufrag);
  //
  //               let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, data.roomId);
  //               fn_janus.onIceCandidate(janus_url, videoRoomPluginId, data.candidate);
  //               return false;
  //             } catch (err) {
  //               return false;
  //             }
  //           }
  //           //janus end.
  //         }
  //       }
  //     })
  //       .catch((err) => {
  //         // 190314 ivypark, sync function add catch block
  //         signalSocket.emit(sessionId, {
  //           eventOp: data.eventOp,
  //           resDate: commonFn.getDate(),
  //           code: err.code,
  //           message: err.message
  //         }, data);
  //         console.log('Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 ', '내용이 없음');
  //         logger.log('warn', 'Room ID가 잘못 된 경우. 유효하지 않은 room ID인 경우 , 내용이 없음');
  //       });
  //   }
  // }, 200);
}

exports.sessionReserve = async () => {
  // let roomId = data.roomId;
  // let userId = data.userId;
  // let reserveReturnMsg = {};
  //
  // syncFn.isScreenSharePossible(redisInfo, roomId, userId, function (possible) {
  //   if (possible === 'error') {
  //     // 190314 ivypark, sync function add catch block
  //     signalSocket.emit(sessionId, {
  //       eventOp: data.eventOp,
  //       resDate: commonFn.getDate(),
  //       code: '543',
  //       message: 'Internal Server Error'
  //     }, data);
  //     console.log('Room Id를 찾을 수 없음 ');
  //     logger.log('warn', 'Room Id를 찾을 수 없음 , room ID가 잘못 전송 된 경우.');
  //     return;
  //   }
  //
  //   if (typeof possible === 'boolean' && possible) {
  //     syncFn.setScreenShareFlag(redisInfo, roomId, userId, function (err, multitype) {
  //       if (err) {
  //         console.log(err);
  //         return;
  //       }
  //       reserveReturnMsg.eventOp = 'SessionReserve';
  //       reserveReturnMsg.reqNo = data.reqNo;
  //       reserveReturnMsg.code = '200';
  //       reserveReturnMsg.message = 'OK';
  //       reserveReturnMsg.resDate = commonFn.getDate();
  //       reserveReturnMsg.multiType = data.isRTPShare ? 'Y' : multitype;
  //
  //       signalSocket.emit(sessionId, reserveReturnMsg, data);
  //     })
  //
  //   } else {
  //
  //     reserveReturnMsg.eventOp = 'SessionReserve'
  //     reserveReturnMsg.reqNo = data.reqNo
  //     reserveReturnMsg.code = '440' // Resources already in use
  //     reserveReturnMsg.message = 'Resources already in use';
  //     reserveReturnMsg.resDate = commonFn.getDate()
  //
  //     signalSocket.emit(sessionId, reserveReturnMsg, data);
  //   }
  // });
}

exports.endSessionReserve = async () => {
  // let reserveEndReturnMsg = {};
  //
  // syncFn.resetScreenShareFlag(redisInfo, data.userId, data.roomId, function (err) {
  //   if (err === 'error') {
  //     // 190314 ivypark, sync function add catch block
  //     signalSocket.emit(sessionId, {
  //       eventOp: data.eventOp,
  //       resDate: commonFn.getDate(),
  //       code: '543',
  //       message: 'Internal Server Error'
  //     });
  //     console.log('Room Id를 찾을 수 없음 ');
  //     logger.log('warn', 'Room Id를 찾을 수 없음 , room ID가 잘못 전송 된 경우.');
  //     return;
  //   } else if (err === 'user error') {
  //     signalSocket.emit(sessionId, {
  //       eventOp: data.eventOp,
  //       resDate: commonFn.getDate(),
  //       code: '440',
  //       message: 'Resources already in use'
  //     });
  //     logger.log('warn', 'userId가 잘못 된 경우.');
  //     return;
  //   }
  //
  //   if (err) {
  //     reserveEndReturnMsg.eventOp = 'SessionReserveEnd';
  //     reserveEndReturnMsg.reqNo = data.reqNo;
  //     reserveEndReturnMsg.code = '559'; // DB Unknown Error
  //     reserveEndReturnMsg.message = 'DB Unknown Error';
  //     reserveEndReturnMsg.resDate = commonFn.getDate();
  //
  //     signalSocket.emit(sessionId, reserveEndReturnMsg);
  //
  //     return
  //   }
  //
  //   reserveEndReturnMsg.eventOp = 'SessionReserveEnd';
  //   reserveEndReturnMsg.reqNo = data.reqNo;
  //   reserveEndReturnMsg.code = '200';
  //   reserveEndReturnMsg.message = 'OK';
  //   reserveEndReturnMsg.resDate = commonFn.getDate();
  //
  //   signalSocket.emit(sessionId, reserveEndReturnMsg);
  // });
}

exports.endScreenShare = async () => {
  // if (!data.code) {
  //   if(commonFn.isSfu() === true) {
  //     try {
  //       let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, sessionDataFromRedis.ROOM_ID);
  //       let janusRoomId = await syncFn.getJanusRoomId(redisInfo, sessionDataFromRedis.ROOM_ID);
  //       fn_janus.leaveRoom(janus_url, sessionDataFromRedis['SCREEN_SHARE_JANUS_PUBLISHER_PLUGIN_ID'], janusRoomId);
  //       fn_janus.detachVideoRoomPlugin(janus_url, sessionDataFromRedis['SCREEN_SHARE_JANUS_PUBLISHER_PLUGIN_ID']);
  //
  //       let redis_done = await syncFn.deleteJanusVideoFeedId(redisInfo, {feedId: sessionDataFromRedis['SCREEN_SHARE_JANUS_PUBLISHER_FEED_ID']});
  //
  //       delete sessionDataFromRedis['SCREEN_SHARE_JANUS_PUBLISHER_PLUGIN_ID'];
  //       delete sessionDataFromRedis['SCREEN_SHARE_JANUS_PUBLISHER_FEED_ID'];
  //       delete sessionDataFromRedis['SCREEN_SHARE_JANUS_PRIVATE_ID'];
  //
  //       await syncFn.updateUserSocketInfo(redisInfo, sessionId, sessionDataFromRedis);
  //     } catch (e) {
  //       console.log('ScreenShareConferenceEnd error..', e);
  //     }
  //   } else {
  //     fn_Kurento.screenShareStop(sessionId, data.roomId, redisInfo);
  //   }
  //
  //   let recvData = {
  //     'eventOp': 'ScreenShareConferenceEnd',
  //     'reqNo': data.reqNo,
  //     'roomId': data.roomId,
  //     'resDate': commonFn.getDate(),
  //     'code': '200',
  //     'message': 'OK'
  //   };
  //
  //   let endSenderData = {
  //     'eventOp': "ScreenShareConferenceEndSvr",
  //     'userId': data.userId,
  //     'reqDate': commonFn.getDate(),
  //     'roomId': data.roomId,
  //     'isSfu': commonFn.isSfu()
  //   };
  //
  //   commonFn.reqNo().then(function (reqResult) {
  //     endSenderData.reqNo = reqResult;
  //     signalSocket.emit(sessionId, recvData);
  //     logger.log('info', `[Socket : '${data.eventOp}  ' Event / 다자간 화상회의 / '${data.eventOp} '] *\n* 현재 처리중 방향 : [Signal -> App (Resp)] *\n* 요청자 : ' ${data.userId}' \n 종료 요청 전송중., App으로 전달 데이터 : ', ${JSON.stringify(recvData)  }`);
  //     signalSocket.broadcast(socket, data.roomId, endSenderData);
  //     logger.log('info', `[Socket : '${data.eventOp} ' Event / 다자간 화상회의 / '${data.eventOp} '] *\n* 현재 처리중 방향 : [Signal -> App (broadcast)] *\n* 전달요청자 : '${data.userId} ' \n ReqNo 생성 완료. App으로 전달 데이터 : ${JSON.stringify(endSenderData)  }`);
  //   }).catch(function (error) {
  //     console.log('error');
  //   });
  // }
}

exports.setVideo = async () => {
  // await syncFn.changeItemInRoom(redisInfo, data.roomId, data.userId, 'VIDEO', data.status)
  // let videoData = {
  //   'signalOp': 'SetVideo',
  //   'userId': data.userId,
  //   'reqDate': data.reqDate,
  //   'roomId': data.roomId,
  //   'status': data.status
  // };

  // signalSocket.broadcast(socket, data.roomId, videoData);
}

exports.setAudio = async () => {
  // await syncFn.changeItemInRoom(redisInfo, data.roomId, data.userId, 'AUDIO', data.status)
  //   let audioData = {
  //     'signalOp': 'SetAudio',
  //     'userId': data.userId,
  //     'reqDate': data.reqDate,
  //     'roomId': data.roomId,
  //     'status': data.status
  //   };
  // signalSocket.broadcast(socket, data.roomId, audioData);
}

exports.changeName = async () => {
  // await syncFn.changeItemInRoom(redisInfo, data.roomId, data.userId, 'NAME', data.name)
  // signalSocket.broadcast(socket, data.roomId, {
  //   signalOp: 'ChangeName',
  //   userId: data.userId,
  //   name: data.name
  // })
}

exports.disconnect = async (socket, redisInfo, sessionId) => {
  // let o = await syncFn.getUserSocketInfo(redisInfo, sessionId);
  // if (!o || !Object.keys(o).length) return;
  // let roomId = o.ROOM_ID;
  // let userId = o.ID;
  // let roomInfo = await syncFn.getRoom(redisInfo, roomId);
  //
  // if (userId === roomInfo.SCREEN.USERID) {
  //   syncFn.resetScreenShareFlag(redisInfo, userId, roomId, err => {});
  //   signalSocket.broadcast(socket, roomId, {
  //     eventOp: 'ScreenShareConferenceEndSvr',
  //     roomId,
  //     code: '200',
  //     message: 'OK'
  //   });
  // }
  //
  // signalSocket.broadcast(socket, roomId, {
  //   signalOp: 'Presence',
  //   userId: userId,
  //   action: 'exit'
  // });
  //
  // let janus_url = await syncFn.getJanusServerByRoomId(redisInfo, roomId);
  // let janusRoomId = await syncFn.getJanusRoomId(redisInfo, roomId);
  // if (janusRoomId) {
  //   await fn_janus.processLeaveVideoRoom(janus_url, sessionId, {
  //     roomId, janusRoomId
  //   });
  // }
  //
  // await socket.leave(roomId);
  // await syncFn.leaveRoom(redisInfo, roomId, sessionId);
  //
  // let count = Object.keys(roomInfo.USERS).length;
  // if (count <= 1) await syncFn.deleteRoom(redisInfo, roomId);
}