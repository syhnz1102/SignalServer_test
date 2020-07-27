const fn_janus = require('./janus.service');
const logger   = require('../utils/logger');
const syncFn   = require('./sync.service');

exports.janusRoomJoin = (url, roomId, socketId, host, sessionId, redisInfo, subscribe, type) => {
    return new Promise(async (resolve, reject) => {
        let resData;
        let returnData = {};

        //sessionId가 없는 경우
        if(!sessionId){
            //Signal <-> Media websocket 연결
            resData = await fn_janus.createSocket(url, socketId).catch(err => {
                logger.error(`[ ## JANUS > SIGNAL ## ] createSocket Error ${err}`);
                return;
            });
        
            //websocket session id return
            returnData.sessionId = resData;
        } 
        //이미 sessionId가 있는 경우
        else {
            returnData.sessionId = sessionId;
        }
    
        //publisher plugin id 요청
        resData = await fn_janus.attachVideoRoomPlugin('',socketId).catch(err => {
            logger.error(`[ ## JANUS > SIGNAL ## ] attachVideoRoomPlugin : ${err}`);
            reject();
        });
    
        //publisher handle id return
        returnData.handleId = resData.data.id;

        let userData = {
            'socketId': socketId,
            'subscribe': subscribe,
            type
        }

        await syncFn.setUserInfoByHandleId(redisInfo, returnData.handleId, userData).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] setUserInfoByHandleId Error ${err}`);
        })

        
        //host인 경우 room 생성
        if(host){
            resData = await fn_janus.createRoom(url, returnData.handleId, 30, socketId, roomId).catch(err => {
                logger.error(`[ ## JANUS > SIGNAL ## ] createRoom : ${err}`);
                reject();
            })
        }
    
        //publisher로 room에 입장
        resData = await fn_janus.joinRoomAsPublisher(url, returnData.handleId, roomId, socketId, type).catch(err => {
            logger.error(`[ ## JANUS > SIGNAL ## ] joinRoomAsPublisher : ${err}`);
            reject();
        });
    
        //publish feed id return
        returnData.feedId = resData.plugindata.data.id;

        resolve(returnData);
    })
}