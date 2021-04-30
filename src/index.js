const core = require('@actions/core');
const github = require('@actions/github');
const util = require('util');

const token = core.getInput('authToken') || process.env.GITHUB_TOKEN;
const timeout = core.getInput('timeout') || 30000;
const interval = core.getInput('interval') || 5000;

const octokit = github.getOctokit(token);
const context = github.context;
const repo = context.payload.repository.full_name;

//core.info(util.inspect(context));

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
    //reqStatus();
}

async function reqChecks() {
    try {
        core.info("Requesting Checks");
        const response = octokit.request("GET {url}/commits/{sha}/check-runs", {
            url: context.payload.repository.url,
            sha: context.sha,
        });
        const again = octokit.request(`GET ${context.payload.repository.url}/commits/${context.sha}/check-runs`);
        console.log(again);
        console.log("Response");
        console.log(response);
        const filtered = response.data.check_runs.filter( run => run.name !== context.action );
        console.log("Print filtered list");
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
        var required;
        core.info("Requesting Status");
        const response = await octokit.request("GET {url}/commits/{sha}/status", {
            url: context.payload.repository.url,
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
