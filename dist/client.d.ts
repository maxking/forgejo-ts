import { ForgejoLogger } from './logger.js';
import { PullRequest, PullRequestListItem, PullRequestFile, CommitStatus, PullRequestReview, PullRequestCommit, Issue, IssueListItem, IssueComment, TimelineEvent, ActionTasksResponse, WorkflowRun, WorkflowJobsResponse, WorkflowJobRef, ReviewComment, PullReview, CreatePullReviewOptions, Tag, CreateTagOptions, Release, CreateReleaseOptions } from './types/index.js';
export interface ForgejoClientOptions {
    instanceUrl: string;
    token?: string;
    logger?: ForgejoLogger;
    timeout?: number;
}
export declare class ForgejoClient {
    private readonly instanceUrl;
    private readonly token;
    private readonly logger;
    private readonly timeout;
    constructor(options: ForgejoClientOptions);
    private buildHeaders;
    private request;
    private requestAllPages;
    private requestWithBody;
    /**
     * Make a raw web request (not going through /api/v1).
     * Used for web-scraping endpoints like workflow logs.
     */
    private webRequest;
    testConnection(): Promise<boolean>;
    listPullRequests(owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<PullRequestListItem[]>;
    getPullRequest(owner: string, repo: string, number: number): Promise<PullRequest>;
    createPullRequest(owner: string, repo: string, title: string, head: string, base: string, body?: string): Promise<PullRequest>;
    updatePullRequest(owner: string, repo: string, number: number, updates: {
        title?: string;
        body?: string;
        state?: 'open' | 'closed';
    }): Promise<PullRequest>;
    mergePullRequest(owner: string, repo: string, number: number, method?: 'merge' | 'squash' | 'rebase' | 'rebase-merge' | 'fast-forward-only', deleteBranchAfterMerge?: boolean): Promise<void>;
    closePullRequest(owner: string, repo: string, number: number): Promise<PullRequest>;
    getPullRequestFiles(owner: string, repo: string, number: number): Promise<PullRequestFile[]>;
    getPullRequestRefs(owner: string, repo: string, number: number): Promise<{
        base: string;
        head: string;
    }>;
    getPullRequestReviews(owner: string, repo: string, number: number): Promise<PullRequestReview[]>;
    getPullRequestCommits(owner: string, repo: string, number: number): Promise<PullRequestCommit[]>;
    getReviewComments(owner: string, repo: string, prNumber: number, reviewId: number): Promise<ReviewComment[]>;
    createReview(owner: string, repo: string, number: number, state: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string): Promise<PullRequestReview>;
    createReviewWithComments(owner: string, repo: string, prNumber: number, options: CreatePullReviewOptions): Promise<PullReview>;
    listIssues(owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<IssueListItem[]>;
    getIssue(owner: string, repo: string, number: number): Promise<Issue>;
    createIssue(owner: string, repo: string, title: string, body?: string): Promise<Issue>;
    updateIssue(owner: string, repo: string, number: number, updates: {
        title?: string;
        body?: string;
        state?: 'open' | 'closed';
    }): Promise<Issue>;
    getIssueComments(owner: string, repo: string, number: number): Promise<IssueComment[]>;
    createComment(owner: string, repo: string, number: number, body: string): Promise<IssueComment>;
    getIssueTimeline(owner: string, repo: string, number: number): Promise<TimelineEvent[]>;
    getFileContents(owner: string, repo: string, filepath: string, ref: string): Promise<string>;
    listWorkflowRuns(owner: string, repo: string, options?: {
        status?: string;
        branch?: string;
    }): Promise<ActionTasksResponse>;
    getWorkflowRun(owner: string, repo: string, runId: number): Promise<WorkflowRun>;
    getWorkflowJobs(owner: string, repo: string, runId: number): Promise<WorkflowJobsResponse>;
    getWorkflowLogs(owner: string, repo: string, runNumber: number, jobRef?: WorkflowJobRef | number): Promise<string>;
    getJobSteps(owner: string, repo: string, runNumber: number, jobRef?: WorkflowJobRef | number): Promise<{
        summary: string;
        duration: string;
        status: string;
    }[]>;
    private resolveWorkflowJobUrl;
    rerunWorkflow(owner: string, repo: string, runId: number): Promise<void>;
    getCommitStatuses(owner: string, repo: string, sha: string): Promise<CommitStatus[]>;
    listTags(owner: string, repo: string): Promise<Tag[]>;
    createTag(owner: string, repo: string, options: CreateTagOptions): Promise<Tag>;
    deleteTag(owner: string, repo: string, tagName: string): Promise<void>;
    listReleases(owner: string, repo: string): Promise<Release[]>;
    createRelease(owner: string, repo: string, options: CreateReleaseOptions): Promise<Release>;
    getRelease(owner: string, repo: string, id: number): Promise<Release>;
    getReleaseByTag(owner: string, repo: string, tag: string): Promise<Release>;
    deleteRelease(owner: string, repo: string, id: number): Promise<void>;
    /**
     * Escape hatch for any Forgejo API endpoint not covered by typed methods.
     * @param method HTTP method
     * @param endpoint API path (e.g. "/repos/owner/repo/topics")
     * @param body Optional request body
     */
    rawRequest<T = unknown>(method: string, endpoint: string, body?: unknown): Promise<T>;
}
//# sourceMappingURL=client.d.ts.map