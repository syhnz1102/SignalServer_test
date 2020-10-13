/****************************************************
* 소스정보 : janus.service.js
* 작 성 일 : 2020.07
* 작 성 자 : 정동욱
* 설    명 : Media Server관련 Method
*****************************************************/

const logger   = require('../utils/logger');
const commonFn = require('./util');
const syncFn   = require('./sync.service');
const WebSocket = require('ws');
const { signalSocket } = require('../repository/sender')

const PUBLISHERS = 50;
const bitrate = 3000000;
const VIDEOROOM_PLUGIN_ID = 'janus.plugin.videoroom';
const RECORD_PLUGIN_ID = 'janus.plugin.recordplay';

let transactions = {};
let signalSocketio;
let redisInfo;
let janus_arr = [];

//session id를 key 값으로 websokcet 객체를 참조하는 객체
let sockets = {};

//url을 key 값으로 websocket 객체를 참조하는 객체
let url_janus = {}

//sessionId를 key 값으로 url 값을 저장하고 있는 객체
let sessionId_url = {}

//sessionId를 key 값으로 socket id 값을 저장하고 있는 객체
let sessionId_sockets = {};

//응답 message 저장하고 있는 객체
let janusResData = {}

//syncServer에서 가져온 data 저장하고 있는 객체
let syncData = {}

//초기 실행 함수 method
exports.init = (_signalSocketio, _redisInfo) => {

    //socket, redis 정보 전역변수에 저장
    signalSocketio = _signalSocketio;
    redisInfo = _redisInfo;

}

//소켓 연결
const createWebSocket = (url, socketId, resolve, reject) => {
    let ws = new WebSocket('ws://' + url +':9500', 'janus-protocol');

    //message 수신 되었을 경우
    ws.onmessage = (message) => {
        messageProcessor(message, socketId);
    };

    ws.onerror = (error) => {
        logger.error(`[ ## SIGNAL > JANUS ## ] ${JSON.stringify(error)}`);
    };

    //연결 되었을 경우
    ws.onopen = async () => {

        //전역 변수에 janus url과 각 websocket 정보를 저장
        janus_arr.push(url);
        sockets[socketId] = ws;
        delete sockets['undefined'];

        //sessionId create
        this.createJanusSession(ws).then( res => {
            ws['janusSessionId'] = res.data.id;
            //sessionId를 key값으로 url 저장
            sessionId_url[res.data.id] = url;
            sessionId_sockets[res.data.id] = socketId

            //keepalive message 재귀 함수 이용하여 계속 전송
            let keepAliveInterval = setInterval(()=>{
                if(ws['janusSessionId'] && sockets[socketId]){
                    startKeepAlive(url, socketId);
                } else {
                    clearInterval(keepAliveInterval);
                }
            },45000)

            //websocket 연결 완료 resolve
            resolve(res.data.id);

        }).catch(err => {
            //websocket 연결 실패 reject
            logger.error(`[ ## JANUS > SIGNAL ## ] ${err}`)
        })
    }

    //연결이 해제 되었을 경우
    ws.onclose = async () => {
        //janus_arr 에서 url 삭제
        for(let i in janus_arr){
            if(url === janus_arr[i]){
                janus_arr.splice(i,1);
                break;
            }
        }

        //websocket 정보 삭제
        if(url_janus[url]){
            delete sessionId_url[url_janus[url].janusSessionId];
            delete sessionId_sockets[url_janus[url].janusSessionId];
            delete url_janus[url];
        }

        //재연결 시도
        let reconnectTimeout = setTimeout(()=>{
            if(sockets[socketId]){
                logger.info(`[ ## SIGNAL > JANUS ## ] try to reconnect every 30s`)
                createWebSocket(url, socketId);
            } else {
                logger.info(`[ ## SIGNAL > JANUS ## ] disconnect websocket ${socketId}`)
                clearTimeout(reconnectTimeout);
            }
        }, 30000);

        delete sockets[socketId];
    }
}

//random transaction id 만드는 method
const createTrxId = () => {
    let len=12;
    let charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomString='';

    for(let i=0;i<len;i++){
        let randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz,randomPoz+1);
    };

    return randomString;
}

//roomId create method
const createRoomId = () => {
    let len=12;
    let charSet = '0123456789';
    let randomString='';

    for(let i=0;i<len;i++){
        let randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz,randomPoz+1);
    };

    return randomString;
}

//messsage 전송 method
const sendMsg = (janus, order, msg, onSuccess, onError) => {
    let trxid = createTrxId();
    msg.transaction = trxid;

    //message 정보
    transactions[trxid]={};

    //각 응답에 대한 값 저장
    transactions[trxid].onsuccess=onSuccess;
    transactions[trxid].onerror=onError;
    transactions[trxid].order=order;

    try{
        janus.send(JSON.stringify(msg));

        //message에 sdp 정보 있을 시, 생략
        if(msg.jsep){
            msg.jsep.sdp= "SDP info ... "
        }

        //keepalive message 일시 로그 출력 하지 않도록 함
        if(msg.janus !== 'keepalive') {
            logger.info( `[ ## SIGNAL > JANUS ## ] ${JSON.stringify(msg)}`);
        }
    } catch(err) {
        logger.error(`[ ## SIGNAL > JANUS ## ] ${err}`);
    }
}

//message 받을 때 실행하는 method
const messageProcessor = async (message, socketId) => {

    let messageObj = JSON.parse(message.data);
    if(messageObj.janus === 'ack'){
        return;
    }
    let trx;
    let res;
    if(messageObj.transaction){
        trx = transactions[messageObj.transaction];
    }

    //log에 sdp 정보 나오지 않도록 출력
    let tempSDP = messageObj.jsep?messageObj.jsep.sdp:null;
    if(!tempSDP){
        logger.info(`[ ## JANUS > SIGNAL ## ] ${JSON.stringify(messageObj)}`);
    } else {
        messageObj.jsep.sdp = "sdp info ...";
        logger.info(`[ ## JANUS > SIGNAL ## ] ${JSON.stringify(messageObj)}`);
        messageObj.jsep.sdp = tempSDP
    }

    //error message를 응답 받을 시, 처리
    if(messageObj.plugindata && messageObj.plugindata.data && messageObj.plugindata.data.error_code) {
        res = {
            error : messageObj.plugindata.data.error,
            error_code : messageObj.plugindata.data.error_code
        };

        trx.onerror(res);
        delete transactions[messageObj.transaction];

        return false;
    }

    //publisher event 수신 시, subscriber로 입장
    else if(messageObj.janus == 'event' && messageObj.plugindata && messageObj.plugindata.data && messageObj.plugindata.data.publishers && messageObj.plugindata.data.publishers.length>0){
        let publishers = messageObj.plugindata.data.publishers;
        let roomId = messageObj.plugindata.data.room;

        //publisher로 join 했던 handle id 값으로 user 정보 가져오기
        syncData[messageObj.sender] = await syncFn.getUserInfoByHandleId(redisInfo, messageObj.sender).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoByHandleId error : ${err}`);
        });

        //TODO 다른 참가자들의 영상 받는 경우 client로 해당 정보 전송(본인의 화면을 subscriber로 join하지 않도록)
        if(syncData[messageObj.sender].subscribe && publishers[0].display != syncData[messageObj.sender].socketId + "_screen"){
            //client에 보낼 message
            let data = {
                eventOp:"ReceiveFeed",
                roomId: roomId,
                feeds: publishers,
            }

            //client에 sdpData 전송
            sendToClient(syncData[messageObj.sender].socketId, data);
        }
    }

    //화자감지
    else if(messageObj.janus == 'event' && messageObj.plugindata && messageObj.plugindata.data && messageObj.plugindata.data.videoroom && (messageObj.plugindata.data.videoroom == 'talking' || messageObj.plugindata.data.videoroom == 'stopped-talking')){
        let roomId = messageObj.plugindata.data.room;

        //publisher로 join 했던 handle id 값으로 user 정보 가져오기
        syncData[messageObj.sender] = await syncFn.getUserInfoByHandleId(redisInfo, messageObj.sender).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoByHandleId error : ${err}`);
        });

        let uidForCCC = await syncFn.getUserInfoBySocketId(redisInfo, syncData[messageObj.sender].socketId).catch(err => {
            logger.error(`[ ## SYNC > SIGNAL ### ] getUserInfoBySocketId error : ${err}`);
        });

        //client에 보낼 message
        let data = {
            signalOp:"Presence",
            who: uidForCCC && uidForCCC.ID? uidForCCC.ID:syncData[messageObj.sender].socketId,
            talking: messageObj.plugindata.data.videoroom === 'talking'
        }

        //room에 화자 정보 전송
        sendToRoom(syncData[messageObj.sender].socketId, roomId, data);

    }

    //slowlink event
    else if(messageObj.janus === 'slowlink'){

        // //client에 보낼 message
        // let data = {
        //     signalOp: 'Presence',
        //     action: 'slowlink'
        // }
        //
        // //client에 sdpData 전송
        // sendToClient(sessionId_sockets[messageObj.session_id], data);
    }

    //받은 message를 resolve로 return
    res = messageObj;
    if(trx){
        trx.onsuccess(res);
        delete transactions[messageObj.transaction]
    }


}

///////////// message 보내는 method 모음 /////////////

//해당 미디어 서버가 살아있는지 체크하고 재귀로 계속 keepalive message 전송
const startKeepAlive = (url, socketId) => {
    let order = 'keepalive';
    let request = {
        janus : order,
        session_id : sockets[socketId].janusSessionId
    };

    sendMsg(sockets[socketId], order, request, true, (err)=>{console.log('keepalive ERROR..', err)});
}

//client한테 직접 message 전송
const sendToClient = async (socketId, data) => {

    data.reqNo = await commonFn.reqNo();
    data.reqDate = commonFn.getDate();

    signalSocket.emit(socketId, data);
}

//room에 전달
const sendToRoom = async (socketId, roomId, data) => {
    data.reqNo = await commonFn.reqNo();
    data.reqDate = commonFn.getDate();

    signalSocket.room(roomId, data);

}

//Client 연결 시 실행하여 websocket연결
exports.createSocket = (url, socketId) => {
    return new Promise((resolve, reject) => {
        createWebSocket(url, socketId, resolve, reject);
    })
}

//Client와 연결이 끊겼을 때, websocket 정보 삭제
exports.deleteSocket = (socketId) => {
    if(sockets[socketId]){
        sockets[socketId].close();
        logger.info(`[ ## SIGNAL > JANUS ## ] ${socketId} closing`);
        delete sockets[socketId];
    }
}

//sessionId 값 생성 method
exports.createJanusSession = (ws) => {
    return new Promise((resolve, reject) => {
        let order = 'create';
        let msg = {
            janus: order
        };

        sendMsg(ws, order, msg, resolve, reject);
    })
}

//videoRoom plugin에 attach 하고 handleId 받는 method
exports.attachVideoRoomPlugin = (url, socketId,) => {
    return new Promise((resolve, reject) => {
        let order = 'attach';
        let msg = {
            janus : order,
            opaqueId : VIDEOROOM_PLUGIN_ID + "-" + createTrxId(),
            session_id : sockets[socketId].janusSessionId,
            plugin : VIDEOROOM_PLUGIN_ID
        };

        sendMsg(sockets[socketId], order, msg, resolve, reject);
    })
}

//plugin에서 detach 하는 method
exports.detachVideoRoomPlugin = (url, socketId) => {
    return new Promise((resolve, reject) => {
        let order = 'detach';
        let msg = {
            janus      : order,
            opaqueId   : VIDEOROOM_PLUGIN_ID + "-" + createTrxId(),
            session_id : sockets[socketId].janusSessionId,
            handle_id  : videoRoomPluginId,
        };

        sendMsg(sockets[socketId], order, msg, resolve, reject);
    });
}

//videoRoom create 하는 method
exports.createRoom = (url, handleId, publisherNumber, socketId, roomId) => {
    return new Promise((resolve, reject) => {
        let order = 'createVideoRoom';
        let msg = {
            janus      : 'message',
            session_id : sockets[socketId].janusSessionId,
            handle_id  : handleId,
            body : {
                request    : 'create',
                publishers : publisherNumber,
                room       : roomId,
                // audiolevel_event: true,
                // audio_level_average: 70,
                record : false,
                rec_dir: '/home/kpoint/justinjung/janus/share/janus/recordings/'
            }
        };
        sendMsg(sockets[socketId], order, msg, resolve, reject);
    });
}

//videoRoom destroy 하는 method
exports.destroyRoom = (url, handleId, janusRoomId, socketId) => {
    return new Promise((resolve, reject) => {
        let order = 'destroyVideoRoom';
        let msg = {
            janus : 'message',
            session_id : sockets[socketId].janusSessionId,
            handle_id : handleId,
            body : {
                request : 'destroy',
                room : janusRoomId
            }
        };
        sendMsg(sockets[socketId], order, msg, resolve, reject);
    });
};

//publisher로 join 하는 method
exports.joinRoomAsPublisher = (url, handleId, janusRoomId, socketId, type) => {
    return new Promise((resolve, reject) => {
        let order = 'message';
        let displayId = type == 'cam'? socketId : socketId + "_screen"
        let msg = {
            janus      : order,
            session_id : sockets[socketId].janusSessionId,
            handle_id  : handleId,
            body : {
                request : 'join',
                room    : janusRoomId,
                ptype   : 'publisher',
                display : displayId
            }
        };
        sendMsg(sockets[socketId], order, msg, resolve, reject);
    })
}

//subscriber로 join 하는 method
exports.joinRoomAsSubscriber = (url, handleId, janusRoomId, feedId, socketId) => {
    return new Promise((resolve, reject) => {
        let order = 'message';
        let msg = {
            janus : order,
            session_id : sockets[socketId].janusSessionId,
            handle_id : handleId,
            body : {
                request : 'join',
                room : janusRoomId,
                ptype : 'subscriber',
                feed : feedId
            }
        }

        sendMsg(sockets[socketId], order, msg, resolve, reject);
    })
}

//publisher가 방을 나가는 method
exports.leaveRoomAsPublisher = (url, handleId, janusRoomId, socketId) => {
    return new Promise((resolve, reject) => {
        let order = 'message';
        let msg = {
            janus      : order,
            session_id : sockets[socketId].janusSessionId,
            handle_id  : handleId,
            body : {
                request : 'leave',
                room    : janusRoomId
            }
        };
        sendMsg(sockets[socketId], order, msg, resolve, reject);
    })
}

//publisher가 offer 보내는 method
exports.sendOffer = (url, handleId, sdp, audio, socketId) => {
    return new Promise((resolve, reject) => {
        let order = 'message';
        let msg = {
            janus : order,
            session_id : sockets[socketId].janusSessionId,
            handle_id : handleId,
            body : {
                request : 'publish',
                audio : audio,
                video : true
            },
            jsep : sdp
        }

        sendMsg(sockets[socketId], order, msg, resolve, reject);
    })
}

//subscriber 가 answer 보내는 method
exports.sendAnswerForSubscriber = (url, handleId, janusRoomId, sdp, socketId) => {
    return new Promise((resolve, reject) => {
        let order = 'message';
        let msg = {
            janus : order,
            session_id : sockets[socketId].janusSessionId,
            handle_id : handleId,
            body : {
                request : 'start',
                room : janusRoomId
            },
            jsep : sdp
        }

        sendMsg(sockets[socketId], order, msg, resolve, reject);

    })
}

//subscriber 가 answer 보내는 method
exports.configureForSubscriber = (url, handleId, janusRoomId, sdp, socketId, video, audio) => {
    return new Promise((resolve, reject) => {
        let order = 'message';
        let msg = {
            janus : order,
            session_id : sockets[socketId].janusSessionId,
            handle_id : handleId,
            body : {
                request : 'configure',
                video : video,
                audio : audio
            }
        }

        sendMsg(sockets[socketId], order, msg, resolve, reject);

    })
}

//참가자 list 조회하는 method
exports.listParticipants = (url, handleId, socketId, janusRoomId) => {
    return new Promise((resolve, reject) => {
        let order = 'message';
        let msg = {
            janus: order,
            session_id: sockets[socketId].janusSessionId,
            handle_id: handleId,
            body: {
                request: 'listparticipants',
                room: janusRoomId
            }
        }

        sendMsg(sockets[socketId], order, msg, resolve, reject);
    })
}

//Janus-gateway health check method
exports.pingMediaServer = async (url) => {
    return new Promise((resolve, reject) => {
        let ws = new WebSocket('ws://' + url +':9500', 'janus-protocol');

        let timeCheck = setTimeout(()=> {
            resolve(false)
        },1500)

        ws.onerror = (error) => {
            logger.error(`[ ## SIGNAL > JANUS ## ] ${JSON.stringify(error)}`);
            resolve(false)
        };

        //연결 되었을 경우
        ws.onopen = async () => {
            ws.close();
            clearTimeout(timeCheck)
            resolve(true);
        }
    })
}
