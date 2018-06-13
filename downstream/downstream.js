const genericOk = (event, context, callback) => {
    callback(null, event);
} 

module.exports.A = (event, context, callback) => {
    genericOk(event, context, callback);
}

module.exports.B = (event, context, callback) => {
    genericOk(event, context, callback);
}

module.exports.C = (event, context, callback) => {
    genericOk(event, context, callback);
}