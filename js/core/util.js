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
    let today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
    const yyyy = today.getFullYear();
    const hh = today.getHours()<10 ? ("0"+today.getHours()) : today.getHours();
    const min = today.getMinutes()<10 ? ("0"+today.getMinutes()) : today.getMinutes();
    const ss = today.getSeconds()<10 ? ("0"+today.getSeconds()) : today.getSeconds();

    today = yyyy + mm + dd + hh + min + ss;

    return today;
};

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