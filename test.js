const events = require('events');
const bus = new events();

const waitForResult = new Promise((resolve, reject) => {
    bus.once('failure', (event) => {
        console.log(event);
        reject(down);
    });
    bus.once('success', (event) => {
        console.log(event);
        resolve(up);
    });
})

function down() {
    console.log("downvote");
}

function up() {
    console.log("upvote");
}

waitForResult
    .then((callback) => {
        await callback()
        process.exit(0);
    })
    .catch(e => {
        console.log('ERROR: ' + e);
        process.exit(1);
    });

setTimeout(() => {
    bus.emit('failure', {detail: 'Timed out requesting status'});
}, 5000);

setTimeout(() => {
    bus.emit('success', {detail: 'stuff'});
}, 1000 );
