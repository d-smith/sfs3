const express = require('express');
const timeout = require('connect-timeout');
const app = express();
const rp = require('request-promise-native');
const awsIot = require('aws-iot-device-sdk');

//To avoid processing notifications for every item published
//to the step function topic we'll specify a subtopic. We
//use the subtopic in our subscription set up and in 
//input to the state machine process.
const subtopic = process.env.WORKER || 'worker1'


// Stick the express response objects in a map, so we can
// lookup and complete the response when the process state
// is published.
let txnToResponseMap = new Map();

// Fallback - if iot connection service fails, poll for 
// state machine completion
let pollForResults = false;

const headersSentForTransaction = (txnId, response) => {
    if(response.headersSent) {
        console.log(`headers sent for ${txnId} - most likely timed out`);
        txnToResponseMap.delete(txnId);
        return true;
    }

    return false;
}

const sendResponseBasedOnState = (state, txnId, response) => {
    // When polling the state machine might still be running.
    if(state == 'RUNNING') {
        console.log('status is running - poll later');
        return;
    }

    if(state == 'SUCCEEDED') {
        console.log('response success');
        response.send(state);
    } else {
        console.log('response failure');
        response.status(400).send(state);
    }

    txnToResponseMap.delete(txnId);
}

const checkStateForTxn = async (txnId, executionArn, resp) => {
    console.log(`checking state for execution ${executionArn}`);

    if(headersSentForTransaction(txnId, resp)) {
        return;
    }

    let options = {
        method: 'GET',
        uri: process.env.STATE_ENDPOINT + '?executionArn=' + executionArn,
        json:true
    };

    try {
        let callResult = await rp(options);

        console.log(`call result: ${JSON.stringify(callResult)}`);

        let state = callResult['status'];
        sendResponseBasedOnState(state, txnId, resp);
    } catch(err) {
        console.log(err.message);
    }

}

const doPollForResults = async () => {
    if(pollForResults == false) {
        return;
    }

    txnToResponseMap.forEach((txnTuple, txnId)=> {
        checkStateForTxn(txnId, txnTuple['executionArn'], txnTuple['response']);
    });

    console.log('polling for results');
    setTimeout(doPollForResults, 5000);
}

// Callback invoked when there's an event on the topic to process.
const onMessage = (topic, message) => {
    console.log(`message ${message} for topic ${topic}`);

    let topicParts = topic.split('/');
    let txnId = topicParts[topicParts.length -1 ];
    console.log(`txnid in callback: ${txnId}`);
    let txnTuple = txnToResponseMap.get(txnId);
    let response = txnTuple['response'];

    if(headersSentForTransaction(txnId, response)) {
        return;
    }
    
    sendResponseBasedOnState(message, txnId, response);
    
} 

// Information event handlers for iot connection
const registerInfoEventHandlers = (client) => {
    client.on('connect', function(conack) {
        console.log(`iot::connect - conack ${JSON.stringify(conack)}`);
        pollForResults = false;
    });

    client.on('reconnect', function() {
        console.log('iot::reconnect');
    });

    client.on('close', function() {
        console.log('iot::close');
    });

    client.on('offline', function() {
        console.log('iot::offline');
        if(pollForResults == false) {
            pollForResults = true;
            doPollForResults();
        }
    });

    client.on('error', function(err){
        console.log(`iot::err ${err}`);
    });

    client.on('end', function() {
        console.log('iot::end');
    });

    client.on('packetsend', function(packet){
        console.log(`packet send: ${JSON.stringify(packet)}`);
    });

    client.on('packetreceive', function(packet){
        console.log(`packet recv: ${JSON.stringify(packet)}`);
    });
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
        host: appIotCtx['iotEndpoint'],
        keepalive: 20
    });

    client.subscribe(process.env.TOPIC + '/' + subtopic + '/#');
    registerInfoEventHandlers(client);
    client.on('message', onMessage);
}

// Start the state machine execution
const callStepFunc = async (res) => {
    let options = {
        method: 'POST',
        uri: process.env.START_ENDPOINT,
        body: {
            a: 'a stuff',
            subtopic: subtopic
        },
        json:true
    };
    let callResult = await rp(options);
    console.log(callResult);

    let tuple = {
        response: res,
        executionArn: callResult['executionId'],
        timestamp: new Date().getTime()
    }
    
    txnToResponseMap.set(callResult['transactionId'],tuple);
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

    let port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Example app listening on port ${port}`))
}

doInit();

