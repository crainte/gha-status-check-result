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

const bus = new events();
const octokit = github.getOctokit(token);
const context = github.context;
const repo = context.payload.repository.full_name;
const gifTitle = "gha-status-check-result";
const giphyURL = "https://api.giphy.com/v1/gifs/random";

status_pending = undefined;
checks_pending = undefined;

core.debug(util.inspect(context));

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

        core.info(`Sleeping ${interval} ms`);
        await new Promise(r => setTimeout(r, interval));
    }
}

function checkSuccess() {
    if ( typeof status_pending !== 'undefined' &&
         typeof checks_pending !== 'undefined' &&
        !status_pending &&
        !checks_pending ) {
        bus.emit('success', {message: 'success'});
    }
}

async function reqChecks() {
    try {
        core.debug("Requesting Checks");
        const response = await octokit.request(`GET ${context.payload.repository.url}/commits/${context.payload.pull_request.head.sha}/check-runs`);
        const filtered = response.data.check_runs.filter( run => run.name !== context.job );

        core.debug(util.inspect(response.data));

        // no checks besides self, wait for something
        if (!filtered.length) {
            core.info("No checks worth watching");
            return;
        }

        const failed = filtered.filter(
            run => run.status === "completed" && run.conclusion === "failure"
        );
        if (failed.length) bus.emit('failure', {message: 'failure'});

        const pending = filtered.filter(
            run => run.status === "queued" || run.status === "in_progress"
        );
        if (pending.length) {
            checks_pending = pending.length;
            core.info(`We are waiting on ${pending.length} checks`);
            return;
        }

    } catch (error) {
        core.error(error);
        bus.emit('failure', {message: 'failure'});
    }
    checkSuccess();
    core.debug("Made it to the end of Checks");
    checks_pending = 0;
    return;
}

async function reqStatus() {
    try {
        core.debug("Requesting Status");
        const response = await octokit.request(`GET ${context.payload.repository.url}/commits/${context.payload.pull_request.head.sha}/statuses`);

        core.debug(util.inspect(response.data));

        filtered = response.data.reduce((acc, item) => {
            if( acc.some( i => i.context === item.context )) {
                source = acc.find( i => i.context === item.context);
                if( source.updated_at < item.updated_at ) {
                    acc.splice(acc.indexOf(source), 1);
                    acc.push(item);
                }
            } else {
                acc.push(item);
            }
            return acc;
        }, []);

        core.debug(util.inspect(filtered));

        if (!filtered.length) {
            core.info("No status worth watching");
            return;
        }

        const failed = filtered.filter(
            run => run.state === "failure"
        );
        if (failed.length) bus.emit('failure', {message: 'failure'});

        const pending = filtered.filter(
            run => run.state === "pending"
        );
        if (pending.length) {
            status_pending = pending.length;
            core.info(`We are waiting on ${pending.length} status`);
            return;
        }

    } catch (error) {
        core.error(error);
        bus.emit('failure', {message: 'failure'});
    }

    checkSuccess();
    core.debug("Made it to the end of Status");
    status_pending = 0;
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
            core.debug('Processing comments');
            filtered = comments.data.filter(
                comment => comment.body.includes(gifTitle)
            );
            return filtered;
        })
        .then(filtered => {
            core.debug('Deleting comments');
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
            return gif.data.data;
        })
        .then(makeComment)
        .then(response => {
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
                return down().then(() => { return Promise.reject(); });
            case "failure":
                return down().then(() => { return Promise.reject(); });
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
    if( !status_pending && !checks_pending ) {
        bus.emit('success', {message: 'success'});
    } else {
        core.setFailed('Timed out waiting for results');
        bus.emit('failure', {message: 'timeout'});
    }
}, timeout);
