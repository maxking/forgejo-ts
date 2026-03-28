"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgejoClient = void 0;
const errors_js_1 = require("./errors.js");
const logger_js_1 = require("./logger.js");
class ForgejoClient {
    instanceUrl;
    token;
    logger;
    timeout;
    constructor(options) {
        this.instanceUrl = options.instanceUrl.replace(/\/+$/, '');
        this.token = options.token ?? '';
        this.logger = options.logger ?? logger_js_1.noopLogger;
        this.timeout = options.timeout ?? 30000;
    }
    // ======================== Internal helpers ========================
    buildHeaders(contentType = 'application/json') {
        const headers = {
            'Accept': 'application/json',
            'Content-Type': contentType
        };
        if (this.token) {
            headers.Authorization = `token ${this.token}`;
        }
        return headers;
    }
    async request(endpoint) {
        const url = `${this.instanceUrl}/api/v1${endpoint}`;
        this.logger.debug('GET', url);
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this.buildHeaders(),
                signal: AbortSignal.timeout(this.timeout),
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new errors_js_1.ForgejoApiError(response.status, response.statusText, body);
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof errors_js_1.ForgejoApiError)
                throw error;
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new errors_js_1.ForgejoNetworkError(url, error);
            }
            if (error instanceof Error && error.name === 'TimeoutError') {
                throw new errors_js_1.ForgejoNetworkError(url, error);
            }
            if (error instanceof Error) {
                throw new errors_js_1.ForgejoNetworkError(url, error);
            }
            throw error;
        }
    }
    async requestAllPages(endpoint, limit = 50) {
        const allItems = [];
        let page = 1;
        for (;;) {
            const sep = endpoint.includes('?') ? '&' : '?';
            const items = await this.request(`${endpoint}${sep}page=${page}&limit=${limit}`);
            allItems.push(...items);
            if (items.length < limit)
                break;
            page++;
        }
        return allItems;
    }
    async requestWithBody(method, endpoint, body) {
        const url = `${this.instanceUrl}/api/v1${endpoint}`;
        this.logger.debug(`${method} ${url}`);
        try {
            const response = await fetch(url, {
                method,
                headers: this.buildHeaders(),
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(this.timeout),
            });
            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                throw new errors_js_1.ForgejoApiError(response.status, response.statusText, errorBody);
            }
            const contentType = response.headers?.get?.('content-type') ?? '';
            if (response.status === 204 || !contentType) {
                try {
                    return await response.json();
                }
                catch {
                    return undefined;
                }
            }
            return await response.json();
        }
        catch (error) {
            if (error instanceof errors_js_1.ForgejoApiError)
                throw error;
            if (error instanceof Error) {
                throw new errors_js_1.ForgejoNetworkError(url, error);
            }
            throw error;
        }
    }
    /**
     * Make a raw web request (not going through /api/v1).
     * Used for web-scraping endpoints like workflow logs.
     */
    async webRequest(url) {
        const headers = {};
        if (this.token) {
            headers.Authorization = `token ${this.token}`;
        }
        this.logger.debug('WEB GET', url);
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(this.timeout),
            });
            if (!response.ok) {
                throw new errors_js_1.ForgejoApiError(response.status, response.statusText, '');
            }
            return await response.text();
        }
        catch (error) {
            if (error instanceof errors_js_1.ForgejoApiError)
                throw error;
            if (error instanceof Error) {
                throw new errors_js_1.ForgejoNetworkError(url, error);
            }
            throw error;
        }
    }
    // ======================== Connection ========================
    async testConnection() {
        this.logger.info('Testing connection to', this.instanceUrl);
        try {
            await this.request('/version');
            this.logger.info('Connection test SUCCESS');
            return true;
        }
        catch (error) {
            this.logger.error('Connection test FAILED:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }
    // ======================== Pull Requests ========================
    async listPullRequests(owner, repo, state = 'all') {
        return this.requestAllPages(`/repos/${owner}/${repo}/pulls?state=${state}`);
    }
    async getPullRequest(owner, repo, number) {
        return this.request(`/repos/${owner}/${repo}/pulls/${number}`);
    }
    async createPullRequest(owner, repo, title, head, base, body) {
        const payload = { title, head, base };
        if (body)
            payload.body = body;
        try {
            return await this.requestWithBody('POST', `/repos/${owner}/${repo}/pulls`, payload);
        }
        catch (error) {
            if (error instanceof errors_js_1.ForgejoApiError) {
                if (error.statusCode === 409) {
                    throw new errors_js_1.ForgejoApiError(409, 'Conflict', 'A pull request already exists for this branch');
                }
                if (error.statusCode === 422) {
                    throw new errors_js_1.ForgejoApiError(422, 'Unprocessable Entity', error.responseBody);
                }
            }
            throw error;
        }
    }
    async updatePullRequest(owner, repo, number, updates) {
        return this.requestWithBody('PATCH', `/repos/${owner}/${repo}/pulls/${number}`, updates);
    }
    async mergePullRequest(owner, repo, number, method = 'merge', deleteBranchAfterMerge = false) {
        try {
            await this.requestWithBody('POST', `/repos/${owner}/${repo}/pulls/${number}/merge`, {
                Do: method,
                delete_branch_after_merge: deleteBranchAfterMerge
            });
        }
        catch (error) {
            if (error instanceof errors_js_1.ForgejoApiError) {
                if (error.statusCode === 405) {
                    throw new errors_js_1.ForgejoApiError(405, 'Not Allowed', 'Merge not allowed - PR may not be mergeable');
                }
                if (error.statusCode === 409) {
                    throw new errors_js_1.ForgejoApiError(409, 'Conflict', 'Merge conflict - PR has conflicts that must be resolved');
                }
            }
            throw error;
        }
    }
    async closePullRequest(owner, repo, number) {
        return this.requestWithBody('PATCH', `/repos/${owner}/${repo}/pulls/${number}`, { state: 'closed' });
    }
    async getPullRequestFiles(owner, repo, number) {
        return this.request(`/repos/${owner}/${repo}/pulls/${number}/files`);
    }
    async getPullRequestRefs(owner, repo, number) {
        const pr = await this.getPullRequest(owner, repo, number);
        return { base: pr.base.ref, head: pr.head.ref };
    }
    async getPullRequestReviews(owner, repo, number) {
        return this.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`);
    }
    async getPullRequestCommits(owner, repo, number) {
        return this.request(`/repos/${owner}/${repo}/pulls/${number}/commits`);
    }
    // ======================== Reviews ========================
    async getReviewComments(owner, repo, prNumber, reviewId) {
        return this.request(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments`);
    }
    async createReview(owner, repo, number, state, body) {
        return this.requestWithBody('POST', `/repos/${owner}/${repo}/pulls/${number}/reviews`, { event: state, body });
    }
    async createReviewWithComments(owner, repo, prNumber, options) {
        return this.requestWithBody('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews`, options);
    }
    // ======================== Issues ========================
    async listIssues(owner, repo, state = 'all') {
        const items = await this.requestAllPages(`/repos/${owner}/${repo}/issues?state=${state}`);
        return items.filter(item => !item.pull_request);
    }
    async getIssue(owner, repo, number) {
        return this.request(`/repos/${owner}/${repo}/issues/${number}`);
    }
    async createIssue(owner, repo, title, body) {
        const payload = { title };
        if (body)
            payload.body = body;
        return this.requestWithBody('POST', `/repos/${owner}/${repo}/issues`, payload);
    }
    async updateIssue(owner, repo, number, updates) {
        return this.requestWithBody('PATCH', `/repos/${owner}/${repo}/issues/${number}`, updates);
    }
    async getIssueComments(owner, repo, number) {
        return this.request(`/repos/${owner}/${repo}/issues/${number}/comments`);
    }
    async createComment(owner, repo, number, body) {
        return this.requestWithBody('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
    }
    async getIssueTimeline(owner, repo, number) {
        return this.request(`/repos/${owner}/${repo}/issues/${number}/timeline`);
    }
    // ======================== Files ========================
    async getFileContents(owner, repo, filepath, ref) {
        const encodedPath = filepath.split('/').map(encodeURIComponent).join('/');
        const endpoint = `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
        const response = await this.request(endpoint);
        if (response.encoding === 'base64') {
            return Buffer.from(response.content, 'base64').toString('utf-8');
        }
        return response.content;
    }
    // ======================== CI / Actions ========================
    async listWorkflowRuns(owner, repo, options) {
        let endpoint = `/repos/${owner}/${repo}/actions/tasks`;
        const params = [];
        if (options?.status)
            params.push(`status=${options.status}`);
        if (options?.branch)
            params.push(`branch=${options.branch}`);
        if (params.length)
            endpoint += '?' + params.join('&');
        const limit = 50;
        const allRuns = [];
        let page = 1;
        for (;;) {
            const sep = endpoint.includes('?') ? '&' : '?';
            const response = await this.request(`${endpoint}${sep}page=${page}&limit=${limit}`);
            allRuns.push(...response.workflow_runs);
            if (response.workflow_runs.length < limit)
                break;
            page++;
        }
        return { total_count: allRuns.length, workflow_runs: allRuns };
    }
    async getWorkflowRun(owner, repo, runId) {
        return this.request(`/repos/${owner}/${repo}/actions/runs/${runId}`);
    }
    async getWorkflowJobs(owner, repo, runId) {
        return this.request(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
    }
    async getWorkflowLogs(owner, repo, runNumber, jobRef = 0) {
        const url = `${this.resolveWorkflowJobUrl(owner, repo, runNumber, jobRef)}/logs`;
        return this.webRequest(url);
    }
    async getJobSteps(owner, repo, runNumber, jobRef = 0) {
        const url = this.resolveWorkflowJobUrl(owner, repo, runNumber, jobRef);
        const html = await this.webRequest(url);
        const match = html.match(/data-initial-post-response="([^"]*)"/);
        if (!match)
            return [];
        const jsonStr = match[1]
            .replace(/&#34;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
        const data = JSON.parse(jsonStr);
        const steps = data.state?.currentJob?.steps;
        if (!Array.isArray(steps))
            return [];
        return steps.map(s => ({
            summary: s.summary ?? 'Unknown step',
            duration: s.duration ?? '',
            status: s.status ?? 'unknown'
        }));
    }
    /**
     * Resolve the most reliable job page URL in priority order:
     * 1) server-provided jobHtmlUrl, 2) API jobId, 3) legacy positional jobIndex.
     * This preserves backward compatibility while preferring instance-authored URLs.
     */
    resolveWorkflowJobUrl(owner, repo, runNumber, jobRef) {
        if (typeof jobRef === 'number') {
            return `${this.instanceUrl}/${owner}/${repo}/actions/runs/${runNumber}/jobs/${jobRef}`;
        }
        if (jobRef.jobHtmlUrl) {
            const resolvedUrl = new URL(jobRef.jobHtmlUrl, `${this.instanceUrl}/`);
            const instanceOrigin = new URL(this.instanceUrl).origin;
            if (resolvedUrl.origin !== instanceOrigin) {
                throw new Error(`Workflow job URL must match Forgejo instance origin: ${instanceOrigin}`);
            }
            return resolvedUrl.toString().replace(/\/+$/, '');
        }
        if (jobRef.jobId !== undefined) {
            return `${this.instanceUrl}/${owner}/${repo}/actions/runs/${runNumber}/jobs/${jobRef.jobId}`;
        }
        if (jobRef.jobIndex !== undefined) {
            return `${this.instanceUrl}/${owner}/${repo}/actions/runs/${runNumber}/jobs/${jobRef.jobIndex}`;
        }
        throw new Error('Workflow job reference requires jobHtmlUrl, jobId, or jobIndex');
    }
    async rerunWorkflow(owner, repo, runId) {
        await this.requestWithBody('POST', `/repos/${owner}/${repo}/actions/runs/${runId}/rerun`);
    }
    async getCommitStatuses(owner, repo, sha) {
        return this.request(`/repos/${owner}/${repo}/statuses/${sha}`);
    }
    // ======================== Tags ========================
    async listTags(owner, repo) {
        return this.requestAllPages(`/repos/${owner}/${repo}/tags`);
    }
    async createTag(owner, repo, options) {
        return this.requestWithBody('POST', `/repos/${owner}/${repo}/tags`, options);
    }
    async deleteTag(owner, repo, tagName) {
        await this.requestWithBody('DELETE', `/repos/${owner}/${repo}/tags/${encodeURIComponent(tagName)}`);
    }
    // ======================== Releases ========================
    async listReleases(owner, repo) {
        return this.requestAllPages(`/repos/${owner}/${repo}/releases`);
    }
    async createRelease(owner, repo, options) {
        return this.requestWithBody('POST', `/repos/${owner}/${repo}/releases`, options);
    }
    async getRelease(owner, repo, id) {
        return this.request(`/repos/${owner}/${repo}/releases/${id}`);
    }
    async getReleaseByTag(owner, repo, tag) {
        return this.request(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
    }
    async deleteRelease(owner, repo, id) {
        await this.requestWithBody('DELETE', `/repos/${owner}/${repo}/releases/${id}`);
    }
    // ======================== Raw API ========================
    /**
     * Escape hatch for any Forgejo API endpoint not covered by typed methods.
     * @param method HTTP method
     * @param endpoint API path (e.g. "/repos/owner/repo/topics")
     * @param body Optional request body
     */
    async rawRequest(method, endpoint, body) {
        if (method.toUpperCase() === 'GET') {
            return this.request(endpoint);
        }
        return this.requestWithBody(method.toUpperCase(), endpoint, body);
    }
}
exports.ForgejoClient = ForgejoClient;
//# sourceMappingURL=client.js.map