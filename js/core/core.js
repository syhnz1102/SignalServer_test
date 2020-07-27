const commonFn = require('./util');
const syncFn = require('./sync.service');
const fn_janus = require('./janus.service');
const janus_module = require('./janus.module');
const logger = require('../utils/logger');

exports.register = (socketIo, socket, redisInfo, reqData) => {
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

    resolve(true);
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

    //응답 메시지
    let roomJoinMsg = {};

    //host인 경우 방 생성
    if(reqData.host && !reqData.roomId){
      //새로운 roomId 생성
      if(!reqData.roomId){
        //room id 생성
        roomData.roomId = await commonFn.getRoomId();
      }
      //요청한 roomId로 roomId 생성
      else {
        roomData.roomId = reqData.roomId;
      }

      await syncFn.setRoom(redisInfo, roomData.roomId, roomData).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] setRoom Error ${err}`);
      })
    }
    //이미 존재하는 방에 입장 하는 경우
    else {
      roomData = await syncFn.getRoomDetail(redisInfo, reqData.roomId).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
      })

      if(!roomData){
        resolve(false);
        return;
      }
    }

    roomJoinMsg.roomId = roomData.roomId;

    //socket join
    socket.join(roomData.roomId);

    //user 정보에 방 정보 추가
    userData.roomInfo = {};
    userData.roomInfo[roomData.roomId] = {};

    await syncFn.setUserInfoBySocketId(redisInfo, socketId, userData).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfoBySocketId Error ${err}`);
    });

    //현재 socket room 인원
    let userCount = 0;
    if(socketIo.adapter.rooms[roomData.roomId]){
      userCount = socketIo.adapter.rooms[roomData.roomId].length
    }

    //응답 메시지에 인원수 추가
    roomJoinMsg.count = userCount;

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
      resolve(false);
      return;
    }

    //방 정보 가져오기
    roomData = await syncFn.getRoomDetail(redisInfo, data.roomId).catch(err => {
      logger.info(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
    });

    //방 정보가 없을 시 바로 종료
    if(!roomData){
      logger.info(`[ ## SYNC > SIGNAL ### ] There is no such room in Sync Server`);
      resolve(false);
      return;
    }

    delete userData.roomInfo[data.roomId];

    socket.leave(data.roomId);

    //인원 수 체크 해서 sync server에서 room 정보 지우기
    let userCount = 0;
    if(socketIo.adapter.rooms[data.roomId]){
      userCount = socketIo.adapter.rooms[data.roomId].length;

      //아무도 없으면 방 삭제
      if(userCount == 0){
        await syncFn.delRoom(redisInfo, roomData.roomId).catch(err => {
          logger.error(`[ ## SYNC > SIGNAL ### ] delRoom Error ${err}`);
        });
      }
    }

    await syncFn.setUserInfoBySocketId(redisInfo, socketId, userData).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfoBySocketId Error ${err}`);
    });

    resolve(true);
  })
}

exports.joinVideoRoom = async (socketIo, socket, redisInfo, reqData) => {
  return new Promise(async (resolve, reject) => {
    //socket id
    let socketId = socket.id;

    //방 정보
    let roomData = {};

    //유저 정보
    let userData = {};

    roomData.roomId = reqData.roomId;

    //host인 경우 load balacing하여 media server url 선택
    if(reqData.host){

      //media server load balancing
      let mediaServerUrls = await syncFn.getJanusUrls(redisInfo).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] getJanusUrls error : ${err}`);
        resolve(false);
        return;
      });

      let selectedUrl = '';
      let cpuUsage = 101;

      //cpu 사용량이 적은 Media Server 찾기
      for(let i in mediaServerUrls){
        let url = mediaServerUrls[i];

        let serverStatus = await syncFn.getMediaServerInfo(redisInfo, url).catch(err => {
          logger.error(`[ ## SYNC > SIGNAL ### ] getJanusUrls error : ${err}`);
          resolve(false);
          return;
        })

        if(serverStatus && (cpuUsage > serverStatus.cpu)){
          cpuUsage = serverStatus.cpu;
          selectedUrl = url;
        }
      }

      //Sync Server에 새로운 방 정보 등록
      roomData.mediaServerUrl = selectedUrl;

      await syncFn.setRoom(redisInfo, roomData.roomId, roomData).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] setRoom Error ${err}`);
        resolve(false);
        return;
      })
    }
    //이미 room이 존재 하는 경우
    else {
      //room data 가져오기
      roomData = await syncFn.getRoomDetail(redisInfo, reqData.roomId).catch(err => {
        logger.error(`[ ## SYNC > SIGNAL ### ] getRoomDetail Error ${err}`);
        resolve(false);
        return;
      })

      if(!roomData){
        logger.info(`[ ## SYNC > SIGNAL ### ] There is no such room in Sync Server`);
        resolve(false);
        return;
      }
    }

    //사용자 정보 조회
    let userDataFromSync = await syncFn.getUserInfoBySocketId(redisInfo, socketId).catch(err => {
      logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId error : ${err}`);
      resolve(false);
      return;
    })

    let sessionId = userDataFromSync.sessionId?userDataFromSync.sessionId:null;

    //media server room join
    let resData = await janus_module.janusRoomJoin(roomData.mediaServerUrl, roomData.roomId, socketId, reqData.host, sessionId, redisInfo, reqData.subscribe, reqData.type).catch(err => {
      logger.error(`[ ## JANUS > SIGNAL ## ] janusRoomJoin error : ${err}`);
      resolve(false);
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
      resolve(false);
      return;
    });

    resolve(true);
  })
}