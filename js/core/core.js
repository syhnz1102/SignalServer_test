const commonFn = require('./util');
const syncFn = require('./sync.service');
const fn_janus = require('./janus.service');
const janus_module = require('./janus.module');

exports.register = (socketIo, socket, redisInfo, reqData) => {
    return new Promise((resolve, reject) => {
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
    return new Promise((resolve, reject) => {
        //socket id
        let socketId = socket.id;

        //room 정보
        let roomData = {};

        //user 정보
        let userData = await syncFn.getUserInfoBySocketId(redisInfo, socketId).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId Error ${err}`);
        })

        //응답 메시지
        let roomJoinMsg = {
            resDate: commonFn.getDate()
        };

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
    return new Promise((resolve, reject) => {
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