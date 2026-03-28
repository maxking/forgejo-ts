import { ForgejoApiError, ForgejoNetworkError } from './errors.js';
import { ForgejoLogger, noopLogger } from './logger.js';
import {
  PullRequest, PullRequestListItem, PullRequestFile,
  FileContentsResponse, CommitStatus, PullRequestReview, PullRequestCommit,
  Issue, IssueListItem, IssueComment, TimelineEvent,
  ActionTasksResponse, WorkflowRun, WorkflowJobsResponse, WorkflowJobRef,
  ReviewComment, PullReview, CreatePullReviewOptions,
  Tag, CreateTagOptions,
  Release, CreateReleaseOptions,
} from './types/index.js';

export interface ForgejoClientOptions {
  instanceUrl: string;
  token?: string;
  logger?: ForgejoLogger;
  timeout?: number;
}

export class ForgejoClient {
  private readonly instanceUrl: string;
  private readonly token: string;
  private readonly logger: ForgejoLogger;
  private readonly timeout: number;

  constructor(options: ForgejoClientOptions) {
    this.instanceUrl = options.instanceUrl.replace(/\/+$/, '');
    this.token = options.token ?? '';
    this.logger = options.logger ?? noopLogger;
    this.timeout = options.timeout ?? 30000;
  }

  // ======================== Internal helpers ========================

  private buildHeaders(contentType = 'application/json'): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': contentType
    };
    if (this.token) {
      headers.Authorization = `token ${this.token}`;
    }
    return headers;
  }

  private async request<T>(endpoint: string): Promise<T> {
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
        throw new ForgejoApiError(response.status, response.statusText, body);
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof ForgejoApiError) throw error;
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ForgejoNetworkError(url, error);
      }
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ForgejoNetworkError(url, error);
      }
      if (error instanceof Error) {
        throw new ForgejoNetworkError(url, error);
      }
      throw error;
    }
  }

  private async requestAllPages<T>(endpoint: string, limit = 50): Promise<T[]> {
    const allItems: T[] = [];
    let page = 1;

    for (;;) {
      const sep = endpoint.includes('?') ? '&' : '?';
      const items = await this.request<T[]>(`${endpoint}${sep}page=${page}&limit=${limit}`);
      allItems.push(...items);
      if (items.length < limit) break;
      page++;
    }

    return allItems;
  }

  private async requestWithBody<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
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
        throw new ForgejoApiError(response.status, response.statusText, errorBody);
      }

      const contentType = response.headers?.get?.('content-type') ?? '';
      if (response.status === 204 || !contentType) {
        try {
          return await response.json() as T;
        } catch {
          return undefined as T;
        }
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ForgejoApiError) throw error;
      if (error instanceof Error) {
        throw new ForgejoNetworkError(url, error);
      }
      throw error;
    }
  }

  /**
   * Make a raw web request (not going through /api/v1).
   * Used for web-scraping endpoints like workflow logs.
   */
  private async webRequest(url: string): Promise<string> {
    const headers: Record<string, string> = {};
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
        throw new ForgejoApiError(response.status, response.statusText, '');
      }

      return await response.text();
    } catch (error) {
      if (error instanceof ForgejoApiError) throw error;
      if (error instanceof Error) {
        throw new ForgejoNetworkError(url, error);
      }
      throw error;
    }
  }

  // ======================== Connection ========================

  async testConnection(): Promise<boolean> {
    this.logger.info('Testing connection to', this.instanceUrl);
    try {
      await this.request<{ version?: string }>('/version');
      this.logger.info('Connection test SUCCESS');
      return true;
    } catch (error) {
      this.logger.error('Connection test FAILED:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  // ======================== Pull Requests ========================

  async listPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<PullRequestListItem[]> {
    return this.requestAllPages<PullRequestListItem>(`/repos/${owner}/${repo}/pulls?state=${state}`);
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest> {
    return this.request<PullRequest>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  async createPullRequest(
    owner: string, repo: string,
    title: string, head: string, base: string, body?: string
  ): Promise<PullRequest> {
    const payload: Record<string, string> = { title, head, base };
    if (body) payload.body = body;

    try {
      return await this.requestWithBody<PullRequest>('POST', `/repos/${owner}/${repo}/pulls`, payload);
    } catch (error) {
      if (error instanceof ForgejoApiError) {
        if (error.statusCode === 409) {
          throw new ForgejoApiError(409, 'Conflict', 'A pull request already exists for this branch');
        }
        if (error.statusCode === 422) {
          throw new ForgejoApiError(422, 'Unprocessable Entity', error.responseBody);
        }
      }
      throw error;
    }
  }

  async updatePullRequest(
    owner: string, repo: string, number: number,
    updates: { title?: string; body?: string; state?: 'open' | 'closed' }
  ): Promise<PullRequest> {
    return this.requestWithBody<PullRequest>('PATCH', `/repos/${owner}/${repo}/pulls/${number}`, updates);
  }

  async mergePullRequest(
    owner: string, repo: string, number: number,
    method: 'merge' | 'squash' | 'rebase' | 'rebase-merge' | 'fast-forward-only' = 'merge',
    deleteBranchAfterMerge = false
  ): Promise<void> {
    try {
      await this.requestWithBody<void>('POST', `/repos/${owner}/${repo}/pulls/${number}/merge`, {
        Do: method,
        delete_branch_after_merge: deleteBranchAfterMerge
      });
    } catch (error) {
      if (error instanceof ForgejoApiError) {
        if (error.statusCode === 405) {
          throw new ForgejoApiError(405, 'Not Allowed', 'Merge not allowed - PR may not be mergeable');
        }
        if (error.statusCode === 409) {
          throw new ForgejoApiError(409, 'Conflict', 'Merge conflict - PR has conflicts that must be resolved');
        }
      }
      throw error;
    }
  }

  async closePullRequest(owner: string, repo: string, number: number): Promise<PullRequest> {
    return this.requestWithBody<PullRequest>('PATCH', `/repos/${owner}/${repo}/pulls/${number}`, { state: 'closed' });
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<PullRequestFile[]> {
    return this.request<PullRequestFile[]>(`/repos/${owner}/${repo}/pulls/${number}/files`);
  }

  async getPullRequestRefs(owner: string, repo: string, number: number): Promise<{ base: string; head: string }> {
    const pr = await this.getPullRequest(owner, repo, number);
    return { base: pr.base.ref, head: pr.head.ref };
  }

  async getPullRequestReviews(owner: string, repo: string, number: number): Promise<PullRequestReview[]> {
    return this.request<PullRequestReview[]>(`/repos/${owner}/${repo}/pulls/${number}/reviews`);
  }

  async getPullRequestCommits(owner: string, repo: string, number: number): Promise<PullRequestCommit[]> {
    return this.request<PullRequestCommit[]>(`/repos/${owner}/${repo}/pulls/${number}/commits`);
  }

  // ======================== Reviews ========================

  async getReviewComments(owner: string, repo: string, prNumber: number, reviewId: number): Promise<ReviewComment[]> {
    return this.request<ReviewComment[]>(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments`);
  }

  async createReview(
    owner: string, repo: string, number: number,
    state: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string
  ): Promise<PullRequestReview> {
    return this.requestWithBody<PullRequestReview>(
      'POST', `/repos/${owner}/${repo}/pulls/${number}/reviews`,
      { event: state, body }
    );
  }

  async createReviewWithComments(
    owner: string, repo: string, prNumber: number,
    options: CreatePullReviewOptions
  ): Promise<PullReview> {
    return this.requestWithBody<PullReview>(
      'POST',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews`,
      options
    );
  }

  // ======================== Issues ========================

  async listIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<IssueListItem[]> {
    const items = await this.requestAllPages<IssueListItem>(`/repos/${owner}/${repo}/issues?state=${state}`);
    return items.filter(item => !item.pull_request);
  }

  async getIssue(owner: string, repo: string, number: number): Promise<Issue> {
    return this.request<Issue>(`/repos/${owner}/${repo}/issues/${number}`);
  }

  async createIssue(owner: string, repo: string, title: string, body?: string): Promise<Issue> {
    const payload: Record<string, string> = { title };
    if (body) payload.body = body;
    return this.requestWithBody<Issue>('POST', `/repos/${owner}/${repo}/issues`, payload);
  }

  async updateIssue(
    owner: string, repo: string, number: number,
    updates: { title?: string; body?: string; state?: 'open' | 'closed' }
  ): Promise<Issue> {
    return this.requestWithBody<Issue>('PATCH', `/repos/${owner}/${repo}/issues/${number}`, updates);
  }

  async getIssueComments(owner: string, repo: string, number: number): Promise<IssueComment[]> {
    return this.request<IssueComment[]>(`/repos/${owner}/${repo}/issues/${number}/comments`);
  }

  async createComment(owner: string, repo: string, number: number, body: string): Promise<IssueComment> {
    return this.requestWithBody<IssueComment>('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
  }

  async getIssueTimeline(owner: string, repo: string, number: number): Promise<TimelineEvent[]> {
    return this.request<TimelineEvent[]>(`/repos/${owner}/${repo}/issues/${number}/timeline`);
  }

  // ======================== Files ========================

  async getFileContents(owner: string, repo: string, filepath: string, ref: string): Promise<string> {
    const encodedPath = filepath.split('/').map(encodeURIComponent).join('/');
    const endpoint = `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
    const response = await this.request<FileContentsResponse>(endpoint);

    if (response.encoding === 'base64') {
      return Buffer.from(response.content, 'base64').toString('utf-8');
    }
    return response.content;
  }

  // ======================== CI / Actions ========================

  async listWorkflowRuns(owner: string, repo: string, options?: { status?: string; branch?: string }): Promise<ActionTasksResponse> {
    let endpoint = `/repos/${owner}/${repo}/actions/tasks`;
    const params: string[] = [];
    if (options?.status) params.push(`status=${options.status}`);
    if (options?.branch) params.push(`branch=${options.branch}`);
    if (params.length) endpoint += '?' + params.join('&');

    const limit = 50;
    const allRuns: ActionTasksResponse['workflow_runs'] = [];
    let page = 1;

    for (;;) {
      const sep = endpoint.includes('?') ? '&' : '?';
      const response = await this.request<ActionTasksResponse>(`${endpoint}${sep}page=${page}&limit=${limit}`);
      allRuns.push(...response.workflow_runs);
      if (response.workflow_runs.length < limit) break;
      page++;
    }

    return { total_count: allRuns.length, workflow_runs: allRuns };
  }

  async getWorkflowRun(owner: string, repo: string, runId: number): Promise<WorkflowRun> {
    return this.request<WorkflowRun>(`/repos/${owner}/${repo}/actions/runs/${runId}`);
  }

  async getWorkflowJobs(owner: string, repo: string, runId: number): Promise<WorkflowJobsResponse> {
    return this.request<WorkflowJobsResponse>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
  }

  async getWorkflowLogs(owner: string, repo: string, runNumber: number, jobRef: WorkflowJobRef | number = 0): Promise<string> {
    const url = `${this.resolveWorkflowJobUrl(owner, repo, runNumber, jobRef)}/logs`;
    return this.webRequest(url);
  }

  async getJobSteps(
    owner: string, repo: string, runNumber: number, jobRef: WorkflowJobRef | number = 0
  ): Promise<{ summary: string; duration: string; status: string }[]> {
    const url = this.resolveWorkflowJobUrl(owner, repo, runNumber, jobRef);
    const html = await this.webRequest(url);

    const match = html.match(/data-initial-post-response="([^"]*)"/);
    if (!match) return [];

    const jsonStr = match[1]
      .replace(/&#34;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    const data = JSON.parse(jsonStr) as {
      state?: { currentJob?: { steps?: { summary?: string; duration?: string; status?: string }[] } }
    };

    const steps = data.state?.currentJob?.steps;
    if (!Array.isArray(steps)) return [];

    return steps.map(s => ({
      summary: s.summary ?? 'Unknown step',
      duration: s.duration ?? '',
      status: s.status ?? 'unknown'
    }));
  }

  private resolveWorkflowJobUrl(owner: string, repo: string, runNumber: number, jobRef: WorkflowJobRef | number): string {
    if (typeof jobRef === 'number') {
      return `${this.instanceUrl}/${owner}/${repo}/actions/runs/${runNumber}/jobs/${jobRef}`;
    }

    if (jobRef.jobHtmlUrl) {
      return new URL(jobRef.jobHtmlUrl, `${this.instanceUrl}/`).toString();
    }

    if (jobRef.jobId !== undefined) {
      return `${this.instanceUrl}/${owner}/${repo}/actions/runs/${runNumber}/jobs/${jobRef.jobId}`;
    }

    if (jobRef.jobIndex !== undefined) {
      return `${this.instanceUrl}/${owner}/${repo}/actions/runs/${runNumber}/jobs/${jobRef.jobIndex}`;
    }

    throw new Error('Workflow job reference requires jobHtmlUrl, jobId, or jobIndex');
  }

  async rerunWorkflow(owner: string, repo: string, runId: number): Promise<void> {
    await this.requestWithBody<void>('POST', `/repos/${owner}/${repo}/actions/runs/${runId}/rerun`);
  }

  async getCommitStatuses(owner: string, repo: string, sha: string): Promise<CommitStatus[]> {
    return this.request<CommitStatus[]>(`/repos/${owner}/${repo}/statuses/${sha}`);
  }

  // ======================== Tags ========================

  async listTags(owner: string, repo: string): Promise<Tag[]> {
    return this.requestAllPages<Tag>(`/repos/${owner}/${repo}/tags`);
  }

  async createTag(owner: string, repo: string, options: CreateTagOptions): Promise<Tag> {
    return this.requestWithBody<Tag>('POST', `/repos/${owner}/${repo}/tags`, options);
  }

  async deleteTag(owner: string, repo: string, tagName: string): Promise<void> {
    await this.requestWithBody<void>('DELETE', `/repos/${owner}/${repo}/tags/${encodeURIComponent(tagName)}`);
  }

  // ======================== Releases ========================

  async listReleases(owner: string, repo: string): Promise<Release[]> {
    return this.requestAllPages<Release>(`/repos/${owner}/${repo}/releases`);
  }

  async createRelease(owner: string, repo: string, options: CreateReleaseOptions): Promise<Release> {
    return this.requestWithBody<Release>('POST', `/repos/${owner}/${repo}/releases`, options);
  }

  async getRelease(owner: string, repo: string, id: number): Promise<Release> {
    return this.request<Release>(`/repos/${owner}/${repo}/releases/${id}`);
  }

  async getReleaseByTag(owner: string, repo: string, tag: string): Promise<Release> {
    return this.request<Release>(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  }

  async deleteRelease(owner: string, repo: string, id: number): Promise<void> {
    await this.requestWithBody<void>('DELETE', `/repos/${owner}/${repo}/releases/${id}`);
  }

  // ======================== Raw API ========================

  /**
   * Escape hatch for any Forgejo API endpoint not covered by typed methods.
   * @param method HTTP method
   * @param endpoint API path (e.g. "/repos/owner/repo/topics")
   * @param body Optional request body
   */
  async rawRequest<T = unknown>(method: string, endpoint: string, body?: unknown): Promise<T> {
    if (method.toUpperCase() === 'GET') {
      return this.request<T>(endpoint);
    }
    return this.requestWithBody<T>(method.toUpperCase(), endpoint, body);
  }
}
