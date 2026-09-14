import { ForgejoApiError, ForgejoNetworkError } from './errors.js';
import { ForgejoLogger, noopLogger } from './logger.js';
import {
  PullRequest, PullRequestListItem, PullRequestListOptions, PullRequestSearchOptions, PullRequestFile,
  FileContentsResponse, CommitStatus, PullRequestReview, PullRequestCommit,
  Issue, IssueListItem, IssueListOptions, IssueComment, TimelineEvent, CreateIssueOptions, UpdateIssueOptions,
  ActionTasksResponse, WorkflowRunListItem, WorkflowRun, WorkflowJobsResponse, WorkflowJobRef,
  ReviewComment, PullReview, CreatePullReviewOptions,
  Tag, CreateTagOptions,
  Release, CreateReleaseOptions,
  CreateRepositoryOptions, RepositoryInfo, PaginatedResult, PaginationOptions, RepositorySearchOptions,
  RepositoryBranch, RepositoryContentEntry, RepositoryContentOptions,
  Label, Milestone, MilestoneListOptions, AssignableUser,
  UpdatePullRequestOptions,
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
  /** Cache of run job mappings, keyed by "owner/repo/runNumber" */
  private readonly jobIndexCache = new Map<string, { byId: Map<number, number>; byName: Map<string, number> }>();

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

  private parseTotalCount(response: Response): number | null {
    const totalCount = response.headers?.get?.('x-total-count');
    if (!totalCount) return null;

    const parsed = Number.parseInt(totalCount, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private paginatedResult<T>(
    items: T[],
    page: number,
    limit: number,
    totalCount: number | null
  ): PaginatedResult<T> {
    return {
      items,
      page,
      limit,
      totalCount,
      hasMore: totalCount === null ? items.length === limit : page * limit < totalCount
    };
  }

  private async requestPage<T>(endpoint: string, page = 1, limit = 50): Promise<PaginatedResult<T>> {
    const sep = endpoint.includes('?') ? '&' : '?';
    const url = `${this.instanceUrl}/api/v1${endpoint}${sep}page=${page}&limit=${limit}`;
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

      const items = await response.json() as T[];
      return this.paginatedResult(items, page, limit, this.parseTotalCount(response));
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

  private appendParam(params: URLSearchParams, key: string, value: string | number | undefined): void {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }

  private encodePath(path: string): string {
    return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  private async collectAllPages<T>(fetchPage: (page: number) => Promise<PaginatedResult<T>>): Promise<T[]> {
    const allItems: T[] = [];
    let page = 1;

    for (;;) {
      const result = await fetchPage(page);
      allItems.push(...result.items);
      if (!result.hasMore) break;
      page++;
    }

    return allItems;
  }

  private async mapInBatches<T, R>(items: T[], batchSize: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];

    for (let start = 0; start < items.length; start += batchSize) {
      const batch = items.slice(start, start + batchSize);
      results.push(...await Promise.all(batch.map(mapper)));
    }

    return results;
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

  async listPullRequests(
    owner: string,
    repo: string,
    stateOrOptions: 'open' | 'closed' | 'all' | PullRequestListOptions = 'all'
  ): Promise<PullRequestListItem[]> {
    const options = typeof stateOrOptions === 'string' ? { state: stateOrOptions } : stateOrOptions;
    return this.collectAllPages(page => this.listPullRequestsPage(owner, repo, { ...options, page }));
  }

  async listPullRequestsPage(
    owner: string,
    repo: string,
    options: PullRequestListOptions = {}
  ): Promise<PaginatedResult<PullRequestListItem>> {
    const query = options.query?.trim();
    if (query) {
      return this.searchPullRequestsPage(owner, repo, {
        state: options.state,
        query,
        page: options.page,
        limit: options.limit,
        sort: options.sort,
        labels: options.labels?.join(','),
        milestones: options.milestone !== undefined ? String(options.milestone) : undefined,
        createdBy: options.poster
      });
    }

    const params = new URLSearchParams({ state: options.state ?? 'all' });
    this.appendParam(params, 'sort', options.sort);
    this.appendParam(params, 'milestone', options.milestone);
    this.appendParam(params, 'poster', options.poster);
    for (const label of options.labels ?? []) {
      params.append('labels', String(label));
    }

    return this.requestPage<PullRequestListItem>(
      `/repos/${owner}/${repo}/pulls?${params}`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  async searchPullRequestsPage(
    owner: string,
    repo: string,
    options: PullRequestSearchOptions
  ): Promise<PaginatedResult<PullRequestListItem>> {
    const query = options.query.trim();
    if (!query) {
      return this.listPullRequestsPage(owner, repo, {
        state: options.state,
        page: options.page,
        limit: options.limit,
        sort: options.sort
      });
    }

    const params = new URLSearchParams({
      state: options.state ?? 'all',
      type: 'pulls',
      q: query
    });
    this.appendParam(params, 'labels', options.labels);
    this.appendParam(params, 'milestones', options.milestones);
    this.appendParam(params, 'since', options.since);
    this.appendParam(params, 'before', options.before);
    this.appendParam(params, 'created_by', options.createdBy);
    this.appendParam(params, 'assigned_by', options.assignedBy);
    this.appendParam(params, 'mentioned_by', options.mentionedBy);
    this.appendParam(params, 'sort', options.sort);

    const matches = await this.requestPage<IssueListItem>(
      `/repos/${owner}/${repo}/issues?${params}`,
      options.page ?? 1,
      options.limit ?? 50
    );
    const pullRequestNumbers = matches.items
      .filter(item => item.pull_request)
      .map(item => item.number);
    const items = await this.mapInBatches(pullRequestNumbers, 5, number => this.getPullRequest(owner, repo, number));

    return {
      ...matches,
      items
    };
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
    updates: UpdatePullRequestOptions
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
    return this.collectAllPages(page => this.getPullRequestFilesPage(owner, repo, number, { page }));
  }

  async getPullRequestFilesPage(
    owner: string,
    repo: string,
    number: number,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<PullRequestFile>> {
    return this.requestPage<PullRequestFile>(
      `/repos/${owner}/${repo}/pulls/${number}/files`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  async getPullRequestRefs(owner: string, repo: string, number: number): Promise<{ base: string; head: string }> {
    const pr = await this.getPullRequest(owner, repo, number);
    return { base: pr.base.ref, head: pr.head.ref };
  }

  async getPullRequestReviews(owner: string, repo: string, number: number): Promise<PullRequestReview[]> {
    return this.collectAllPages(page => this.getPullRequestReviewsPage(owner, repo, number, { page }));
  }

  async getPullRequestReviewsPage(
    owner: string,
    repo: string,
    number: number,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<PullRequestReview>> {
    return this.requestPage<PullRequestReview>(
      `/repos/${owner}/${repo}/pulls/${number}/reviews`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  async getPullRequestCommits(owner: string, repo: string, number: number): Promise<PullRequestCommit[]> {
    return this.collectAllPages(page => this.getPullRequestCommitsPage(owner, repo, number, { page }));
  }

  async getPullRequestCommitsPage(
    owner: string,
    repo: string,
    number: number,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<PullRequestCommit>> {
    return this.requestPage<PullRequestCommit>(
      `/repos/${owner}/${repo}/pulls/${number}/commits`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  // ======================== Reviews ========================

  async getReviewComments(owner: string, repo: string, prNumber: number, reviewId: number): Promise<ReviewComment[]> {
    return this.collectAllPages(page => this.getReviewCommentsPage(owner, repo, prNumber, reviewId, { page }));
  }

  async getReviewCommentsPage(
    owner: string,
    repo: string,
    prNumber: number,
    reviewId: number,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<ReviewComment>> {
    return this.requestPage<ReviewComment>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments`,
      options.page ?? 1,
      options.limit ?? 50
    );
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

  async listIssues(
    owner: string,
    repo: string,
    stateOrOptions: 'open' | 'closed' | 'all' | IssueListOptions = 'all'
  ): Promise<IssueListItem[]> {
    const options = typeof stateOrOptions === 'string' ? { state: stateOrOptions } : stateOrOptions;
    return this.collectAllPages(page => this.listIssuesPage(owner, repo, { ...options, page }));
  }

  async listIssuesPage(
    owner: string,
    repo: string,
    options: IssueListOptions = {}
  ): Promise<PaginatedResult<IssueListItem>> {
    const params = new URLSearchParams({
      state: options.state ?? 'all',
      type: 'issues'
    });
    this.appendParam(params, 'q', options.query?.trim());
    this.appendParam(params, 'labels', options.labels);
    this.appendParam(params, 'milestones', options.milestones);
    this.appendParam(params, 'since', options.since);
    this.appendParam(params, 'before', options.before);
    this.appendParam(params, 'created_by', options.createdBy);
    this.appendParam(params, 'assigned_by', options.assignedBy);
    this.appendParam(params, 'mentioned_by', options.mentionedBy);
    this.appendParam(params, 'sort', options.sort);

    const page = await this.requestPage<IssueListItem>(
      `/repos/${owner}/${repo}/issues?${params}`,
      options.page ?? 1,
      options.limit ?? 50
    );
    return {
      ...page,
      items: page.items.filter(item => !item.pull_request)
    };
  }

  async getIssue(owner: string, repo: string, number: number): Promise<Issue> {
    return this.request<Issue>(`/repos/${owner}/${repo}/issues/${number}`);
  }

  async createIssue(
    owner: string, repo: string, title: string, body?: string,
    options: CreateIssueOptions = {}
  ): Promise<Issue> {
    const payload: Record<string, unknown> = { title };
    if (body !== undefined) payload.body = body;
    if (options.labels !== undefined) payload.labels = options.labels;
    if (options.assignees !== undefined) payload.assignees = options.assignees;
    if (options.milestone !== undefined) payload.milestone = options.milestone;
    if (options.due_date !== undefined) payload.due_date = options.due_date;
    return this.requestWithBody<Issue>('POST', `/repos/${owner}/${repo}/issues`, payload);
  }

  async updateIssue(
    owner: string, repo: string, number: number,
    updates: UpdateIssueOptions
  ): Promise<Issue> {
    return this.requestWithBody<Issue>('PATCH', `/repos/${owner}/${repo}/issues/${number}`, updates);
  }

  /**
   * Replaces the full label set on an issue or pull request.
   *
   * Forgejo's issue/PR edit payloads (`EditIssueOption`) have no `labels`
   * field at all — labels are only editable through this dedicated
   * endpoint, `PUT /repos/{owner}/{repo}/issues/{index}/labels`. The same
   * path works for pull request indices since PRs are issues internally.
   * Pass an empty array to clear all labels.
   */
  async setIssueLabels(owner: string, repo: string, number: number, labelIds: number[]): Promise<Label[]> {
    return this.requestWithBody<Label[]>('PUT', `/repos/${owner}/${repo}/issues/${number}/labels`, { labels: labelIds });
  }

  async getIssueComments(owner: string, repo: string, number: number): Promise<IssueComment[]> {
    return this.collectAllPages(page => this.getIssueCommentsPage(owner, repo, number, { page }));
  }

  async getIssueCommentsPage(
    owner: string,
    repo: string,
    number: number,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<IssueComment>> {
    return this.requestPage<IssueComment>(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  async createComment(owner: string, repo: string, number: number, body: string): Promise<IssueComment> {
    return this.requestWithBody<IssueComment>('POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
  }

  async getIssueTimeline(owner: string, repo: string, number: number): Promise<TimelineEvent[]> {
    return this.collectAllPages(page => this.getIssueTimelinePage(owner, repo, number, { page }));
  }

  async getIssueTimelinePage(
    owner: string,
    repo: string,
    number: number,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<TimelineEvent>> {
    return this.requestPage<TimelineEvent>(
      `/repos/${owner}/${repo}/issues/${number}/timeline`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  // ======================== Labels, Milestones & Assignees ========================

  async listRepoLabels(owner: string, repo: string, options: PaginationOptions = {}): Promise<Label[]> {
    return this.collectAllPages(page => this.listRepoLabelsPage(owner, repo, { ...options, page }));
  }

  async listRepoLabelsPage(
    owner: string, repo: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<Label>> {
    return this.requestPage<Label>(
      `/repos/${owner}/${repo}/labels`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  async listMilestones(owner: string, repo: string, options: MilestoneListOptions = {}): Promise<Milestone[]> {
    return this.collectAllPages(page => this.listMilestonesPage(owner, repo, { ...options, page }));
  }

  async listMilestonesPage(
    owner: string, repo: string,
    options: MilestoneListOptions = {}
  ): Promise<PaginatedResult<Milestone>> {
    const params = new URLSearchParams();
    this.appendParam(params, 'state', options.state);
    const query = params.size > 0 ? `?${params}` : '';
    return this.requestPage<Milestone>(
      `/repos/${owner}/${repo}/milestones${query}`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  /**
   * Lists users eligible for assignment on a repository's issues/PRs.
   *
   * Forgejo's assignees endpoint (`GET /repos/{owner}/{repo}/assignees`,
   * `GetAssignees` in `routers/api/v1/repo/collaborators.go`) returns the
   * complete assignee list and consumes no `page`/`limit` parameters, so
   * this is a single request — not a paginated list method.
   */
  async listAssignableUsers(owner: string, repo: string): Promise<AssignableUser[]> {
    return this.request<AssignableUser[]>(`/repos/${owner}/${repo}/assignees`);
  }

  // ======================== Files ========================

  async listBranches(owner: string, repo: string, options: PaginationOptions = {}): Promise<RepositoryBranch[]> {
    return this.collectAllPages(page => this.listBranchesPage(owner, repo, { ...options, page }));
  }

  async listBranchesPage(
    owner: string,
    repo: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<RepositoryBranch>> {
    return this.requestPage<RepositoryBranch>(
      `/repos/${owner}/${repo}/branches`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  async getRepositoryContents(
    owner: string,
    repo: string,
    path = '',
    options: RepositoryContentOptions = {}
  ): Promise<RepositoryContentEntry | RepositoryContentEntry[]> {
    const params = new URLSearchParams();
    this.appendParam(params, 'ref', options.ref);
    this.appendParam(params, 'page', options.page);
    this.appendParam(params, 'limit', options.limit);
    const encodedPath = this.encodePath(path);
    const query = params.size > 0 ? `?${params}` : '';
    return this.request<RepositoryContentEntry | RepositoryContentEntry[]>(
      `/repos/${owner}/${repo}/contents${encodedPath ? `/${encodedPath}` : ''}${query}`
    );
  }

  async getFileContents(owner: string, repo: string, filepath: string, ref: string): Promise<string> {
    const encodedPath = this.encodePath(filepath);
    const endpoint = `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
    const response = await this.request<FileContentsResponse>(endpoint);

    if (response.encoding === 'base64') {
      return Buffer.from(response.content, 'base64').toString('utf-8');
    }
    return response.content;
  }

  // ======================== CI / Actions ========================

  async listWorkflowRuns(owner: string, repo: string, options?: { status?: string; branch?: string; limit?: number }): Promise<ActionTasksResponse> {
    const allRuns = await this.collectAllPages(page => this.listWorkflowRunsPage(owner, repo, { ...options, page }));
    return { total_count: allRuns.length, workflow_runs: allRuns };
  }

  async listWorkflowRunsPage(
    owner: string,
    repo: string,
    options: { status?: string; branch?: string; page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<WorkflowRunListItem>> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.branch) params.set('branch', options.branch);
    const endpoint = `/repos/${owner}/${repo}/actions/tasks${params.size > 0 ? `?${params}` : ''}`;
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const sep = endpoint.includes('?') ? '&' : '?';
    const response = await this.request<ActionTasksResponse>(`${endpoint}${sep}page=${page}&limit=${limit}`);
    const totalCount = response.total_count ?? null;
    return this.paginatedResult(response.workflow_runs, page, limit, totalCount);
  }

  async getWorkflowRun(owner: string, repo: string, runId: number): Promise<WorkflowRun> {
    return this.request<WorkflowRun>(`/repos/${owner}/${repo}/actions/runs/${runId}`);
  }

  async getWorkflowJobs(owner: string, repo: string, runId: number): Promise<WorkflowJobsResponse> {
    return this.request<WorkflowJobsResponse>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
  }

  async getWorkflowLogs(owner: string, repo: string, runNumber: number, jobRef: WorkflowJobRef | number = 0): Promise<string> {
    const resolved = await this.resolveJobRef(owner, repo, runNumber, jobRef);
    const url = `${this.resolveWorkflowJobUrl(owner, repo, runNumber, resolved)}/logs`;
    return this.webRequest(url);
  }

  async getJobSteps(
    owner: string, repo: string, runNumber: number, jobRef: WorkflowJobRef | number = 0
  ): Promise<{ summary: string; duration: string; status: string }[]> {
    const resolved = await this.resolveJobRef(owner, repo, runNumber, jobRef);
    const url = this.resolveWorkflowJobUrl(owner, repo, runNumber, resolved);
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

  /**
   * If jobRef contains only a jobId/jobName (no jobHtmlUrl or jobIndex), resolve
   * to a positional index via getRunJobMapping(). Tries id first, then name.
   */
  private async resolveJobRef(
    owner: string, repo: string, runNumber: number, jobRef: WorkflowJobRef | number
  ): Promise<WorkflowJobRef | number> {
    if (typeof jobRef === 'number') return jobRef;
    if (jobRef.jobHtmlUrl || jobRef.jobIndex !== undefined) return jobRef;
    if (jobRef.jobId === undefined && jobRef.jobName === undefined) return jobRef;

    const mapping = await this.getRunJobMapping(owner, repo, runNumber);

    if (jobRef.jobId !== undefined) {
      const index = mapping.byId.get(jobRef.jobId);
      if (index !== undefined) {
        return { ...jobRef, jobIndex: index };
      }
    }

    if (jobRef.jobName !== undefined) {
      const index = mapping.byName.get(jobRef.jobName);
      if (index !== undefined) {
        return { ...jobRef, jobIndex: index };
      }
    }

    this.logger.warn(`Could not resolve job ref to positional index for run ${runNumber}`, jobRef);
    return jobRef;
  }

  /**
   * Scrape the first job page of a run to discover the ordered job list.
   * Returns maps of job-id → positional index and job-name → positional index.
   * Results are cached per run so repeated calls don't re-scrape.
   */
  async getRunJobMapping(owner: string, repo: string, runNumber: number): Promise<{ byId: Map<number, number>; byName: Map<string, number> }> {
    const cacheKey = `${owner}/${repo}/${runNumber}`;
    const cached = this.jobIndexCache.get(cacheKey);
    if (cached) return cached;

    const empty = { byId: new Map<number, number>(), byName: new Map<string, number>() };

    const url = `${this.instanceUrl}/${owner}/${repo}/actions/runs/${runNumber}/jobs/0/attempt/1`;
    const html = await this.webRequest(url);
    const match = html.match(/data-initial-post-response="([^"]*)"/);
    if (!match) {
      this.logger.warn('Could not scrape job mapping for run', runNumber);
      return empty;
    }

    const jsonStr = match[1]
      .replace(/&#34;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    const data = JSON.parse(jsonStr) as {
      state?: { run?: { jobs?: { id?: number; name?: string }[] } }
    };

    const jobs = data.state?.run?.jobs;
    const byId = new Map<number, number>();
    const byName = new Map<string, number>();
    if (Array.isArray(jobs)) {
      for (let i = 0; i < jobs.length; i++) {
        if (jobs[i].id !== undefined) {
          byId.set(jobs[i].id!, i);
        }
        if (jobs[i].name !== undefined) {
          byName.set(jobs[i].name!, i);
        }
      }
    }

    const mapping = { byId, byName };
    this.jobIndexCache.set(cacheKey, mapping);
    return mapping;
  }

  /**
   * Resolve the most reliable job page URL in priority order:
   * 1) server-provided jobHtmlUrl, 2) positional jobIndex, 3) plain number.
   *
   * Note: jobId (database ID) is NOT usable as a URL path segment — Forgejo
   * URLs use positional indices. Use getRunJobMapping() to resolve jobId first.
   */
  private resolveWorkflowJobUrl(owner: string, repo: string, runNumber: number, jobRef: WorkflowJobRef | number): string {
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

    if (jobRef.jobIndex !== undefined) {
      return `${this.instanceUrl}/${owner}/${repo}/actions/runs/${runNumber}/jobs/${jobRef.jobIndex}`;
    }

    throw new Error('Workflow job reference requires jobHtmlUrl or jobIndex (use getRunJobMapping() to resolve jobId to jobIndex)');
  }

  async rerunWorkflow(owner: string, repo: string, runId: number): Promise<void> {
    await this.requestWithBody<void>('POST', `/repos/${owner}/${repo}/actions/runs/${runId}/rerun`);
  }

  async getCommitStatuses(owner: string, repo: string, sha: string): Promise<CommitStatus[]> {
    return this.collectAllPages(page => this.getCommitStatusesPage(owner, repo, sha, { page }));
  }

  async getCommitStatusesPage(
    owner: string,
    repo: string,
    sha: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<CommitStatus>> {
    return this.requestPage<CommitStatus>(
      `/repos/${owner}/${repo}/statuses/${sha}`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  // ======================== Tags ========================

  async listTags(owner: string, repo: string): Promise<Tag[]> {
    return this.collectAllPages(page => this.listTagsPage(owner, repo, { page }));
  }

  async listTagsPage(
    owner: string,
    repo: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<Tag>> {
    return this.requestPage<Tag>(
      `/repos/${owner}/${repo}/tags`,
      options.page ?? 1,
      options.limit ?? 50
    );
  }

  async createTag(owner: string, repo: string, options: CreateTagOptions): Promise<Tag> {
    return this.requestWithBody<Tag>('POST', `/repos/${owner}/${repo}/tags`, options);
  }

  async deleteTag(owner: string, repo: string, tagName: string): Promise<void> {
    await this.requestWithBody<void>('DELETE', `/repos/${owner}/${repo}/tags/${encodeURIComponent(tagName)}`);
  }

  // ======================== Releases ========================

  async listReleases(owner: string, repo: string): Promise<Release[]> {
    return this.collectAllPages(page => this.listReleasesPage(owner, repo, { page }));
  }

  async listReleasesPage(
    owner: string,
    repo: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<PaginatedResult<Release>> {
    return this.requestPage<Release>(
      `/repos/${owner}/${repo}/releases`,
      options.page ?? 1,
      options.limit ?? 50
    );
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

  // ======================== User & Repository ========================

  async createRepository(options: CreateRepositoryOptions): Promise<RepositoryInfo> {
    return this.requestWithBody<RepositoryInfo>('POST', '/user/repos', options);
  }

  async createOrgRepository(org: string, options: CreateRepositoryOptions): Promise<RepositoryInfo> {
    return this.requestWithBody<RepositoryInfo>('POST', `/orgs/${encodeURIComponent(org)}/repos`, options);
  }

  async searchRepositories(query?: string, limit = 50): Promise<RepositoryInfo[]> {
    return this.collectAllPages(page => this.searchRepositoriesPage({ query, limit, page }));
  }

  async searchRepositoriesPage(options: RepositorySearchOptions = {}): Promise<PaginatedResult<RepositoryInfo>> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (options.query) params.set('q', options.query);

    const result = await this.request<{ data: RepositoryInfo[]; total_count?: number; count?: number }>(`/repos/search?${params}`);
    return this.paginatedResult(result.data, page, limit, result.total_count ?? result.count ?? null);
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
