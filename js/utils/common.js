exports.makeId = (length = 7) => {
  // ccc. written by ivypark
  return new Promise((resolve, reject) => {
    const num = "0123456789";
    let result = length === 7 ? 'u' : '';
    for (let i = 0; i < length; i++) {
      result += num.charAt(Math.floor(Math.random() * num.length));
    }

    resolve(result);
  });
}

// //TODO ERROR CODE 정리 필요
// const SUCCESS = 200;
// const REQUEST_ERROR = 400;
// const INVALID_AUTH = 401;
// const NO_CONTENT = 403;
// const INVALID_URL = 404;
// const DISALLOWED_RESOURCES = 405;
// const DUPLICATED_USER = 409;
// const USER_NOT_EXIST = 410;
// const INVALID_PWD = 411;
// const DATA_NOT_EXIST = 412;
// const PERMISSION_ERROR = 413;
// const NOT_DELEVERED_PARAMETER = 421;
// const INVALID_REQUEST = 422;
// const ALREADY_SHARING = 440;
// const INVALID_ROOM_NUMBER = 441;
// const DUPLICATED_ROOM = 442;
// const DATA_EXCEEDED = 445;
// const INVALID_CHANNEL = 451;
// const INTERNAL_ERROR = 500;
// const REQUEST_TIMEOUT = 543;
// const MEDIA_SERVER_ERROR = 570;
// const UNKNOWN_ERROR = 599;

//convert error code to message
exports.codeToMsg = code => {
  return new Promise((resolve, reject) => {
    switch (code) {
      case 200:
        resolve('OK');
        return;
      case 400:
        resolve('Client request error.');
        return;
      case 401:
        resolve('Invalid auth key or cp id.');
        return;
      case 403:
        resolve('No content.');
        return;
      case 404:
        resolve('Invalid URL.');
        return;
      case 405:
        resolve('Disallowed resources.');
        return;
      case 409:
        resolve('Already registered user.');
        return;
      case 410:
        resolve('User is not exist.');
        return;
      case 411:
        resolve('ID or Password is incorrect.');
        return;
      case 412:
        resolve('Data is not exist.');
        return;
      case 413:
        resolve('User permission error.');
        return;
      case 421:
        resolve('Parameter is not delivered.');
        return;
      case 422:
        resolve('Invalid request or parameter');
        return;
      case 440:
        resolve('Sharing is already reserved');
        return;
      case 441:
        resolve('Invalid room number.');
        return;
      case 442:
        resolve('Already exist in the room.');
        return;
      case 445:
        resolve('The maximum data has been exceeded.');
        return;
      case 451:
        resolve('Invalid channel');
        return;
      case 500:
        resolve('Internal server error.');
        return;
      case 504:
        resolve('Internal server error.');
        return;
      case 543:
        resolve('Request timeout');
        return;
      case 570:
        resolve('Media Server Error');
        return;
      case 599:
        resolve('Unknown Error.');
        return;
      default:
        resolve('UNKNOWN CODE.');
        return;
    }
  })
}