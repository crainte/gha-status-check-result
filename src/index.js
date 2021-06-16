const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const events = require('events');
const util = require('util');

const token = core.getInput('authToken');
const apiKey = core.getInput('apiKey');
const rating = core.getInput('rating') || "pg-13";
const timeout = parseInt(core.getInput('timeout')) || 30000;
const interval = parseInt(core.getInput('interval')) || 5000;
const ctx = core.getInput('context') || null;

const bus = new events();
const octokit = github.getOctokit(token);
const context = github.context;
const repo = context.payload.repository.full_name;
const gifTitle = "gha-status-check-result";
const giphyURL = "https://api.giphy.com/v1/gifs/random";

//core.info(util.inspect(context));

const waitForResult = new Promise((resolve, reject) => {
    bus.once('error', (event) => {
        reject(event.message);
    });
    bus.once('failure', (event) => {
        resolve(event.message);
    });
    bus.once('success', (event) => {
        resolve(event.message);
    });
})

async function monitorAll() {

    while ( true ) {

        reqChecks();
        reqStatus();

        core.info("Sleeping");
        await new Promise(r => setTimeout(r, interval));
    }
}

async function reqChecks() {
    try {
        core.info("Requesting Checks");
        const response = await octokit.request(`GET ${context.payload.repository.url}/commits/${context.sha}/check-runs`);
        core.info(util.inspect(response));
        //const filtered = response.data.check_runs.filter( run => run.name !== context.action );
        const filtered = response.data.check_runs.filter( run => run.name !== 'fake' );

        // no checks besides self, wait for something
        if (!filtered.length) {
            core.info("No checks worth watching");
            return;
        }

        const failed = filtered.filter(
            run => run.status === "completed" && run.conclusion === "failure"
        );
        if (failed.length) bus.emit('failure', {message: 'Failure detected'});

        const pending = filtered.filter(
            run => run.status === "queued" || run.status === "in_progress"
        );
        if (pending.length) {
            core.info(`We are waiting on ${pending.length} checks`);
            return;
        }

    } catch (error) {
        core.error(error);
        bus.emit('failure', {message: 'Failure in processing'});
    }
    core.info("Made it to the end of Checks");
    return;
}

async function reqStatus() {
    try {
        core.info("Requesting Status");
        const response = await octokit.request(`GET ${context.payload.repository.url}/commits/${context.sha}/statuses`);
        core.info(response.data);

        if (ctx) {
            // we are looking for a specific context
            filtered = response.data.filter(
                run => run.context === ctx
            );
        } else {
            filtered = response.data;
        }

        if (!filtered.length) {
            core.info("No status worth watching");
            return;
        }

        const failed = filtered.filter(
            run => run.state === "failure"
        );
        if (failed.length) bus.emit('failure', {message: 'Failure detected'});

        const pending = filtered.filter(
            run => run.state === "pending"
        );
        if (pending.length) {
            core.info(`We are waiting on ${pending.length} status`);
            return;
        }

    } catch (error) {
        core.error(error);
        bus.emit('failure', {message: 'Failure in processing'});
    }
    core.info("Made it to the end of Status");
    return;
}

async function deleteComment(comment) {
    return await octokit.request(`DELETE ${comment.url}`);
}

async function getComments() {
    return await octokit.request(`GET ${context.payload.repository.url}/issues/${context.payload.number}/comments`);
}

async function makeComment(gif) {
    console.log("make comment");
    return await octokit.request(`POST ${context.payload.repository.url}/issues/${context.payload.number}/comments`, {
        body: `![${gifTitle}](${gif.image_url})`
    });
}

async function getGif(tag) {
    // be nice if I could force octokit to do this
    return await axios.get(giphyURL, {
        params: {
            tag: tag,
            rating: rating,
            fmt: "json",
            api_key: apiKey
        }
    });
}

function main() {
    getComments()
        .then(comments => {
            core.info('Processing comments');
            filtered = comments.data.filter(
                comment => comment.body.includes(gifTitle)
            );
            return filtered;
        })
        .then(filtered => {
            core.info('Deleting comments');
            return filtered.map(deleteComment);
        })
        .then(result => {
            return result;
        })
        .catch(e => {
            core.error('Something borked: ' + e.message);
        });
    monitorAll();
}

function up() {
    return giphy('thumbs-up');
}
function down() {
    return giphy('thumbs-down');
}
function giphy(tag) {
    // nothing at all
    return getGif(tag)
        .then(gif => {
            console.log("get gif");
            return gif.data.data;
        })
        .then(makeComment)
        .then(response => {
            console.log("gif response");
            return response;
        })
        .catch(e => {
            core.error('Something broke: ' + e.message);
        });
}

main();

waitForResult
    .then((event) => {
        switch(event) {
            case "timeout":
                return down() && Promise.reject();
            case "success":
                return up();
        }
    })
    .then(result => {
        return result;
    })
    .then(() => {
        process.exit(0);
    })
    .catch(e => {
        process.exit(1);
    });


setTimeout(() => {
    core.setFailed('Timed out waiting for results');
    bus.emit('failure', {message: 'timeout'});
}, timeout);
