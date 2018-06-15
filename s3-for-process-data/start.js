
const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const stepFunctions = new AWS.StepFunctions();

const FlakeIdGen = require('flake-idgen')
    , intformat = require('biguint-format')
    , generator = new FlakeIdGen;

const startProcess = async (processInput) => {
    var params = {
        stateMachineArn: process.env.STEP_FN_ARN,
        input: processInput
    }

    console.log("start process execution");
    let result = await stepFunctions.startExecution(params).promise();
    return result;
}

module.exports.startProcess = async (event, context, callback) => {
    console.log(`event: ${JSON.stringify(event)}`);
    console.log(`context: ${JSON.stringify(context)}`);
    console.log(`bucket: ${process.env.BUCKET_NAME}`);

    let txnId = intformat(generator.next(), 'hex',{prefix:'0x'});
    console.log(`txnId: ${txnId}`);

    let inputPayload = event['body'];
    if (inputPayload == undefined) {
        inputPayload = '{}';
    }

    let inputObj = JSON.parse(inputPayload);
    
    let params = {
        Body: inputPayload,
        Key: txnId,
        ServerSideEncryption: "AES256",
        Bucket: process.env.BUCKET_NAME
    };

    try {
        let response = await S3.putObject(params).promise();
        console.log(response);
    } catch(theError) {
        console.log(JSON.stringify(theError));
        callback(null, {statusCode: 500, body: 'Error capturing process input'});
    }


    
    processInput = {};
    processInput['processData'] = txnId;
    if(inputObj['subtopic'] != undefined) {
        processInput['subtopic'] = inputObj['subtopic'];
    }

    let startProcResponse = await startProcess(JSON.stringify(processInput));
    console.log(startProcResponse);

    let responseBody = {
        transactionId: txnId,
        executionId: startProcResponse['executionArn']
    };

    callback(null, {statusCode: 200, body: JSON.stringify(responseBody)});
}