const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const stepFunctions = new AWS.StepFunctions();
const IOT = new AWS.Iot();
const readInputDataString = async (key) => {
    let params = {
        Bucket: process.env.BUCKET_NAME,
        Key: key
    };

    let s3response = await S3.getObject(params).promise();
    console.log(s3response);

    return s3response['Body'].toString();
}

const writeBodyObj = async(key, body) => {
    let putParams = {
        Body: JSON.stringify(body),
        Key: key,
        ServerSideEncryption: "AES256",
        Bucket: process.env.BUCKET_NAME
    };

    let s3response = await S3.putObject(putParams).promise();
    console.log(s3response);
    return s3response;
}

const doStep = async (outputKey, result, event, context, callback) => {
    console.log(`doStep for ${outputKey}`);
    console.log(`event: ${JSON.stringify(event)})`);

    let key = event['processData'];
    console.log(`process data via key ${key}`);

    //
    // TODO/WARNING - due to the s3 consistency model, we need to test to make sure
    // we are reading the output from the previous step before we proceed! Ignoring
    // this for now... DO NOT REUSE THIS YET!
    //
    let input = await readInputDataString(key);
    console.log(`input: ${input}`);
    let processData = JSON.parse(input);
    
    processData[outputKey] = result;
    await writeBodyObj(key, processData);

    //Make process data available to the next downstream process
    callback(null, event);
}

module.exports.stepA = async (event, context, callback) => {
    let key = event['processData'];

    //Write output to object
    let result = {
        status: 'ok',
        details: 'nothing to share',
        stepAOutput1: 'a1',
        stepAOutput2: false,
        stepAOutput3: 123
    };

    try {
        await doStep('step-a-output', result, event, context, callback);
    } catch(theError) {
        console.log(theError);
        await doNotification(key, 'FAILED');
        throw theError;
    }
}

module.exports.stepB = async (event, context, callback) => {
 
    
    //Write output to object
    let result = {
        property1: 'p1',
        property2: 'p2',
    };

    try {
        await doStep('step-b-output', result, event, context, callback);
    } catch(theError) {
        console.log(theError);
        await doNotification(key, 'FAILED');
        throw theError;
    }
}

module.exports.stepC = async (event, context, callback) => {
    console.log('step C invoked');
    let result = {
        cProperty: 'i like c'
    };

    try {
        await doStep('step-c-output',result, event, context, callback);
    } catch(theError) {
        console.log(theError);
        await doNotification(key, 'FAILED');
        throw theError;
    }
}

module.exports.stepD = async (event, context, callback) => {
    try {
        await doStep('step-d-output',{d: 'd output'}, event, context, callback);
    } catch(theError) {
        console.log(theError);
        await doNotification(key, 'FAILED');
        throw theError;
    }
}
module.exports.stepE = async (event, context, callback) => {
    try {
        await doStep('step-e-output',{e: 'e output'}, event, context, callback);
    } catch(theError) {
        console.log(theError);
        await doNotification(key, 'FAILED');
        throw theError;
    }
}

const kickOffDownstream = async (downstreamInput) => {
    var params = {
        stateMachineArn: process.env.DOWNSTREAM_ARN,
        input: downstreamInput
    }

    let result = await stepFunctions.startExecution(params).promise();
    return result;
}

const doNotification = async (key,msg) => {
    let desc = await IOT.describeEndpoint({}).promise();
    console.log(`iot endpoint desc: ${desc}`);

    let endpoint = desc['endpointAddress'];
    console.log(`endpoint address: ${endpoint}`);

    let iotdata = new AWS.IotData({endpoint: endpoint});

    topic = process.env.TOPIC_ROOT + key
    console.log(`publish to topic ${topic}`)

    let params = {
        topic: topic,
        payload: msg
    };

    let pubResult = await iotdata.publish(params).promise();
    console.log('pub results: ${JSON.stringify(pubResult)}');
}

module.exports.stepF = async (event, context, callback) => {
    console.log(`event: ${JSON.stringify(event)})`);

    let key = event['processData'];
    console.log(`process data via key ${key}`);

    //
    // TODO/WARNING - due to the s3 consistency model, we need to test to make sure
    // we are reading the output from the previous step before we proceed! Ignoring
    // this for now... DO NOT REUSE THIS YET!
    //
    try {
        let input = await readInputDataString(key);
        console.log(`input: ${input}`);
        let processData = JSON.parse(input);

        let result = await kickOffDownstream(JSON.stringify(event));
        console.log(result);
        processData['step-f-output'] = {
            downstreamExecutionArn: result['executionArn']
        }
        await writeBodyObj(key, processData);

        await doNotification(key, 'SUCCEEDED');

        callback(null, event);
    } catch(theError) {
        console.log(theError);
        await doNotification(key, 'FAILED');
        throw theError;
    }
}