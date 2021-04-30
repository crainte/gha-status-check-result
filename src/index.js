const core = require('@actions/core');
const github = require('@actions/github');
const util = require('util');

const token = core.getInput('authToken') || process.env.GITHUB_TOKEN;
const timeout = core.getInput('timeout') || 30000;
const interval = core.getInput('interval') || 5000;

core.info(`Sleep interval: ${interval}`);

const octokit = github.getOctokit(token);
const context = github.context;
const repo = context.payload.repository.full_name;

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
        const response = await octokit.request(`GET ${context.payload.repository.url}/commits/${context.sha}/status`);
        // for now, we'll add context filter later
        filtered = response.data;
        // interesting items:
        //  state: pending|
        //  statuses: [] or ??
        if (!filtered.statuses.length) return "IN_PROGRESS";
    } catch (error) {
        core.error(error);
        return "FAILURE";
    }
    return "SUCCESS";
}

monitorAll();

setTimeout(() => {
    core.setFailed("Maximum timeout reached");
    process.exit(1);
}, timeout);
