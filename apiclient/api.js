const express = require('express');
const app = express();
const rp = require('request-promise-native');
const awsIot = require('aws-iot-device-sdk');

var appIotCtx = {};

const onMessage = (topic, message) => {
    console.log(`message ${message} for topic ${topic}`);
    lastRes.send(message);
} 

const subResult = async () => {
    console.log(JSON.stringify(appIotCtx));
    console.log('form client');
    client = awsIot.device({
        region: appIotCtx['region'],
        protocol: 'wss',
        accessKeyId: appIotCtx['accessKey'],
        secretKey: appIotCtx['secretKey'],
        sessionToken: appIotCtx['sessionToken'],
        port: 443,
        host: appIotCtx['iotEndpoint']
    });

    client.subscribe(process.env.TOPIC + '/#');

    client.on('connect', function() {
        console.log('connect');
    });

    client.on('message', onMessage);

   


}

var lastRes = {};

const callStepFunc = async (res) => {
    let options = {
        method: 'POST',
        uri: process.env.START_ENDPOINT,
        body: {
            a: 'a stuff'
        },
        json:true
    };
    let callResult = await rp(options);
    console.log(callResult);

    lastRes = res;
}
app.post('/p1', function (req, res) {
    callStepFunc(res);

    //res.send('Got a POST request')
  });

const initCreds = async () => {
    let options = {
        method: 'GET',
        uri: process.env.IOTAUTH_ENDPOINT,
        json:true
    };
    let callResult = await rp(options);
    console.log(callResult);

    appIotCtx = callResult;
    
}



const doInit = async () => {
    await initCreds();
    subResult();

   app.listen(3000, () => console.log('Example app listening on port 3000!'))
}

doInit();

