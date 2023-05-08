const AES = require('./AES');
const md5 = require('./hmac_md5');
const crypto = require('crypto');

const HNAP_AUTH = {
    url: 'http://192.168.0.190/HNAP1',
    user: 'Admin',
    pwd: '637848',
    result: 'OK',
    challenge: 'Yf21cZnNqrF7tlIs7UPr',
    publicKey: 'vqGfiRZezx4jUYhlJ51U',
    cookie: 'dXbw1VRIdW',
    privateKey: '4ede8ba1128e82842726b42e052bd534'
};

function checkMD5(name, data1, data2) {
    const cryptNew = crypto.createHmac('md5', data1).update(data2).digest('hex').toUpperCase();
    const cryptOld = md5.hex_hmac_md5(data1, data2).toUpperCase();

    console.log('===================================================================');
    console.log('Checking ' + name);
    console.log(cryptNew);
    console.log(cryptOld);
    console.log('Correct: ' + (cryptNew === cryptOld ? 'YES' : 'NOOOOOOOOOOOOO... FAIL....'));
    console.log('===================================================================');
}

function checkAES(name, data1, data2) {
    const data = Buffer.from(data1, 'utf8');

    // Convert password string to buffer
    const key = Buffer.from(data2, 'hex');

    const iv = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv('aes-128-ecb', key, iv);
    cipher.setAutoPadding(false);

    let encrypted = cipher.update(data1, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const cryptNew = encrypted;
    const cryptOld = AES.AES_Encrypt128(data1, data2);

    console.log('===================================================================');
    console.log('Checking ' + name);
    console.log(cryptNew);
    console.log(cryptOld);
    console.log('Correct: ' + (cryptNew === cryptOld ? 'YES' : 'NOOOOOOOOOOOOO... FAIL....'));
    console.log(cryptNew.length + ' != ' + cryptOld.length);
    console.log('===================================================================');
}

checkMD5('PrivateKey-SaveLoginResult', HNAP_AUTH.publicKey + HNAP_AUTH.pwd, HNAP_AUTH.challenge);

checkMD5('loginParameters', HNAP_AUTH.privateKey, HNAP_AUTH.challenge);

const time_stamp = Math.round(Date.now() / 1000);
checkMD5('SoapAction', HNAP_AUTH.privateKey,time_stamp + 'SoapAction');

console.log('Length key: ' + HNAP_AUTH.privateKey.length);
checkAES('AES', 'password', HNAP_AUTH.privateKey);
