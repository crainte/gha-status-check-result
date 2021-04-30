const core = require('@actions/core');
const github = require('@actions/github');
const util = require('util');

const token = core.getInput('authToken') || process.env.GITHUB_TOKEN;
const timeout = core.getInput('timeout') || 30000;
const interval = core.getInput('interval') || 5000;

const octokit = github.getOctokit(token);
const context = github.context;
core.info(util.inspect(context));
const repo = context.payload.repository.name;
core.info(util.inspect(context.payload.repository.owner));
const owner = context.repo();

function monitorStatus() {
    core.info("Monitoring for checks and status changes");
    reqChecks()
        .then(status => {
            switch (status) {
                case "FAILURE":
                    core.info("We have a failure");
                    return;
                case "SUCCESS":
                    core.info("We have a success");
                    return;
                case "IN_PROGRESS":
                    core.info("We have to wait...");
                    return new Promise(resolve => setTimeout(resolve, interval)).then(
                        monitorStatus
                    );
            }
        });
    reqStatus();
}

async function reqChecks() {
    try {
        const response = await octokit.request("GET https://api.github.com/repos/{owner}/{repo}/commits/{sha}/check-runs", {
            owner: owner,
            repo: repo,
            sha: context.sha,
        });
        const filtered = response.data.check_runs.filter( run => run.name !== context.action );
        console.log(filtered);
        const failed = filtered.filter(
            run => run.status === "completed" && run.conclusion === "failure"
        );
        if (failed.length) return "FAILURE";
        const pending = filtered.filter(
            run => run.status === "queued" || run.status === "in_progress"
        );
        if (pending.length) return "IN_PROGRESS";
    } catch (error) {
        console.log(error);
        return "FAILURE";
    }
    return "SUCCESS";
}

async function reqStatus() {
    try {
        var filtered;
        const response = await octokit.request("GET https://api.github.com/repos/{owner}/{repo}/commits/{sha}/status", {
            owner: owner,
            repo: repo,
            sha: context.sha,
        });
        // temp
        filtered = response.data;
        console.log(filtered);
        return filtered;
    } catch (error) {
        console.log(error);
    }
}

monitorStatus();

setTimeout(() => {
    core.setFailed("Maximum timeout reached");
}, timeout);
