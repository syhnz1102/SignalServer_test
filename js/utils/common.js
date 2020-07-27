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