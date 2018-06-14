const express = require('express');
const timeout = require('connect-timeout');
const app = express();
const rp = require('request-promise-native');
const awsIot = require('aws-iot-device-sdk');


// Stick the express response objects in a map, so we can
// lookup and complete the response when the process state
// is published.
let txnToResponseMap = {};

// Subscription message available. Currently we get callbacks
// for all messages, but we can refine this later.
const onMessage = (topic, message) => {
    console.log(`message ${message} for topic ${topic}`);
    let txnId = topic.split('/')[1];
    let response = txnToResponseMap[txnId];
    
    if(response != undefined) {
        if(message == 'SUCCEEDED') {
            response.send(message);
        } else {
            response.status(400).send(message);
        }
        delete txnToResponseMap[topic];
    }
    
} 

// Connect to the IOT endpoint and subscribe to the topic.
const subscribeForResult = async (appIotCtx) => {
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

// Start the state machine execution
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

    txnToResponseMap[callResult['transactionId']] = res;
}

// Set up a timeout for this sample app - your timeout may be 
// different
app.use(timeout(20*1000));
app.use(haltOnTimeout);

// Sample endpoint to initiate the step function process
// and the communication back of the response.
app.post('/p1', function (req, res) {
    callStepFunc(res);
  });

// Initialize the credentials for invoking the IOT service
const initCreds = async () => {
    let options = {
        method: 'GET',
        uri: process.env.IOTAUTH_ENDPOINT,
        json:true
    };
    let callResult = await rp(options);
    console.log(callResult);

    return callResult;
    
}

function haltOnTimeout(req, res, next) {
    if (!req.timedout) next();
}

const doInit = async () => {
    let appIotCtx = await initCreds();
    subscribeForResult(appIotCtx);

   app.listen(3000, () => console.log('Example app listening on port 3000!'))
}

doInit();

