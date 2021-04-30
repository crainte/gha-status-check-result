const core = require('@actions/core');
const axios = require('axios');
const github = require('@actions/github');

const token = core.getInput('authToken') || process.env.GITHUB_TOKEN;
const timeout = core.getInput('timeout') || 30000;
const interval = core.getInput('interval') || 10000;

const selfName = process.env.GITHUB_ACTION;
const selfRepo = process.env.GITHUB_REPOSITORY;
const selfSha  = process.env.GITHUB_SHA;

const apiUrl = `https://api.github.com/repos/${selfRepo}`;
const checkUrl = `${apiUrl}/commits/${selfSha}/check-runs`;
const reqHeaders = {
    Accept: "application/vnd.github.v3+json; application/vnd.github.antiope-preview+json",
    Authorization: `token ${token}`
}

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
        const response = await axios.get(checkUrl, { headers: reqHeaders});
        const filtered = response.check_runs.filter( run => run.name !== selfName );
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
        ret = "FAILURE";
    }
    return "SUCCESS";
}

async function reqStatus() {
    try {
        const response = await axios.get(checkUrl, { headers: reqHeaders});
        console.log(response);
        return response;
    } catch (error) {
        console.log(error);
    }
}

monitorStatus();

setTimeout(() => {
    core.setFailed("Maximum timeout reached");
}, timeout);
