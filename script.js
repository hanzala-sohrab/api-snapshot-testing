const newman = require('newman');
const fs = require('fs');
const config = require('./config');

const axios = require('axios');
const config = require('./config');
var config = {
    method: 'get',
    url: `https://api.getpostman.com/collections/${config.COLLECTION_ID}`,
    headers: {
        'X-API-Key': config.POSTMAN_KEY
    }
};

axios(config)
    .then(function (response) {
        fs.writeFile('collection.json', JSON.stringify(response.data), (err) => {
            if (err) {
                console.log(err);
                return;
            }
        })
    })
    .catch(function (error) {
        console.log(error);
    });





// newman.run({
//     collection: require('./postman_collection.json'),
//     delayRequest: 300,
//     reporters: 'cli'
// }, (err) => {
//     if (err) { throw err; }
//     console.log('collection run complete!');
// }).on('beforeRequest', (error, args) => {
//     if (error) {
//         console.error(error);
//     }
// }).on('request', (error, args) => {
//     if (error) {
//         console.error(error);
//         return;
//     }
//     let res = JSON.parse(args.response.stream);
//     fs.writeFile(`./response.json`, JSON.stringify(res), (error) => {
//         if (error) {
//             console.error(error);
//         }
//     });
// });