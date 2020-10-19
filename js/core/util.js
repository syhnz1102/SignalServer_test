const syncFn   = require('./sync.service');
const logger   = require('../utils/logger');

exports.reqNo = function() {
    return new Promise(function(resolved, rejected){
        let reqNo = "";

        function randomRange(n1, n2) {
            return Math.floor((Math.random() * (n2 - n1 + 1)) + n1);
        }

        for (let i = 0; i < 7; i++) {
            reqNo += randomRange(0, 9).toString();
        }

        resolved(reqNo);
    });
}

//서버시간을 리턴.
exports.getDate = () => {
    return new Promise(((resolve, reject) => {
        let today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
        const yyyy = today.getFullYear();
        const hh = today.getHours()<10 ? ("0"+today.getHours()) : today.getHours();
        const min = today.getMinutes()<10 ? ("0"+today.getMinutes()) : today.getMinutes();
        const ss = today.getSeconds()<10 ? ("0"+today.getSeconds()) : today.getSeconds();

        today = yyyy + mm + dd + hh + min + ss;

        resolve(today)
    }))
};

exports.stringToDate = date => {
    let data = new Date();

    data.setFullYear(parseInt(date.substr(0,4)));
    data.setMonth(parseInt(date.substr(4,2))-1);
    data.setDate(parseInt(date.substr(6,2)));
    data.setHours(parseInt(date.substr(8,2)));
    data.setMinutes(parseInt(date.substr(10,2)));
    data.setSeconds(parseInt(date.substr(12,2)));

    return data;
}

exports.usageTime = (start, end) => {
    return new Promise((resolve => {
        let startDate = start?this.stringToDate(start):0;
        let endDate = end?this.stringToDate(end):0;

        resolve((endDate - startDate)/1000);
    }))
}

//현재시간에 random 문자열 추가 하여 room id 생성
exports.getRoomId = function(){
	let roomIdObj = this;
	return new Promise(function(resolved, rejected){
		const newDate = roomIdObj.getDate();
		roomIdObj.randomText().then(function(text){
			const roomId = newDate + '-' + text;
			resolved(roomId);
		});
	});
};

//Media Server cpu 최소 사용 server 찾는 method
exports.getLightestMediaServer = (mediaServerUrls, redisInfo) => {
    return new Promise(async (resolve, reject) => {
        let selectedUrl = '';
        let cpuUsage = 101;

        for(let i in mediaServerUrls){
            let url = mediaServerUrls[i].split(':')[1];

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

        resolve(selectedUrl)
    })
}

