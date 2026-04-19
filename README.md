# forgejo-ts

Zero-dependency TypeScript client for the [Forgejo](https://forgejo.org/) REST API. Works with Forgejo, Gitea, and Codeberg instances.

## News

### 0.3.1

* Fix `getPullRequestFiles()` pagination so large pull requests return all changed files.

## Features

- Zero external dependencies (uses Node.js built-in `fetch`)
- TypeScript declarations with Node.js 18+ runtime support
- Full TypeScript types for all API responses
- Injectable logger interface
- Typed error classes (`ForgejoApiError`, `ForgejoNetworkError`)
- Covers pull requests, issues, CI/actions, tags, releases, file contents, reviews, and more
- Raw API escape hatch for any endpoint not covered by typed methods

## Installation

```bash
# If published on npm
npm install forgejo-ts

# Or directly from git
npm install git+https://git.araj.me/maxking/forgejo-ts.git
```

## Quick Start

```typescript
import { ForgejoClient, ForgejoApiError } from 'forgejo-ts';

const client = new ForgejoClient({
  instanceUrl: 'https://codeberg.org',
  token: 'your-api-token',        // optional for public repos
  timeout: 30000,                  // optional, default 30s
});

// List open pull requests
const prs = await client.listPullRequests('owner', 'repo', 'open');

// Get issue details
const issue = await client.getIssue('owner', 'repo', 42);

// Create a pull request
const pr = await client.createPullRequest('owner', 'repo', 'My PR', 'feature-branch', 'main', 'Description');

// Error handling
try {
  await client.getPullRequest('owner', 'repo', 999);
} catch (err) {
  if (err instanceof ForgejoApiError) {
    console.error(err.statusCode, err.responseBody);
  }
}
```

## API

### Constructor

```typescript
new ForgejoClient(options: {
  instanceUrl: string;   // e.g. "https://codeberg.org"
  token?: string;        // personal access token
  logger?: ForgejoLogger; // custom logger (default: silent)
  timeout?: number;      // request timeout in ms (default: 30000)
})
```

### Methods

| Category | Method | Description |
|----------|--------|-------------|
| Connection | `testConnection()` | Test connectivity, returns `boolean` |
| **Pull Requests** | | |
| | `listPullRequests(owner, repo, state?)` | List PRs (paginates automatically) |
| | `getPullRequest(owner, repo, number)` | Get PR details |
| | `createPullRequest(owner, repo, title, head, base, body?)` | Create a PR |
| | `updatePullRequest(owner, repo, number, updates)` | Update PR title/body/state |
| | `mergePullRequest(owner, repo, number, method?, deleteBranch?)` | Merge a PR |
| | `closePullRequest(owner, repo, number)` | Close a PR |
| | `getPullRequestFiles(owner, repo, number)` | List changed files (paginates automatically) |
| | `getPullRequestRefs(owner, repo, number)` | Get head/base branch refs |
| | `getPullRequestReviews(owner, repo, number)` | List reviews (paginates automatically) |
| | `getPullRequestCommits(owner, repo, number)` | List commits (paginates automatically) |
| **Reviews** | | |
| | `getReviewComments(owner, repo, prNumber, reviewId)` | Get review comments (paginates automatically) |
| | `createReview(owner, repo, number, state, body)` | Create a review |
| | `createReviewWithComments(owner, repo, prNumber, options)` | Create review with inline comments |
| **Issues** | | |
| | `listIssues(owner, repo, state?)` | List issues (PRs filtered out) |
| | `getIssue(owner, repo, number)` | Get issue details |
| | `createIssue(owner, repo, title, body?)` | Create an issue |
| | `updateIssue(owner, repo, number, updates)` | Update issue title/body/state |
| | `getIssueComments(owner, repo, number)` | List comments (paginates automatically) |
| | `createComment(owner, repo, number, body)` | Add a comment |
| | `getIssueTimeline(owner, repo, number)` | Get timeline events (paginates automatically) |
| **Files** | | |
| | `getFileContents(owner, repo, filepath, ref)` | Get decoded file contents |
| **CI / Actions** | | |
| | `listWorkflowRuns(owner, repo, options?)` | List workflow runs (paginates) |
| | `getWorkflowRun(owner, repo, runId)` | Get run details |
| | `getWorkflowJobs(owner, repo, runId)` | Get jobs for a run |
| | `getWorkflowLogs(owner, repo, runNumber, jobIndex?)` | Fetch job logs |
| | `getJobSteps(owner, repo, runNumber, jobRef?)` | Parse step summaries |
| | `getRunJobMapping(owner, repo, runNumber)` | Map job database IDs to positional indices |
| | `rerunWorkflow(owner, repo, runId)` | Re-run a workflow |
| | `getCommitStatuses(owner, repo, sha)` | Get commit statuses |
| **Tags** | | |
| | `listTags(owner, repo)` | List tags |
| | `createTag(owner, repo, options)` | Create a tag |
| | `deleteTag(owner, repo, tagName)` | Delete a tag |
| **Releases** | | |
| | `listReleases(owner, repo)` | List releases |
| | `createRelease(owner, repo, options)` | Create a release |
| | `getRelease(owner, repo, id)` | Get release by ID |
| | `getReleaseByTag(owner, repo, tag)` | Get release by tag name |
| | `deleteRelease(owner, repo, id)` | Delete a release |
| **Raw** | | |
| | `rawRequest(method, endpoint, body?)` | Escape hatch for any endpoint |

### Custom Logger

Inject your own logger to capture client activity:

```typescript
import { ForgejoClient, ForgejoLogger } from 'forgejo-ts';

const logger: ForgejoLogger = {
  debug: (msg, ...args) => console.debug('[forgejo]', msg, ...args),
  info:  (msg, ...args) => console.info('[forgejo]', msg, ...args),
  warn:  (msg, ...args) => console.warn('[forgejo]', msg, ...args),
  error: (msg, ...args) => console.error('[forgejo]', msg, ...args),
};

const client = new ForgejoClient({
  instanceUrl: 'https://codeberg.org',
  token: 'your-token',
  logger,
});
```

### Error Types

- **`ForgejoApiError`** -- HTTP error from the API. Has `statusCode`, `statusText`, `responseBody`.
- **`ForgejoNetworkError`** -- Network/timeout error. Has `url`, `cause`.
- Both extend `ForgejoError` which extends `Error`.

## How CI/Actions work in Forgejo (and this library)

Forgejo's Actions system has two different data sources with different ID spaces, which this library abstracts over.

### The tasks API (`/actions/tasks`)

The only REST API endpoint that lists jobs for a repository. Returns a flat list of all jobs across all runs:

```json
{
  "workflow_runs": [
    { "id": 43113, "name": "smoke-test-vsix", "run_number": 471, "status": "success", ... },
    { "id": 43112, "name": "test (20)", "run_number": 471, "status": "success", ... }
  ]
}
```

- Each item is a **task** with a task-level `id` (e.g. 43113)
- Items share `run_number` when they belong to the same workflow run
- No `html_url` field — only a `url` pointing to the run page
- **No step/log data** — just job metadata

Use `listWorkflowRuns()` to fetch this data.

### The web pages (scraping)

Forgejo doesn't expose job steps or logs via REST API. The library scrapes them from the web UI at:

```
/{owner}/{repo}/actions/runs/{runNumber}/jobs/{positionalIndex}/attempt/1
```

The HTML contains a `data-initial-post-response` attribute with embedded JSON:

```json
{
  "state": {
    "run": {
      "jobs": [
        { "id": 51313, "name": "test (18)", "status": "success" },
        { "id": 51314, "name": "test (20)", "status": "success" },
        { "id": 51315, "name": "smoke-test-vsix", "status": "success" }
      ]
    },
    "currentJob": {
      "steps": [
        { "summary": "Set up job", "duration": "2s", "status": "success" },
        { "summary": "actions/checkout@v4", "duration": "1s", "status": "success" }
      ]
    }
  }
}
```

Key details:
- `state.run.jobs` lists all jobs in the run in **positional order** (index 0, 1, 2...)
- `state.currentJob.steps` has the steps for the job at the URL's positional index
- The job `id` values here (51313...) are **different from the task IDs** (43113...) returned by the REST API — they are different ID spaces

### The ID mismatch problem

| Source | smoke-test-vsix ID | Positional index |
|--------|-------------------|-----------------|
| Tasks API (`/actions/tasks`) | 43113 | not provided |
| Scraped web page (`state.run.jobs`) | 51315 | 2 |

Forgejo URLs use **positional indices** (`/jobs/0`, `/jobs/1`, `/jobs/2`), not database IDs. So you can't use either ID directly in a URL.

### How this library resolves it

When you call `getJobSteps()` or `getWorkflowLogs()` with a `WorkflowJobRef`:

```typescript
// From the tasks API, you have the task ID and name
await client.getJobSteps('owner', 'repo', 471, {
  jobId: 43113,        // task ID from the API (won't match scraped IDs)
  jobName: 'smoke-test-vsix'  // name matches across both sources
});
```

The library:
1. Sees that `jobRef` has no `jobIndex` or `jobHtmlUrl`
2. Scrapes `/actions/runs/471/jobs/0/attempt/1` to get the `state.run.jobs` array
3. Tries to match `jobId` against the scraped IDs — this may fail (different ID spaces)
4. Falls back to matching `jobName` against the scraped names — this works
5. Resolves `"smoke-test-vsix"` → positional index `2`
6. Fetches `/actions/runs/471/jobs/2` for the actual steps/logs
7. Caches the mapping so subsequent calls for the same run don't re-scrape

### WorkflowJobRef priority

The `WorkflowJobRef` fields are resolved in this order:

| Field | Source | When to use |
|-------|--------|-------------|
| `jobHtmlUrl` | Server-provided URL (e.g. from `/runs/{id}/jobs` API if available) | Most reliable — used as-is |
| `jobIndex` | Known positional index | Direct — no resolution needed |
| `jobName` | Job name from any source | Resolved via scraping (cached) |
| `jobId` | Database ID from any source | Resolved via scraping (cached), may not match |

### Methods

| Method | Description |
|--------|-------------|
| `listWorkflowRuns(owner, repo)` | Fetch all tasks from the REST API |
| `getJobSteps(owner, repo, runNumber, jobRef?)` | Scrape step summaries for a job |
| `getWorkflowLogs(owner, repo, runNumber, jobRef?)` | Scrape raw log output for a job |
| `getRunJobMapping(owner, repo, runNumber)` | Get the id/name → positional index mapping (cached) |
| `rerunWorkflow(owner, repo, runId)` | Re-run a workflow via REST API |

## Changelog

### 0.3.0

- Fix `getJobSteps`/`getWorkflowLogs` returning wrong job's data by auto-resolving database job IDs to positional indices via scraping

### 0.2.1

- Initial public release

## Development

```bash
npm install
npm run build          # compile TypeScript to dist/
npm test               # unit tests
npm run test:coverage  # unit tests with coverage thresholds
npm run test:live      # live tests (requires FORGEJO_TEST_URL and FORGEJO_TEST_TOKEN)
npm run lint           # type check
```

## Open Source Readiness

- Contributing guide: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Security policy: [SECURITY.md](./SECURITY.md)
- License: Apache-2.0

## License

Apache-2.0
