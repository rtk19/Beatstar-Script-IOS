const fs = require('fs');

const xor = (data) => {
  const str = data.split("");

  const xorKey = "bf3c199c2470cb477d907b1e0917c17b";

  for (let i = 0; i < str.length; i++) {
    str[i] = String.fromCharCode(str[i].charCodeAt(0) ^ xorKey.charCodeAt(0));
  }
  return str.join("");
};

const file = Buffer.from(fs.readFileSync('./script.js').toString(), 'base64').toString('ascii')

fs.writeFileSync('out.txt', xor(file));
