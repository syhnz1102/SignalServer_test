const common = require('../utils/common')

const rejectCode = (async () => {
  return {
    code: '500',
    message: await common.codeToMsg(500)
  }
})();

exports.getRoom = function (redis, roomId) {
  return new Promise(function (resolve, reject) {
    if (!roomId) {
      resolve(null);
      return;
    }

    redis.hget("ROOMS_INFO", roomId, function (error, obj) {
      let objectRoom = JSON.parse(obj);
      if (error || !obj) {
        return resolve(null);
      }
      if (obj) {
        resolve(objectRoom);
      } else {
        reject(null);
      }
    });
  });
};

exports.getUserInfoByUserId = function (redis, userId) {
  return new Promise(resolve => {
    redis.hget("USER_INFO_BY_USER_ID", userId, (e, obj) => {
      if (e || !obj) return resolve(-1);
      resolve(JSON.parse(obj));
    });
  });
};

exports.getUserInfoBySocketId = function (redis, sessionId) {
  return new Promise(resolve => {
    redis.hget("USER_INFO_BY_SOCKET_ID", sessionId, (e, obj) => {
      resolve(JSON.parse(obj));
    });
  });
};

exports.setUserInfo = function (redis, userId, socketId, serviceType, type, roomId, cp, p2p_start, p2p_end, n2n_start, n2n_end) {
  return new Promise(resolve => {
    redis.hget("USER_INFO_BY_SOCKET_ID", socketId, (e, obj) => {
      if (!obj) return resolve(-1);
      let o = JSON.parse(obj);
      o.ID = userId;
      o.SERVICE_TYPE = serviceType;
      o.TYPE = type;
      o.CP = cp;
      o.P2P_START = o.P2P_START? o.P2P_START:p2p_start;
      o.P2P_END = o.P2P_END? o.P2P_END:p2p_end;
      o.N2N_START = o.N2N_START? o.N2N_START: n2n_start;
      o.N2N_END = n2n_end;

      redis.hset("USER_INFO_BY_SOCKET_ID", socketId, JSON.stringify(o), () => {
        let userIdData = {SOCKET_ID: socketId, ROOM_ID: "", SERVICE_TYPE: serviceType, TYPE: type, CP: cp, P2P_START: p2p_start, P2P_END: p2p_end, N2N_START: n2n_start, N2N_END: n2n_end};
        redis.hset("USER_INFO_BY_USER_ID", userId, JSON.stringify(userIdData));
        resolve();
      });
    });
  });
};

exports.setUserInfoWithSocketId = (redis, sessionId, data) => {
  return new Promise((resolve, reject) => {
    redis.hset("USER_INFO_BY_SOCKET_ID", sessionId, JSON.stringify(data), error => {
      if(error){
        reject(rejectCode);
        return false;
      }
      resolve();
    })
  })
};
exports.createRoom = (redis, roomId) => {
  return new Promise(resolve => {
    redis.hget("ROOMS_INFO", roomId, function (error, obj) {
      if (error || !obj) return resolve(-1);
      let roomInfo = JSON.parse(obj);
      roomInfo.USERS = {};
      roomInfo.MULTITYPE = 'N';
      roomInfo.SCREEN = { FLAG: false, USERID: null }

      redis.hset("ROOMS_INFO", roomId, JSON.stringify(roomInfo));
      resolve();
    });
  });
}

exports.enterRoom = (redis, { uid, userName, sessionId, roomId, multiType }) => {
  return new Promise(resolve => {
    redis.hget("ROOMS_INFO", roomId, function (error, obj) {
      if (error || !obj) return resolve(-1);

      let roomInfo = JSON.parse(obj);
      roomInfo.ADMIN = !roomInfo.ADMIN ? sessionId : roomInfo.ADMIN;
      roomInfo.USERS[uid] = { NAME: userName, sessionId };
      roomInfo.MULTITYPE = roomInfo.MULTITYPE === 'Y' ? 'Y' : (Object.keys(roomInfo.USERS).length > 2 ? 'Y' : 'N');
      if(multiType){
        roomInfo.MULTITYPE = 'Y'
      }
      redis.hset("ROOMS_INFO", roomId, JSON.stringify(roomInfo));
      redis.hget("USER_INFO_BY_USER_ID", uid, (e, obj) => {
        let o = JSON.parse(obj);
        o.ROOM_ID = roomId;
        redis.hset("USER_INFO_BY_USER_ID", uid, JSON.stringify(o), () => {
          resolve(roomInfo);
        });
      });
      // redis.hget("USER_INFO_BY_SOCKET_ID", sessionId, (e, obj) => {
      //   let o = JSON.parse(obj);
      //   o.ROOM_ID = roomId;
      //   redis.hset("USER_INFO_BY_SOCKET_ID", sessionId, JSON.stringify(o), () => {
      //     resolve(roomInfo);
      //   });
      // });
    });
  });
}

exports.deleteRoom = function (redis, roomId) {
  return new Promise(function (resolved) {
    redis.hdel("ROOMS_INFO", roomId, function (error, obj) {
      resolved(obj);
    });
  });
};

exports.isScreenSharePossible = function (redis, roomId, userId, callback) {
  if (typeof callback !== "function") return;

  if (!roomId) {
    logger.error('isScreenSharePossible roomid 없음.');
    return;
  }

  redis.hget("ROOMS_INFO", roomId, function (err, obj) {
    if (err) {
      console.log(err);
      callback('error');
      return;
    }

    let result = JSON.parse(obj);
    try {
      if (result.SCREEN.USERID && result.SCREEN.USERID === userId) {
        callback(true);
        return;
      }

      if (!result.SCREEN.FLAG) {
        callback(true);
        return;
      }
    } catch (e) {
      callback('error');
      return false;
    }

    callback(false);
  });
};

exports.setScreenShareFlag = function (redis, roomId, userId, callback) {
  if (typeof callback !== "function") return;

  redis.hget("ROOMS_INFO", roomId, function (err, obj) {
    if (err) {
      console.log(err);
      return;
    }
    try {
      let result = JSON.parse(obj);
      result.SCREEN.FLAG = true;
      result.SCREEN.USERID = userId;

      redis.hset("ROOMS_INFO", roomId, JSON.stringify(result), function (err, res) {
        if (err) {
          callback(err, null);
          return;
        }
        callback(null);
      });
    } catch (e) {
      console.log(e)
      return;
    }
  });
};

exports.resetScreenShareFlag = function (redis, userId, roomId) {
  return new Promise((resolve) => {
    if (!roomId) return resolve("error");

    redis.hget("ROOMS_INFO", roomId, function (err, obj) {
      if (err) return;
      let result = JSON.parse(obj);

      try {
        if (userId === result.SCREEN.USERID) {
          result.SCREEN.FLAG = false;
          result.SCREEN.USERID = null;

          redis.hset("ROOMS_INFO", roomId, JSON.stringify(result), function (err, res) {
            if (err) return resolve(err);
            resolve(null);
          });
        } else {
          resolve("user error");
        }
      } catch (e) {
        console.log(e);
      }
    });
  })

};

exports.changeItemInRoom = (redis, roomId, userId, item, value) => {
  return new Promise(resolve => {
    redis.hget("ROOMS_INFO", roomId, (e, obj) => {
      let roomInfo;
      try {
        roomInfo = JSON.parse(obj);
        roomInfo.USERS[userId][item] = value;

        redis.hset("ROOMS_INFO", roomId, JSON.stringify(roomInfo), () => {
          resolve(roomInfo);
        })
      } catch (e) {
        console.log(e)
      }
    });
  });
}

exports.leaveRoom = (redis, roomId, sessionId) => {
  // FROM CCC: written by ivypark
  return new Promise(resolve => {
    redis.hget("ROOMS_INFO", roomId, (e, obj) => {
      let roomInfo = JSON.parse(obj);
      redis.hget("USER_INFO_BY_SOCKET_ID", sessionId, (e, obj) => {
        try {
          let o = JSON.parse(obj);
          if(roomInfo.USERS && roomInfo.USERS[o.ID]){
            delete roomInfo.USERS[o.ID];
          }
          redis.hset("ROOMS_INFO", roomId, JSON.stringify(roomInfo));
          redis.hdel("USER_INFO_BY_USER_ID", o.ID);
          resolve(roomInfo);
        } catch (e) {
          console.log(e);
        }
      });
    });
  });
}
