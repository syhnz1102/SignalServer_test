const commonFn = require('./util');
const syncFn = require('./sync.service');
const fn_janus = require('./janus.service');
const janus_module = require('./janus.module');
const logger = require('../utils/logger');
const config = require('../config');

exports.register = (socket, redisInfo) => {
  return new Promise(async (resolve, reject) => {
    //socket id
    let socketId = socket.id;

    //유저 정보
    let userData = {};

    //Sync Server에 유저 정보 등록
    userData.socketId = socketId;

    await syncFn.setUserInfoBySocketId(redisInfo, socketId, userData).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfoBySocketId Error ${err}`);
    });

    resolve({
      code: '200'
    });
  })
}

exports.roomCreate = async (redisInfo, reqData) => {
  return new Promise(async (resolve, reject) => {
    //room 정보
    let roomData = {};

    //새로운 roomId 생성
    if(!reqData.roomId){
      //room id 생성
      roomData.roomId = await commonFn.getRoomId();
    }
    //요청한 roomId로 room 생성
    else {

      let roomIdValidation = await commonFn.roomIdValidation(reqData.roomId);
      if(roomIdValidation !== '200'){
        resolve({code: roomIdValidation})
        return;
      }

      roomData = await syncFn.getRoomDetail(redisInfo, reqData.roomId).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
      })

      //이미 room이 존재하는 경우
      if(roomData){
        resolve({
          code: '443'
        });
        return;
      } else {
        roomData = {};
        roomData.roomId = reqData.roomId;
      }

    }

    //수용인원 정보 추가
    roomData.capacity = reqData.capacity;

    await syncFn.setRoom(redisInfo, roomData.roomId, roomData).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] setRoom Error ${err}`);
    })

    //data return
    resolve(roomData);
  })
}

exports.roomJoin = async (socketIo, socket, redisInfo, reqData) => {
  return new Promise(async (resolve, reject) => {
    //socket id
    let socketId = socket.id;

    //room 정보
    let roomData = {};

    //user 정보
    let userData = await syncFn.getUserInfoBySocketId(redisInfo, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId Error ${err}`);
    })

    if(!userData){
      logger.info(`[ ## SYNC > SIGNAL ### ] There is no such user in Sync Server`);
      resolve({
        code: '543',
      });
      return;
    }

    //응답 메시지
    let roomJoinMsg = {};

    roomData = await syncFn.getRoomDetail(redisInfo, reqData.roomId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
    })

    if(!roomData){
      logger.info(`[ ## SYNC > SIGNAL ### ] There is no such room in Sync Server`);
      resolve({
        code: '543',
      });
      return;
    }

    //현재 socket room 인원
    let userCount = await syncFn.getUserCount(redisInfo, roomData.roomId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getUserCount Error ${err}`);
    })


    //room 수용인원을 초과할 경우
    if(roomData.capacity <= userCount){
      resolve({
        code: '444'
      })
      return;
    }

    //socket join
    socket.join(roomData.roomId);

    //user 정보에 방 정보 추가
    userData.roomInfo = {};
    userData.roomInfo[roomData.roomId] = {};

    await syncFn.setUserInfoBySocketId(redisInfo, socketId, userData).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfoBySocketId Error ${err}`);
    });

    //현재 socket room 인원
    await syncFn.enterRoom(redisInfo, roomData.roomId, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] enterRoom Error ${err}`);
    })

    //응답 메시지에 인원수 추가
    roomJoinMsg.count = userCount+1;

    //data return
    resolve(roomJoinMsg);
  })
}

exports.exitRoom = async (socketIo, socket, redisInfo, reqData) => {
  return new Promise(async (resolve, reject) => {
    //socket id
    let socketId = socket.id;

    //유저 정보
    let userData;

    //방 정보
    let roomData;

    //socket id로 user 정보 가져오기
    userData = await syncFn.getUserInfoBySocketId(redisInfo, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId Error ${err}`);
    });

    //유저 정보가 없을 시 바로 종료
    if(!userData){
      logger.info(`[ ## SYNC > SIGNAL ### ] There is no such user in Sync Server`);
      resolve({
        code: '543'
      });
      return;
    }

    //방 정보 가져오기
    roomData = await syncFn.getRoomDetail(redisInfo, reqData.roomId).catch(err => {
      logger.info(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
    });

    //방 정보가 없을 시 바로 종료
    if(!roomData){
      logger.info(`[ ## SYNC > SIGNAL ### ] There is no such room in Sync Server`);
      resolve({
        code: '543'
      });
      return;
    }

    delete userData.roomInfo[reqData.roomId];

    socket.leave(reqData.roomId);

    //sync server에 퇴장 반영
    await syncFn.exitRoom(redisInfo, roomId, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] exitRoom Error ${err}`);
    })

    //인원 수 체크 해서 sync server에서 room 정보 지우기
    let userCount = await syncFn.getUserCount(redisInfo, reqData.roomId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getUserCount Error ${err}`);
    })

    //아무도 없으면 방 삭제
    if(userCount === 0){
      logger.info(`[ ## SIGNAL > SYNC ### ] delete room : ${reqData.roomId}`);
      await syncFn.delRoom(redisInfo, reqData.roomId).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] delRoom Error ${err}`);
      });
    }

    await syncFn.setUserInfoBySocketId(redisInfo, socketId, userData).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfoBySocketId Error ${err}`);
    });

    resolve({
      code: '200'
    });
  })
}

exports.joinVideoRoom = async (socketId, redisInfo, reqData) => {
  return new Promise(async (resolve, reject) => {

    //방 정보
    let roomData = await syncFn.getRoomDetail(redisInfo, reqData.roomId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail error : ${err}`);
      resolve({
        code: '543'
      });
      return;
    })

    if(roomData.code && roomData.code !== '200'){
      logger.info(`[ ## SYNC > SIGNAL ### ] There is no such room in Sync Server`);
      resolve({
        code: '442'
      });
      return;
    }

    //유저 정보
    let userData = {};

    //host인 경우 load balacing하여 media server url 선택
    if(reqData.host){

      //media server load balancing
      let mediaServerUrls = await syncFn.getJanusUrls(redisInfo).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] getJanusUrls error : ${err}`);
        resolve({
          code: '570'
        });
        return;
      });

      if(!mediaServerUrls){
        logger.log(`[ ## SYNC > SIGNAL ### ] getJanusUrls error : ${err}`);
        resolve({
          code: '570'
        });
        return;
      }

      let healthCheck = true;
      let selectedUrl = ''

      for(let loop = 0; loop<mediaServerUrls.length; ++loop){
        //CPU 사용량이 적은 Media Server 가져오기
        selectedUrl = await commonFn.getLightestMediaServer(mediaServerUrls, redisInfo).catch(err => {
          logger.error(`[ ## SYNC > SIGNAL ### ] getLightestMediaServer error : ${err}`);
          resolve({
            code: '570'
          });
        })

        //연결 가능한 Media Server가 없는 경우
        if(!selectedUrl){
          resolve({
            code: '570'
          });
          return;
        }

        //Media Server Ping Test
        healthCheck = await fn_janus.pingMediaServer(selectedUrl).catch(err => {
          logger.error(`[ ## MEDIA > SIGNAL ## ] pingMediaServer error : ${err}`);
          resolve({
            code: '570'
          });
          return;
        })

        //연결 성공 시, 반복문 탈출
        if(healthCheck){
          break;
        }
        //연결이 되지 않는 경우 해당 Media Server 정보 삭제
       else {
          await syncFn.delMediaServerInfo(redisInfo, selectedUrl).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] delMediaServerInfo error : ${err}`);
            resolve({
              code: '570'
            });
            return;
          })

          mediaServerUrls.splice(mediaServerUrls.indexOf('Media:'+selectedUrl),1);
        }
      }

      //Sync Server에 새로운 방 정보 등록
      roomData.mediaServerUrl = selectedUrl;

      await syncFn.setRoom(redisInfo, roomData.roomId, roomData).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] setRoom Error ${err}`);
        resolve({
          code: '570'
        });
        return;
      })
    }

    //사용자 정보 조회
    userData = await syncFn.getUserInfoBySocketId(redisInfo, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId error : ${err}`);
      resolve({
        code: '570'
      });
      return;
    })

    let sessionId = userData.sessionId?userData.sessionId:null;
    //media server room join
    let resData = await janus_module.janusRoomJoin(roomData.mediaServerUrl, roomData.roomId, socketId, reqData.host, sessionId, redisInfo, reqData.subscribe, reqData.type).catch(err => {
      logger.error(`[ ## JANUS > SIGNAL ## ] janusRoomJoin error : ${err}`);
      resolve({
        code: '570'
      });
      return;
    })

    //Sync Server에 user 정보 등록
    userData.socketId = socketId;
    userData.sessionId = resData.sessionId;
    userData.roomInfo = {}
    userData.roomInfo[roomData.roomId] = {}
    if(reqData.type == 'cam'){
      userData.roomInfo[roomData.roomId] = {
        camFeedId: resData.feedId,
        camHandleId: resData.handleId
      }
    } else {
      userData.roomInfo[roomData.roomId] = {
        screenFeedId: resData.feedId,
        screenHandleId: resData.handleId
      }
    }

    await syncFn.setUserInfoBySocketId(redisInfo, socketId, userData).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfo Error ${err}`);
      resolve({
        code: '570'
      });

      return;
    });

    resolve({
      code: '200'
    });
  })
}

exports.sdpVideoRoom = async (socketId, redisInfo, reqData) => {
  return new Promise(async (resolve, reject) => {

    //user data 가져오기
    let userData = await syncFn.getUserInfoBySocketId(redisInfo, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId Error ${err}`);
      resolve({
        code: '543'
      });
      return;
    });

    //handle id
    let handleId;

    //camera / screen 구분해서 handleId 가져오기
    if(reqData.type === 'cam'){
      handleId = userData.roomInfo[reqData.roomId].camHandleId;
    } else {
      handleId = userData.roomInfo[reqData.roomId].screenHandleId;
    }

    let roomData = await syncFn.getRoomDetail(redisInfo, reqData.roomId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
      resolve({
        code: '543'
      });
      return;
    })

    let janusResData = {};

    let sendData = {}

    if(reqData.sdp.type === 'offer' || reqData.sdp.type === 'OFFER'){
      janusResData[socketId] = await fn_janus.sendOffer(roomData.mediaServerUrl, handleId, reqData.sdp, true, socketId).catch(err => {
        logger.error(`[ ## JANUS > SIGNAL ## ] sendOffer : ${err}`);
        delete janusResData[socketId];
        resolve({
          code: '570'
        });
        return;
      });

      if(janusResData[socketId] && janusResData[socketId].janus === 'error'){
        delete janusResData[socketId];
        resolve({
          code: '570'
        });
      }

      else if(janusResData[socketId] && janusResData[socketId].jsep){
        sendData.sdp = janusResData[socketId].jsep;
        resolve(sendData);
      }

    } else if (reqData.sdp.type === 'answer' || reqData.sdp.type === 'ANSWER') {
      janusResData[socketId] = await fn_janus.sendAnswerForSubscriber(roomData.mediaServerUrl, reqData.pluginId, roomData.roomId, reqData.sdp, socketId).catch(err => {
        logger.error(`[ ## JANUS > SIGNAL ## ] sendAnswerForSubscriber : ${err}`);
        delete janusResData[socketId];
        resolve({
          code: '570'
        });
        return;
      });

      if(janusResData[socketId] && janusResData[socketId].janus && janusResData[socketId].janus === 'error'){
        delete janusResData[socketId];
        resolve({
          code: '570'
        });
        return;
      }

      resolve({
        code: '200'
      });
    }
  })
}

exports.receiveFeed = async (socketId, reqData) => {
  return new Promise(async (resolve, reject) => {

    let resJanusData;

    //plugin 생성
    resJanusData = await fn_janus.attachVideoRoomPlugin('', socketId).catch(err => {
      logger.error(`[ ## JANUS > SIGNAL ## ] attachVideoRoomPlugin : ${err}`);
    });

    //subscriber로 입장
    resJanusData = await fn_janus.joinRoomAsSubscriber('', resJanusData.data.id, reqData.roomId, reqData.feedId, socketId).catch(err => {
      logger.error(`[ ## JANUS > SIGNAL ## ] joinRoomAsSubscriber : ${err}`);
    });

    //TODO(type) sdp offer client로 전달
    let resData = {
      'sdp': resJanusData.jsep,
      'pluginId': resJanusData.sender,
      'display': reqData.display,
      'type': reqData.display.indexOf('_screen') > -1 ? 'screen' : 'cam'
    }

    resolve(resData);
  })
}

exports.exitVideoRoom = async (socket, redisInfo, reqData) => {
  return new Promise(async (resolve, reject) => {
    //socket id
    let socketId = socket.id;

    //유저 정보
    let userData = {};

    //room 정보
    let roomData = {};

    //socket id로 user 정보 가져오기
    userData = await syncFn.getUserInfoBySocketId(redisInfo, socketId).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId Error ${err}`);
    });

    //유저 정보가 없을 시 바로 종료
    if(!userData){
        logger.info(`[ ## SYNC > SIGNAL ### ] There is no such user in Sync Server`);
        resolve({
          code: '543'
        });
        return;
    }

    //화면 공유 종료 일때
    if(reqData && reqData.type && reqData.type == 'screen'){
        let screenHandleId = userData.roomInfo[reqData.roomId].screenHandleId;

        //handleId 정보 삭제
        await syncFn.delUserInfoByHandleId(redisInfo, screenHandleId).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] delUserInfoByHandleId Error ${err}`);
        });

        userData.roomInfo[reqData.roomId].screenHandleId = '';
        userData.roomInfo[reqData.roomId].screenFeedId = '';

        await syncFn.setUserInfoBySocketId(redisInfo, socketId, userData).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfoBySocketId Error ${err}`);
        });
    }
    //특정한 방에서 퇴장 요청 일때
    else if(reqData){

        //Sync Server에서 정보 가져오기
        roomData = await syncFn.getRoomDetail(redisInfo, reqData.roomId).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
        })

        if(!roomData){
            logger.info(`[ ## SYNC > SIGNAL ### ] There is no such room in Sync Server`);
            resolve({
              code: '543'
            });
            return;
        }

        //현재 인원 수 체크
        let userCount = 0;

        //Media Server videoroom 퇴장
        await fn_janus.leaveRoomAsPublisher(roomData.mediaServerUrl, userData.roomInfo[reqData.roomId].camHandleId, reqData.roomId, socketId).catch(err => {
          logger.error(`[ ## JANUS > SIGNAL ## ] leaveRoomAsPublisher : ${err}`);
        });

        //Media Server videoroom 참가자 인원 조회
        let list = await fn_janus.listParticipants(roomData.mediaServerUrl, userData.roomInfo[reqData.roomId].camHandleId, socketId, reqData.roomId).catch(err => {
          logger.error(`[ ## JANUS > SIGNAL ## ] listParticipants : ${err}`);
        })

        userCount = (list && list.plugindata.data.participants)? list.plugindata.data.participants.length : 0;

        if(userCount < 1){
          //Sync Server에서 room 정보 삭제
          delete roomData["mediaServerUrl"];
          await syncFn.setRoom(redisInfo, roomData.roomId, roomData).catch(err => {
              logger.error(`[ ## SYNC > SIGNAL ### ] delRoom Error ${err}`);
          });

          //Media Server에 room 삭제
          await fn_janus.destroyRoom(roomData.mediaServerUrl, userData.roomInfo[reqData.roomId].camHandleId, roomData.roomId, socketId).catch(err => {
              logger.error(`[ ## JANUS > SIGNAL ## ] destroyRoom : ${err}`);
          })
        }

        //유저 정보에서 특정 방 삭제
        await syncFn.delUserInfoByHandleId(redisInfo, userData.roomInfo[reqData.roomId].camHandleId).catch(err => {
          logger.error(`[ ## SYNC > SIGNAL ### ] delUserInfoByHandleId Error ${err}`);
        });

        delete userData.roomInfo[reqData.roomId];
        await syncFn.setUserInfoBySocketId(redisInfo, socketId, userData).catch(err => {
          logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfoBySocketId Error ${err}`);
        });
    }
    //비정상 종료이면 모든 방에서 퇴장
    else {
        if(userData.roomInfo){
          Object.keys(userData.roomInfo).map(async (roomId) => {
            //Sync Server에서 정보 가져오기
            roomData = await syncFn.getRoomDetail(redisInfo, roomId).catch(err => {
                logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
            })

            //TODO 방 정보가 없을 시 바로 종료
            if(!roomData){
                logger.info(`[ ## SYNC > SIGNAL ### ] There is no such room in Sync Server`);
                resolve({
                  code: '543'
                });
                return;
            }

            //현재 인원 수 체크
            let userCount = 0;

            //media server video room 퇴장
            await fn_janus.leaveRoomAsPublisher(roomData.mediaServerUrl, userData.roomInfo[roomId].camHandleId, roomId, socketId).catch(err => {
                logger.error(`[ ## JANUS > SIGNAL ## ] leaveRoomAsPublisher : ${err}`);
            });

            let list = await fn_janus.listParticipants(roomData.mediaServerUrl, userData.roomInfo[roomId].camHandleId, socketId, roomId).catch(err => {
                logger.error(`[ ## JANUS > SIGNAL ## ] listParticipants : ${err}`);
            })

            userCount = (list && list.plugindata.data.participants)? list.plugindata.data.participants.length : 0;

            if(userCount < 1){
                logger.info(`[ ## SIGNAL > SYNC ### ] delete room : ${roomId}`);
                await syncFn.delRoom(redisInfo, roomData.roomId).catch(err => {
                    logger.error(`[ ## SYNC > SIGNAL ### ] delRoom Error ${err}`);
                })
            }

            socket.leave(roomData.roomId);

          })
        }

        //user 정보 삭제
        await syncFn.delUserInfo(redisInfo, socketId).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] delUserInfo Error ${err}`);
        });

        //Signal <-> Media Websocket disconnection
        fn_janus.deleteSocket(socketId);

    }
    resolve({
      code: '200'
    });
  })
}

exports.disconnect = async (socket, redisInfo, socketIo) => {
  return new Promise(async (resolve, reject) => {
    //socket id
    let socketId = socket.id;

    //유저 정보
    let userData = {};

    //room 정보
    let roomData = {};

    //socket id로 user 정보 가져오기
    userData = await syncFn.getUserInfoBySocketId(redisInfo, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId Error ${err}`);
    });

    //유저 정보가 없을 시 바로 종료
    if (!userData) {
      logger.info(`[ ## SYNC > SIGNAL ### ] There is no such user in Sync Server`);
      resolve({
        code: '543'
      });
      return;
    }

    let isViaMediaServer = false;

    if (userData.roomInfo) {
      Object.keys(userData.roomInfo).map(async (roomId) => {
        //Sync Server에서 정보 가져오기
        roomData = await syncFn.getRoomDetail(redisInfo, roomId).catch(err => {
          logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
        })

        if (!roomData) {
          logger.info(`[ ## SYNC > SIGNAL ### ] There is no such room in Sync Server`);
          resolve({
            code: '543'
          });
          return;
        }

        //현재 인원 수 체크
        let userCount = 0;

        //media server video room 퇴장
        if (roomData && roomData.mediaServerUrl) {
          isViaMediaServer = true;
          await fn_janus.leaveRoomAsPublisher(roomData.mediaServerUrl, userData.roomInfo[roomId].camHandleId, roomId, socketId).catch(err => {
            logger.error(`[ ## JANUS > SIGNAL ## ] leaveRoomAsPublisher : ${err}`);
          });

        }

        //Sync Server에서 방 나가기
        await syncFn.exitRoom(redisInfo, roomId, socketId).catch(err => {
          logger.error(`[ ## SYNC > SIGNAL ### ] exitRoom Error ${err}`);
        })

        //인원 수 체크
        userCount = await syncFn.getUserCount(redisInfo, roomData.roomId).catch(err => {
          logger.error(`[ ## SYNC > SIGNAL ### ] getUserCount Error ${err}`);
        })
        console.log(`check(exit) : ${userCount}`)

        //아무도 없으면 방 삭제
        if(userCount == 0){
          logger.info(`[ ## SIGNAL > SYNC ### ] delete room : ${roomData.roomId}`);
          await syncFn.delRoom(redisInfo, roomData.roomId).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] delRoom Error ${err}`);
          });
        }

        socket.leave(roomData.roomId);
      })
    }

    //user 정보 삭제
    await syncFn.delUserInfo(redisInfo, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] delUserInfo Error ${err}`);
    });

    //Signal <-> Media Websocket disconnection
    if (isViaMediaServer) fn_janus.deleteSocket(socketId);

    resolve({
      code: '200'
    });
  })
}
