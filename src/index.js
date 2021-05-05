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
    bus.once('failure', (event) => {
        core.error(event);
        reject(down);
    });
    bus.once('success', (event) => {
        core.info(event);
        resolve(up);
    });
})

function monitorChecks() {
    core.info("Monitoring for checks");
    reqChecks()
        .then(status => {
            core.info("Waiting on checks");
            return new Promise(resolve => setTimeout(resolve, interval)).then(
                monitorChecks
            );
        });
}

function monitorStatus() {
    core.info("Monitoring for statuses");
    reqStatus()
        .then(status => {
            core.info("Waiting on status");
            return new Promise(resolve => setTimeout(resolve, interval)).then(
                monitorStatus
            );
        });
}

async function monitorAll() {
    //let [status, check] = await Promise.all([monitorStatus(), monitorChecks()]);

    let now = new Date().getTime();
    const end = now + timeout;

    while ( now <= end ) {

        monitorStatus();
        monitorChecks();

        core.info("Waiting");
        await new Promise(r => setTimeout(r, interval));
        now = new Date().getTime();
    }
    core.setFailed("Timed out waiting for results");
    return false;
}

async function getChecks() {
    return await octokit.request(`GET ${context.payload.repository.url}/commits/${context.sha}/check-runs`);
}

function reqChecks() {
    try {
        core.info("Requesting Checks");
        const response = getChecks();
        const filtered = response.data.check_runs.filter( run => run.name !== context.action );

        // no checks besides self, wait for something
        if (!filtered.length) return;

        const failed = filtered.filter(
            run => run.status === "completed" && run.conclusion === "failure"
        );
        if (failed.length) bus.emit('failure', {detail: 'Failure detected'});

        const pending = filtered.filter(
            run => run.status === "queued" || run.status === "in_progress"
        );
        if (pending.length) return;

    } catch (error) {
        core.error(error);
        bus.emit('failure', {detail: 'Failure in processing'});
    }
    // TODO
    return;
}

async function getStatus() {
    return await octokit.request(`GET ${context.payload.repository.url}/commits/${context.sha}/statuses`);
}

function reqStatus() {
    try {
        core.info("Requesting Status");
        const response = getStatus();

        if (ctx) {
            // we are looking for a specific context
            filtered = response.data.filter(
                run => run.context === ctx
            );
        } else {
            filtered = response.data;
        }

        if (!filtered.length) return;

        const failed = filtered.filter(
            run => run.state === "failure"
        );
        if (failed.length) bus.emit('failure', {detail: 'Failure detected'});

        const pending = filtered.filter(
            run => run.state === "pending"
        );
        if (pending.length) return;

    } catch (error) {
        core.error(error);
        bus.emit('failure', {detail: 'Failure in processing'});
    }
    // TODO
    return;
}

async function deleteComment(comment) {
    return await octokit.request(`DELETE ${comment.url}`);
}

async function getComments() {
    return await octokit.request(`GET ${context.payload.repository.url}/issues/${context.payload.number}/comments`);
}

async function makeComment(gif) {
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
            filtered = comments.data.filter(
                comment => comment.body.includes(gifTitle)
            );
            return filtered;
        })
        .then(filtered => {
            return filtered.map(deleteComment);
        })
        .then(result => {
            return result;
        })
        .catch(e => {
            core.error('Something borked: ' + e.message);
        });

    waitForResult
        .then((callback) => {
            callback();
            process.exit(0);
        })
        .catch(e => {
            core.error(e);
            process.exit(1);
        });
}

function up() {
    giphy('thumbs-up');
}
function down() {
    giphy('thumbs-down');
}
function giphy(tag) {
    // nothing at all
    return getGif(tag)
        .then(gif => {
            return gif.data.data;
        })
        .then(makeComment)
        .then(response => {
            return response;
        })
        .catch(e => {
            core.error('Something broke: ' + e.message);
        })
}

main();

setTimeout(() => {
    bus.emit('failure', {detail: 'Timed out waiting for results'});
}, timeout);
