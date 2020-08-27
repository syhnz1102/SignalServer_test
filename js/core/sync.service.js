/****************************************************
* 소스정보 : sync.service.js
* 작 성 일 : 2020.07
* 작 성 자 : 정동욱
* 설    명 : Sync Server관련 Method
*****************************************************/

const common = require('../utils/common')

//String으로 변환
function setString(data){
	return JSON.stringify(data);
}

//Object로 변환
function setObject(data){
	return JSON.parse(data);
}


const rejectCode = (async () => {
	return {
		code: '500',
		message: await common.codeToMsg(500)
	}
})();

/****************************** user 정보 관련 method ******************************/

//socket id를 key값으로 user info 담는 method
exports.setUserInfoBySocketId = (redis, socketId, data) => {
	return new Promise((resolved, rejected) => {
		redis.hset('USER_INFO_BY_SOCKET_ID', socketId, setString(data), error => {
			if(error){
				rejected({rejectCode});
				return false;
			}
			resolved(true);
		})
	});
}

//socket id로 user info 가져오기
exports.getUserInfoBySocketId = (redis, socketId) => {
    return new Promise(function(resolved, rejected){
        redis.hget('USER_INFO_BY_SOCKET_ID', socketId, (error, userObj) => {
            let user = setObject(userObj);
            resolved(user);
        });
    });
}

//handle id를 key값으로 user info 담는 method
exports.setUserInfoByHandleId = (redis, handleId, data) => {
	return new Promise((resolved, rejected) => {
		redis.hset('USER_INFO_BY_HANDLE_ID', handleId, setString(data), error => {
			if(error){
				rejected(rejectCode);
				return false;
			}
			resolved(true);
		})
	});
}

//handle id로 user info 가져오기
exports.getUserInfoByHandleId = (redis, handleId) => {
	return new Promise( (resolved, rejected) => {
		if(!handleId){
			resolved(null);
			return;
		}
		
		redis.hget('USER_INFO_BY_HANDLE_ID', handleId, (error, obj) => {
			if(error){
				rejected(rejectCode);
				return false;
			}
			if(obj){
				let objectData = setObject(obj);
				resolved(objectData);
			} else {
				resolved(null);
			}
		})
	})
}

//handleId에 맞는 user info 삭제
exports.delUserInfoByHandleId = (redis, handleId) => {
	return new Promise((resolved, rejected) => {
		redis.hdel('USER_INFO_BY_HANDLE_ID', handleId, err => {
			if(err){
				rejected(rejectCode);
				return;
			}
			resolved();
		})
	})
}

//User 정보 삭제
exports.delUserInfo = (redis, socketId) => {
	return new Promise((resolved, rejected) => {
		
		//socket id로 handle id 가져오기
		redis.hget('USER_INFO_BY_SOCKET_ID', socketId, (error, obj)=>{
			let roomInfos = setObject(obj).roomInfo;
			if(roomInfos){
				Object.keys(roomInfos).map(data => {
					redis.hdel('USER_INFO_BY_HANDLE_ID', roomInfos[data].camHandleId, (err, obj) => {
						if(err){
							rejected(rejectCode);
							return;
						}
		
					})
					if(roomInfos[data].screenHandleId){
						redis.hdel('USER_INFO_BY_HANDLE_ID', roomInfos[data].screenHandleId, (err, obj) => {
							if(err){
								rejected(rejectCode);
								return;
							}
			
						})
					}
				})
			}

			redis.hdel('USER_INFO_BY_SOCKET_ID', String(socketId), (err, obj) => {
				if(err){
					rejected(rejectCode);
					return;
				}
			})
			resolved(obj);

		})

	})
}

/****************************** room 정보 관련 method ******************************/

//룸 정보 등록
exports.setRoom = (redis, roomId, data) => {
	return new Promise((resolved, rejected) => {
		redis.hset('ROOMS_INFO', roomId, setString(data), error => {
			if(error){
				rejected(rejectCode);
				return false
			}
			resolved(true);
		})
	});
};

//ROOMS_INFO 가져오기
exports.getRoomDetail = (redis, roomId) => {
	return new Promise((resolved, rejected) => {
		if( !roomId ) {
			resolved( null );
			return;
		}

		redis.hget('ROOMS_INFO', roomId, (error, obj) => {
			if (error) {
				rejected(rejectCode);
				return false;
			}
			if (obj) {
				let objectRoom = setObject(obj);
				resolved(objectRoom);
			} else {
				resolved(null);
			}
		});
	});
};

//방 정보 삭제
exports.delRoom = (redis, roomId) => {
	return new Promise((resolved, rejected) => {
		redis.hdel('ROOMS_INFO', roomId, (error, obj) => {
			if(error){
				rejected(rejectCode);
				return false;
			}

			resolved(obj);
		})
	})
}

//방에 입장
exports.enterRoom = (redis, roomId, socketId) => {
	return new Promise((resolved, rejected) => {
		redis.sadd("ROOM:" + roomId, socketId, err => {
			if(err){
				rejected(rejectCode);
				return false;
			}
			resolved(true);
		})
	})
}

//유저 카운트
exports.getUserCount = (redis, roomId) => {
	return new Promise((resolved, rejected) => {
		redis.scard("ROOM:" + roomId, (err, obj) => {
			if(err){
				rejected(rejectCode);
				return false;
			}
			resolved(obj)
		})
	})
}

//방에서 퇴장
exports.exitRoom = (redis, roomId, socketId) => {
	return new Promise((resolved, rejected) => {
		redis.srem("ROOM:" + roomId, socketId, (err, obj) => {
			if(err){
				rejected(rejectCode);
				return false;
			}

			resolved(true);
		})
	})
}

/****************************** Media Server 관련 method ******************************/

//TODO 해당 서버에 있는 방 개수 담는 method
exports.setNumberOfRoom = (redis, url, data) => {
	return new Promise((resolved, rejected) => {
		redis.hset('MEDIA_SERVER_INFO', url, setString(data), error => {
			if(error){
				rejected(rejectCode);
				return false;
			}
			resolved(true);
		})
	})
}

//TODO 해당 서버에 있는 방 개수 가져오는 method
exports.getNumberOfRoom = (redis, url) => {
	return new Promise((resolved, rejected) => {
		if(!url){
			resolved(null);
			return;
		}
		redis.hget('MEDIA_SERVER_INFO', url, (error, obj) => {
			if(error){
				rejected(rejectCode);
				return false;
			}

			if(obj){
				let objectData = setObject(obj);
				resolved(objectData);
			} else {
				resolved(null);
			}
		})
	})
}

//해당 서버에 있는 방 개수 +1
exports.plusRoomCount = (redis, url, roomId) => {
	return new Promise((resolved, rejected) => {
		redis.sadd("MEDIA_SERVER:" + url, roomId, err => {
			if(err){
				rejected(rejectCode);
				return;
			}
			resolved(true);
		})
	})
}

//해당 서버에 있는 방 개수 -1
exports.minusRoomCount = (redis, url, roomId) => {
	return new Promise((resolved, rejected) => {
		redis.srem("MEDIA_SERVER:" + url, roomId, (err,obj) => {
			if(err){
				rejected(rejectCode);
				return;
			}

			resolved(true);
		})
	})
}

//해당 서버에 있는 방 개수 카운트
exports.getRoomCount = (redis, url) => {
	return new Promise((resolved, rejected) => {
		redis.scard("MEDIA_SERVER:" + url, (err, obj) => {
			if(err){
				rejected(rejectCode);
				return;
			}
			resolved(obj);
		})
	})
}

//Media Server Url 가져오는 Method
exports.getJanusUrls = (redis) => {
	return new Promise((resolved, rejected) => {
		redis.scan(0, "match", "Media:*", "count", 1000000, (err, obj) => {
			if(err){
				resolved(false);
				return;
			}
			resolved(obj[1]);
		})
	})
}

//Media Server 정보 가져오는 Method
exports.getMediaServerInfo = (redis, url) => {
	return new Promise((resolved, rejected) => {
		redis.get('Media:'+url, (err, obj) => {
			if(err){
				resolved(false);
				return;
			}
			resolved(JSON.parse(obj));
		})
	})
}