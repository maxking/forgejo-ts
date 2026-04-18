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
| | `getPullRequestReviews(owner, repo, number)` | List reviews |
| | `getPullRequestCommits(owner, repo, number)` | List commits |
| **Reviews** | | |
| | `getReviewComments(owner, repo, prNumber, reviewId)` | Get review comments |
| | `createReview(owner, repo, number, state, body)` | Create a review |
| | `createReviewWithComments(owner, repo, prNumber, options)` | Create review with inline comments |
| **Issues** | | |
| | `listIssues(owner, repo, state?)` | List issues (PRs filtered out) |
| | `getIssue(owner, repo, number)` | Get issue details |
| | `createIssue(owner, repo, title, body?)` | Create an issue |
| | `updateIssue(owner, repo, number, updates)` | Update issue title/body/state |
| | `getIssueComments(owner, repo, number)` | List comments |
| | `createComment(owner, repo, number, body)` | Add a comment |
| | `getIssueTimeline(owner, repo, number)` | Get timeline events |
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
