exports.getRoom = function (redis, roomId) {
  return new Promise(function (resolve, reject) {
    if (!roomId) {
      resolve(null);
      return;
    }

    redis.hget("ROOMS_INFO", roomId, function (error, obj) {
      let objectRoom = JSON.parse(obj);
      if (error || !obj) return resolve(null);
      if (obj) {
        resolve(objectRoom);
      } else {
        reject(null);
      }
    });
  });
};

exports.setUserInfo = function (redis, userId, socketId, serviceType, type) {
  let socketIdData = { socketId: socketId, ID: userId, ROOM_ID: "", SERVICE_TYPE: serviceType, TYPE: type };
  let userIdData = { SOCKET_ID: socketId, ROOM_ID: "", SERVICE_TYPE: serviceType, TYPE: type };

  redis.hset("USER_INFO_BY_SOCKET_ID", socketId, JSON.stringify(socketIdData));
  redis.hset("USER_INFO_BY_USER_ID", userId, JSON.stringify(socketIdData));
};