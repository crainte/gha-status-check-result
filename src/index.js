import { Octokit } from "@octokit/core";
import { core } from "@actions/core";
import { github } from "@actions/github";

const token = core.getInput('authToken') || process.env.GITHUB_TOKEN;
const timeout = core.getInput('timeout') || 30000;
const interval = core.getInput('interval') || 5000;
const context = core.getInput('context') || null;

const octokit = new Octokit({ auth: token });
const selfName = process.env.GITHUB_ACTION;
const selfRepo = process.env.GITHUB_REPOSITORY;
const selfSha  = process.env.GITHUB_SHA;

function monitorStatus() {
    console.log("Monitoring for checks and status changes");
    reqChecks()
        .then(status => {
            switch (status) {
                case "FAILURE":
                    console.log("We have a failure");
                    return;
                case "SUCCESS":
                    console.log("We have a success");
                    return;
                case "IN_PROGRESS":
                    console.log("We have to wait...");
                    return new Promise(resolve => setTimeout(resolve, interval)).then(
                        monitorStatus
                    );
            }
        });
    reqStatus();
}

async function reqChecks() {
    try {
        const response = await octokit.request("GET https://api.github.com/repos/{repo}/commits/{sha}/check-runs", {
            repo: selfRepo,
            sha: selfSha,
        });
        const filtered = response.data.check_runs.filter( run => run.name !== selfName );
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
        const response = await octokit.request("GET https://api.github.com/repos/{repo}/commits/{sha}/status", {
            repo: selfRepo,
            sha: selfSha,
        });
        if (context) {
            // look for the specific context
            filtered = response.data;
        } else {
            filtered = response.data;
        }
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
