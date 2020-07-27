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