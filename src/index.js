const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const util = require('util');

const token = core.getInput('authToken') || process.env.GITHUB_TOKEN;
const apiKey = core.getInput('apiKey') || "";
const rating = core.getInput('rating') || "pg-13";
const timeout = parseInt(core.getInput('timeout')) || 10000;
const interval = parseInt(core.getInput('interval')) || 5000;
const ctx = core.getInput('context') || null;

const octokit = github.getOctokit(token);
const context = github.context;
const repo = context.payload.repository.full_name;
const gifTitle = "gha-status-check-result";
const giphyURL = "https://api.giphy.com/v1/gifs/random";

//core.info(util.inspect(context));

function monitorChecks() {
    core.info("Monitoring for checks");
    reqChecks()
        .then(status => {
            switch (status) {
                case "FAILURE":
                    core.error("We have a failure");
                    return 1;
                case "SUCCESS":
                    core.info("We have a success");
                    return;
                case "IN_PROGRESS":
                    core.info("Waiting on checks");
                    return new Promise(resolve => setTimeout(resolve, interval)).then(
                        monitorChecks
                    );
            }
        });
}

function monitorStatus() {
    core.info("Monitoring for statuses");
    reqStatus()
        .then(status => {
            switch (status) {
                case "FAILURE":
                    core.error("We detected a failed status");
                    return 1;
                case "SUCCESS":
                    core.info("We have a success");
                    return;
                case "IN_PROGRESS":
                    core.info("Waiting on status");
                    return new Promise(resolve => setTimeout(resolve, interval)).then(
                        monitorStatus
                    );
            }
        });
}

async function monitorAll() {
    let [status, check] = await Promise.all([monitorStatus(), monitorChecks()]);
    return status && check;
}

async function reqChecks() {
    try {
        core.info("Requesting Checks");
        const response = await octokit.request(`GET ${context.payload.repository.url}/commits/${context.sha}/check-runs`);
        const filtered = response.data.check_runs.filter( run => run.name !== context.action );

        // no checks besides self, wait for something
        if (!filtered.length) return "IN_PROGRESS";

        const failed = filtered.filter(
            run => run.status === "completed" && run.conclusion === "failure"
        );
        if (failed.length) return "FAILURE";

        const pending = filtered.filter(
            run => run.status === "queued" || run.status === "in_progress"
        );
        if (pending.length) return "IN_PROGRESS";

    } catch (error) {
        core.error(error);
        return "FAILURE";
    }
    return "SUCCESS";
}

async function reqStatus() {
    try {
        core.info("Requesting Status");
        const response = await octokit.request(`GET ${context.payload.repository.url}/commits/${context.sha}/statuses`);

        if (ctx) {
            // we are looking for a specific context
            filtered = response.data.filter(
                run => run.context === ctx
            );
        } else {
            filtered = response.data;
        }

        if (!filtered.length) return "IN_PROGRESS";

        const failed = filtered.filter(
            run => run.state === "failure"
        );
        if (failed.length) return "FAILURE";

        const pending = filtered.filter(
            run => run.state === "pending"
        );
        if (pending.length) return "IN_PROGRESS";

    } catch (error) {
        core.error(error);
        return "FAILURE";
    }
    return "SUCCESS";
}

async function deleteComment(comment) {
    core.info('deleteComment');
    return await octokit.request(`DELETE ${context.payload.repository.url}/comments/${comment.id}`);
}

async function getComments() {
    core.info('getComments');
    return await octokit.request(`GET ${context.payload.repository.url}/issues/${context.payload.number}/comments`);
}

async function makeComment(gif) {
    core.info("makeComment");
    return await octokit.request(`POST ${context.payload.repository.url}/issues/${context.payload.number}/comments`, {
        body: `![${gifTitle}](${gif.image_url})`
    });
}

async function getGif(tag) {
    // be nice if I could force octokit to do this
    core.info("getGif");
    return await axios.get(giphyURL, {
        tag: tag,
        rating: rating,
        fmt: "json",
        api_key: apiKey
    });
}

function main() {
    getComments()
        .then(comments => {
            filtered = comments.data.filter(
                comment => comment.body.includes(gifTitle)
            );
            if (!filtered.length) {
                core.info('Attempt to resolve');
                return Promise.resolve();
            }
            return filtered;
        })
        .then(deleteComment)
        .catch(e => {
            core.error('Something borked: ' + e.message);
        });
    getGif('thumbs-down')
        .then(gif => {
            core.info(util.inspect(gif));
            return gif.data.data;
        })
        .then(makeComment)
        .then(response => {
            core.info(util.inspect(response));
        })
        .catch(e => {
            core.error('Something broke: ' + e.message);
        })
    monitorAll();
}

main();

setTimeout(() => {
    core.setFailed("Maximum timeout reached");
    process.exit(1);
}, timeout);
