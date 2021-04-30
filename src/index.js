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

function reqAll() {
    reqChecks();
    reqStatus();
}

async function reqChecks() {
    try {
        const response = await axios.get(checkUrl, { headers: reqHeaders});
        console.log(response);
        return response;
    } catch (error) {
        console.log(error);
    }
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

function monitorStatus() {
    console.log("Monitoring for checks and status changes");
    reqAll();
    return "SUCCESS";
}

monitorStatus()
    .then(() => process.exit(0))
    .catch(error => {
        console.log(error);
        process.exit(1);
    });

setTimeout(() => {
    core.setFailed("Maximum timeout reached");
}, timeout)
