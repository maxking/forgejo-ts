import { ForgejoClient, ForgejoApiError, ForgejoNetworkError } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

let mockFetch: jest.MockedFunction<typeof fetch>;
let client: ForgejoClient;

beforeEach(() => {
  client = new ForgejoClient({ instanceUrl: 'https://git.example.com', token: 'test-token' });
  mockFetch = global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
  mockFetch.mockClear();
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: { get: (name: string) => name === 'content-type' ? 'application/json' : null },
  } as unknown as Response;
}

function textResponse(text: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    text: async () => text,
    headers: { get: () => 'text/html' },
  } as unknown as Response;
}

/** HTML response that simulates a Forgejo job page with run.jobs for job-id mapping */
function jobMappingHtml(jobs: { id: number; name: string }[]): string {
  const data = { state: { run: { jobs }, currentJob: { steps: [] } } };
  const encoded = JSON.stringify(data).replace(/"/g, '&#34;');
  return `<div data-initial-post-response="${encoded}"></div>`;
}

function emptyResponse(status = 204) {
  return {
    ok: true,
    status,
    statusText: 'No Content',
    json: async () => { throw new Error('no body'); },
    text: async () => '',
    headers: { get: () => '' },
  } as unknown as Response;
}

function mockTwoPageArrayResponse<T>(itemFactory: (index: number) => T) {
  mockFetch.mockImplementation(async (input) => {
    const url = new URL(String(input));
    const page = Number(url.searchParams.get('page') ?? '1');
    const limit = Number(url.searchParams.get('limit') ?? '0');

    if (page === 1) {
      return jsonResponse(Array.from({ length: limit }, (_, i) => itemFactory(i + 1)));
    }

    return jsonResponse([itemFactory(limit + 1)]);
  });
}

/** Assert the helper fetched two pages from the expected endpoint and return the negotiated page size. */
function expectTwoPageArrayRequests(expectedPathname: string): number {
  expect(mockFetch).toHaveBeenCalledTimes(2);

  const firstUrl = new URL(String(mockFetch.mock.calls[0][0]));
  const secondUrl = new URL(String(mockFetch.mock.calls[1][0]));
  const limit = Number(firstUrl.searchParams.get('limit'));

  expect(firstUrl.pathname).toBe(expectedPathname);
  expect(firstUrl.searchParams.get('page')).toBe('1');
  expect(secondUrl.pathname).toBe(expectedPathname);
  expect(secondUrl.searchParams.get('page')).toBe('2');
  expect(secondUrl.searchParams.get('limit')).toBe(firstUrl.searchParams.get('limit'));

  return limit;
}

// ==================== Connection ====================

describe('testConnection', () => {
  test('returns true on success', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: '9.0.0' }));
    expect(await client.testConnection()).toBe(true);
  });

  test('returns false on failure', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));
    expect(await client.testConnection()).toBe(false);
  });
});

// ==================== Pull Requests ====================

describe('listPullRequests', () => {
  test('fetches all pages', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ number: i + 1 }));
    const page2 = [{ number: 51 }];
    mockFetch
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));

    const result = await client.listPullRequests('owner', 'repo');
    expect(result).toHaveLength(51);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test('passes state parameter', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    await client.listPullRequests('owner', 'repo', 'open');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('state=open'),
      expect.any(Object)
    );
  });

  test('accepts options with state', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    await client.listPullRequests('owner', 'repo', { state: 'closed' });

    const url = new URL(String(mockFetch.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v1/repos/owner/repo/pulls');
    expect(url.searchParams.get('state')).toBe('closed');
  });

  test('searches pull requests via issues endpoint and hydrates PR details', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([
        { number: 7, title: 'Search hit', pull_request: { url: 'https://git.example.com/api/v1/repos/owner/repo/pulls/7' } }
      ]))
      .mockResolvedValueOnce(jsonResponse({ number: 7, title: 'Search hit', merged: false, draft: false }));

    const result = await client.listPullRequests('owner', 'repo', { state: 'open', query: 'search term' });

    expect(result).toEqual([{ number: 7, title: 'Search hit', merged: false, draft: false }]);

    const searchUrl = new URL(String(mockFetch.mock.calls[0][0]));
    expect(searchUrl.pathname).toBe('/api/v1/repos/owner/repo/issues');
    expect(searchUrl.searchParams.get('state')).toBe('open');
    expect(searchUrl.searchParams.get('type')).toBe('pulls');
    expect(searchUrl.searchParams.get('q')).toBe('search term');

    const detailUrl = new URL(String(mockFetch.mock.calls[1][0]));
    expect(detailUrl.pathname).toBe('/api/v1/repos/owner/repo/pulls/7');
  });
});

describe('getPullRequest', () => {
  test('fetches PR details', async () => {
    const pr = { number: 42, title: 'Test PR' };
    mockFetch.mockResolvedValueOnce(jsonResponse(pr));
    const result = await client.getPullRequest('owner', 'repo', 42);
    expect(result).toEqual(pr);
  });

  test('throws ForgejoApiError on 404', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(client.getPullRequest('owner', 'repo', 999))
      .rejects.toThrow(ForgejoApiError);
  });
});

describe('createPullRequest', () => {
  test('creates a PR', async () => {
    const pr = { number: 1, title: 'New PR' };
    mockFetch.mockResolvedValueOnce(jsonResponse(pr, 201));
    const result = await client.createPullRequest('owner', 'repo', 'New PR', 'feature', 'main');
    expect(result).toEqual(pr);
  });

  test('throws on 409 conflict', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    await expect(client.createPullRequest('owner', 'repo', 'Dup', 'feature', 'main'))
      .rejects.toThrow(ForgejoApiError);
  });
});

describe('updatePullRequest', () => {
  test('updates PR fields', async () => {
    const pr = { number: 1, title: 'Updated', state: 'closed' };
    mockFetch.mockResolvedValueOnce(jsonResponse(pr));
    const result = await client.updatePullRequest('owner', 'repo', 1, { title: 'Updated', state: 'closed' });
    expect(result).toEqual(pr);
  });
});

describe('mergePullRequest', () => {
  test('merges successfully', async () => {
    mockFetch.mockResolvedValueOnce(emptyResponse());
    await expect(client.mergePullRequest('owner', 'repo', 1)).resolves.toBeUndefined();
  });

  test('throws on 405 not allowed', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 405));
    await expect(client.mergePullRequest('owner', 'repo', 1))
      .rejects.toThrow(ForgejoApiError);
  });

  test('throws on 409 conflict', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 409));
    await expect(client.mergePullRequest('owner', 'repo', 1))
      .rejects.toThrow(ForgejoApiError);
  });
});

describe('closePullRequest', () => {
  test('closes PR', async () => {
    const pr = { number: 1, state: 'closed' };
    mockFetch.mockResolvedValueOnce(jsonResponse(pr));
    const result = await client.closePullRequest('owner', 'repo', 1);
    expect(result.state).toBe('closed');
  });
});

describe('getPullRequestFiles', () => {
  test('returns file list', async () => {
    const files = [{ filename: 'a.ts', status: 'modified' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(files));
    const result = await client.getPullRequestFiles('owner', 'repo', 1);
    expect(result).toEqual(files);
  });

  test('paginates file list for large pull requests', async () => {
    mockTwoPageArrayResponse(index => ({ filename: `file-${index}.ts`, status: 'modified' }));

    const result = await client.getPullRequestFiles('owner', 'repo', 1);
    const limit = expectTwoPageArrayRequests('/api/v1/repos/owner/repo/pulls/1/files');

    expect(result).toEqual(Array.from({ length: limit + 1 }, (_, i) => ({
      filename: `file-${i + 1}.ts`,
      status: 'modified'
    })));
  });

  test('returns empty array', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));
    const result = await client.getPullRequestFiles('owner', 'repo', 1);
    expect(result).toEqual([]);
  });
});

describe('getPullRequestRefs', () => {
  test('returns base and head refs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      base: { ref: 'main' },
      head: { ref: 'feature' },
    }));
    const refs = await client.getPullRequestRefs('owner', 'repo', 1);
    expect(refs).toEqual({ base: 'main', head: 'feature' });
  });
});

describe('getPullRequestReviews', () => {
  test('fetches reviews', async () => {
    const reviews = [{ id: 1, state: 'APPROVED' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(reviews));
    const result = await client.getPullRequestReviews('owner', 'repo', 1);
    expect(result).toEqual(reviews);
  });

  test('paginates reviews for large pull requests', async () => {
    mockTwoPageArrayResponse(index => ({ id: index, state: 'APPROVED' }));

    const result = await client.getPullRequestReviews('owner', 'repo', 1);
    const limit = expectTwoPageArrayRequests('/api/v1/repos/owner/repo/pulls/1/reviews');

    expect(result).toEqual(Array.from({ length: limit + 1 }, (_, i) => ({
      id: i + 1,
      state: 'APPROVED'
    })));
  });
});

describe('getPullRequestCommits', () => {
  test('fetches commits', async () => {
    const commits = [{ sha: 'abc123' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(commits));
    const result = await client.getPullRequestCommits('owner', 'repo', 1);
    expect(result).toEqual(commits);
  });

  test('paginates commit list for large pull requests', async () => {
    mockTwoPageArrayResponse(index => ({ sha: `commit-${index}` }));

    const result = await client.getPullRequestCommits('owner', 'repo', 1);
    const limit = expectTwoPageArrayRequests('/api/v1/repos/owner/repo/pulls/1/commits');

    expect(result).toEqual(Array.from({ length: limit + 1 }, (_, i) => ({
      sha: `commit-${i + 1}`
    })));
  });
});

// ==================== Reviews ====================

describe('getReviewComments', () => {
  test('fetches review comments', async () => {
    const comments = [{ id: 1, body: 'comment' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(comments));
    const result = await client.getReviewComments('owner', 'repo', 1, 10);
    expect(result).toEqual(comments);
  });

  test('paginates review comments', async () => {
    mockTwoPageArrayResponse(index => ({ id: index, body: `comment-${index}` }));

    const result = await client.getReviewComments('owner', 'repo', 1, 10);
    const limit = expectTwoPageArrayRequests('/api/v1/repos/owner/repo/pulls/1/reviews/10/comments');

    expect(result).toEqual(Array.from({ length: limit + 1 }, (_, i) => ({
      id: i + 1,
      body: `comment-${i + 1}`
    })));
  });
});

describe('createReview', () => {
  test('creates a review', async () => {
    const review = { id: 1, state: 'APPROVED' };
    mockFetch.mockResolvedValueOnce(jsonResponse(review, 201));
    const result = await client.createReview('owner', 'repo', 1, 'APPROVE', 'LGTM');
    expect(result).toEqual(review);
  });
});

describe('createReviewWithComments', () => {
  test('creates a review with inline comments', async () => {
    const review = { id: 1, state: 'COMMENT', comments_count: 1 };
    mockFetch.mockResolvedValueOnce(jsonResponse(review, 201));
    const result = await client.createReviewWithComments('owner', 'repo', 1, {
      event: 'COMMENT',
      comments: [{ body: 'nit', path: 'src/a.ts', new_position: 5 }]
    });
    expect(result).toEqual(review);
  });
});

// ==================== Issues ====================

describe('listIssues', () => {
  test('filters out pull requests', async () => {
    const items = [
      { number: 1, title: 'Issue' },
      { number: 2, title: 'PR', pull_request: { url: 'http://...' } },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse(items));
    const result = await client.listIssues('owner', 'repo');
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
  });

  test('accepts options with state and query', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ number: 1, title: 'Crash on login' }]));

    const result = await client.listIssues('owner', 'repo', { state: 'open', query: 'crash login' });

    expect(result).toEqual([{ number: 1, title: 'Crash on login' }]);
    const url = new URL(String(mockFetch.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v1/repos/owner/repo/issues');
    expect(url.searchParams.get('state')).toBe('open');
    expect(url.searchParams.get('type')).toBe('issues');
    expect(url.searchParams.get('q')).toBe('crash login');
  });

  test('uses legacy issue list endpoint when query is blank', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    await client.listIssues('owner', 'repo', { state: 'closed', query: '   ' });

    const url = new URL(String(mockFetch.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v1/repos/owner/repo/issues');
    expect(url.searchParams.get('state')).toBe('closed');
    expect(url.searchParams.get('type')).toBeNull();
    expect(url.searchParams.get('q')).toBeNull();
  });
});

describe('getIssue', () => {
  test('fetches issue details', async () => {
    const issue = { number: 5, title: 'Bug' };
    mockFetch.mockResolvedValueOnce(jsonResponse(issue));
    const result = await client.getIssue('owner', 'repo', 5);
    expect(result).toEqual(issue);
  });
});

describe('createIssue', () => {
  test('creates an issue', async () => {
    const issue = { number: 10, title: 'New issue' };
    mockFetch.mockResolvedValueOnce(jsonResponse(issue, 201));
    const result = await client.createIssue('owner', 'repo', 'New issue', 'body text');
    expect(result).toEqual(issue);
  });
});

describe('updateIssue', () => {
  test('updates issue fields', async () => {
    const issue = { number: 5, state: 'closed' };
    mockFetch.mockResolvedValueOnce(jsonResponse(issue));
    const result = await client.updateIssue('owner', 'repo', 5, { state: 'closed' });
    expect(result).toEqual(issue);
  });
});

describe('getIssueComments', () => {
  test('fetches comments', async () => {
    const comments = [{ id: 1, body: 'hello' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(comments));
    const result = await client.getIssueComments('owner', 'repo', 5);
    expect(result).toEqual(comments);
  });

  test('paginates issue comments', async () => {
    mockTwoPageArrayResponse(index => ({ id: index, body: `comment-${index}` }));

    const result = await client.getIssueComments('owner', 'repo', 5);
    const limit = expectTwoPageArrayRequests('/api/v1/repos/owner/repo/issues/5/comments');

    expect(result).toEqual(Array.from({ length: limit + 1 }, (_, i) => ({
      id: i + 1,
      body: `comment-${i + 1}`
    })));
  });
});

describe('createComment', () => {
  test('creates a comment', async () => {
    const comment = { id: 1, body: 'test' };
    mockFetch.mockResolvedValueOnce(jsonResponse(comment, 201));
    const result = await client.createComment('owner', 'repo', 5, 'test');
    expect(result).toEqual(comment);
  });
});

describe('getIssueTimeline', () => {
  test('fetches timeline', async () => {
    const events = [{ id: 1, event: 'label' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(events));
    const result = await client.getIssueTimeline('owner', 'repo', 5);
    expect(result).toEqual(events);
  });

  test('paginates timeline events', async () => {
    mockTwoPageArrayResponse(index => ({ id: index, event: `event-${index}` }));

    const result = await client.getIssueTimeline('owner', 'repo', 5);
    const limit = expectTwoPageArrayRequests('/api/v1/repos/owner/repo/issues/5/timeline');

    expect(result).toEqual(Array.from({ length: limit + 1 }, (_, i) => ({
      id: i + 1,
      event: `event-${i + 1}`
    })));
  });
});

// ==================== Files ====================

describe('getFileContents', () => {
  test('decodes base64 content', async () => {
    const encoded = Buffer.from('hello world').toString('base64');
    mockFetch.mockResolvedValueOnce(jsonResponse({
      content: encoded,
      encoding: 'base64',
      name: 'file.txt',
      path: 'file.txt',
      sha: 'abc',
      size: 11
    }));
    const result = await client.getFileContents('owner', 'repo', 'file.txt', 'main');
    expect(result).toBe('hello world');
  });

  test('returns raw content when not base64', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      content: 'raw text',
      encoding: 'utf-8',
      name: 'file.txt',
      path: 'file.txt',
      sha: 'abc',
      size: 8
    }));
    const result = await client.getFileContents('owner', 'repo', 'file.txt', 'main');
    expect(result).toBe('raw text');
  });

  test('encodes path segments', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      content: '', encoding: 'utf-8', name: 'f', path: 'f', sha: 'a', size: 0
    }));
    await client.getFileContents('owner', 'repo', 'src/file with spaces.ts', 'main');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('contents/src/file%20with%20spaces.ts'),
      expect.any(Object)
    );
  });
});

// ==================== CI / Actions ====================

describe('listWorkflowRuns', () => {
  test('paginates workflow runs', async () => {
    const page1 = { total_count: 51, workflow_runs: Array.from({ length: 50 }, (_, i) => ({ id: i + 1 })) };
    const page2 = { total_count: 51, workflow_runs: [{ id: 51 }] };
    mockFetch
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));

    const result = await client.listWorkflowRuns('owner', 'repo');
    expect(result.workflow_runs).toHaveLength(51);
  });

  test('passes branch filter', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ total_count: 0, workflow_runs: [] }));
    await client.listWorkflowRuns('owner', 'repo', { branch: 'main' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('branch=main'),
      expect.any(Object)
    );
  });
});

describe('getWorkflowRun', () => {
  test('fetches run details', async () => {
    const run = { id: 1, name: 'CI' };
    mockFetch.mockResolvedValueOnce(jsonResponse(run));
    const result = await client.getWorkflowRun('owner', 'repo', 1);
    expect(result).toEqual(run);
  });
});

describe('getWorkflowJobs', () => {
  test('fetches jobs', async () => {
    const jobs = { total_count: 1, jobs: [{ id: 1, name: 'build' }] };
    mockFetch.mockResolvedValueOnce(jsonResponse(jobs));
    const result = await client.getWorkflowJobs('owner', 'repo', 1);
    expect(result).toEqual(jobs);
  });
});

describe('getWorkflowLogs', () => {
  test('fetches logs from web endpoint', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));
    const result = await client.getWorkflowLogs('owner', 'repo', 5);
    expect(result).toBe('log line 1\nlog line 2');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/0/logs',
      expect.any(Object)
    );
  });

  test('prefers server-provided html url when available', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, {
      jobId: 352,
      jobHtmlUrl: 'https://git.example.com/owner/repo/actions/runs/5/jobs/352'
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/352/logs',
      expect.any(Object)
    );
  });

  test('supports legacy numeric job refs', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, 42);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/42/logs',
      expect.any(Object)
    );
  });

  test('resolves job id to positional index via scraping', async () => {
    // First call: scrape jobs/0 to get the mapping
    mockFetch.mockResolvedValueOnce(textResponse(
      jobMappingHtml([{ id: 100, name: 'build' }, { id: 352, name: 'test' }])
    ));
    // Second call: actual logs request using resolved index
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, { jobId: 352 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/1/logs',
      expect.any(Object)
    );
  });

  test('uses jobIndex fallback when only legacy index is available', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, { jobIndex: 0 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/0/logs',
      expect.any(Object)
    );
  });

  test('resolves falsy job id (0) via mapping', async () => {
    // jobId: 0 is a valid database ID; scrape mapping to resolve it
    mockFetch.mockResolvedValueOnce(textResponse(
      jobMappingHtml([{ id: 0, name: 'first-job' }, { id: 1, name: 'second-job' }])
    ));
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, { jobId: 0 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/0/logs',
      expect.any(Object)
    );
  });

  test('preserves falsy job index values', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, { jobIndex: 0 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/0/logs',
      expect.any(Object)
    );
  });

  test('supports relative html urls from self-hosted instances', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, {
      jobHtmlUrl: '/owner/repo/actions/runs/5/jobs/352'
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/352/logs',
      expect.any(Object)
    );
  });

  test('normalizes trailing slashes in job html url', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, {
      jobHtmlUrl: '/owner/repo/actions/runs/5/jobs/352/'
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/352/logs',
      expect.any(Object)
    );
  });

  test('ignores empty html url and resolves job id via mapping', async () => {
    // Empty jobHtmlUrl is falsy, so resolveJobRef kicks in for jobId
    mockFetch.mockResolvedValueOnce(textResponse(
      jobMappingHtml([{ id: 100, name: 'build' }, { id: 352, name: 'deploy' }])
    ));
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, {
      jobHtmlUrl: '',
      jobId: 352
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/1/logs',
      expect.any(Object)
    );
  });

  test('rejects job html urls from another origin', async () => {
    await expect(client.getWorkflowLogs('owner', 'repo', 5, {
      jobHtmlUrl: 'https://evil.com/owner/repo/actions/runs/5/jobs/352'
    })).rejects.toThrow('Workflow job URL must match Forgejo instance origin: https://git.example.com');
  });
});

describe('getJobSteps', () => {
  test('parses steps from HTML', async () => {
    const stepsData = {
      state: { currentJob: { steps: [
        { summary: 'Checkout', duration: '2s', status: 'success' },
        { summary: 'Build', duration: '10s', status: 'success' }
      ]}}
    };
    const encoded = JSON.stringify(stepsData).replace(/"/g, '&#34;');
    const html = `<div data-initial-post-response="${encoded}"></div>`;
    mockFetch.mockResolvedValueOnce(textResponse(html));

    const result = await client.getJobSteps('owner', 'repo', 5);
    expect(result).toEqual([
      { summary: 'Checkout', duration: '2s', status: 'success' },
      { summary: 'Build', duration: '10s', status: 'success' }
    ]);
  });

  test('returns empty array when no data attribute', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('<html></html>'));
    const result = await client.getJobSteps('owner', 'repo', 5);
    expect(result).toEqual([]);
  });

  test('uses server-provided html url when loading steps', async () => {
    const stepsData = {
      state: { currentJob: { steps: [
        { summary: 'Checkout', duration: '2s', status: 'success' }
      ]}}
    };
    const encoded = JSON.stringify(stepsData).replace(/"/g, '&#34;');
    const html = `<div data-initial-post-response="${encoded}"></div>`;
    mockFetch.mockResolvedValueOnce(textResponse(html));

    const result = await client.getJobSteps('owner', 'repo', 5, {
      jobId: 352,
      jobHtmlUrl: 'https://git.example.com/owner/repo/actions/runs/5/jobs/352'
    });

    expect(result).toEqual([
      { summary: 'Checkout', duration: '2s', status: 'success' }
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/352',
      expect.any(Object)
    );
  });
});

describe('rerunWorkflow', () => {
  test('triggers rerun', async () => {
    mockFetch.mockResolvedValueOnce(emptyResponse());
    await expect(client.rerunWorkflow('owner', 'repo', 1)).resolves.toBeUndefined();
  });
});

describe('getCommitStatuses', () => {
  test('fetches commit statuses', async () => {
    const statuses = [{ id: 1, status: 'success', context: 'ci/test' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(statuses));
    const result = await client.getCommitStatuses('owner', 'repo', 'abc123');
    expect(result).toEqual(statuses);
  });

  test('paginates commit statuses', async () => {
    mockTwoPageArrayResponse(index => ({ id: index, status: 'success', context: `ci/test-${index}` }));

    const result = await client.getCommitStatuses('owner', 'repo', 'abc123');
    const limit = expectTwoPageArrayRequests('/api/v1/repos/owner/repo/statuses/abc123');

    expect(result).toEqual(Array.from({ length: limit + 1 }, (_, i) => ({
      id: i + 1,
      status: 'success',
      context: `ci/test-${i + 1}`
    })));
  });
});

// ==================== Tags ====================

describe('listTags', () => {
  test('fetches tags', async () => {
    const tags = [{ name: 'v1.0.0' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(tags));
    const result = await client.listTags('owner', 'repo');
    expect(result).toEqual(tags);
  });
});

describe('createTag', () => {
  test('creates a tag', async () => {
    const tag = { name: 'v2.0.0' };
    mockFetch.mockResolvedValueOnce(jsonResponse(tag, 201));
    const result = await client.createTag('owner', 'repo', { tag_name: 'v2.0.0', target: 'main' });
    expect(result).toEqual(tag);
  });
});

describe('deleteTag', () => {
  test('deletes a tag', async () => {
    mockFetch.mockResolvedValueOnce(emptyResponse());
    await expect(client.deleteTag('owner', 'repo', 'v1.0.0')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/tags/v1.0.0'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

// ==================== Releases ====================

describe('listReleases', () => {
  test('fetches releases', async () => {
    const releases = [{ id: 1, tag_name: 'v1.0.0' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(releases));
    const result = await client.listReleases('owner', 'repo');
    expect(result).toEqual(releases);
  });
});

describe('createRelease', () => {
  test('creates a release', async () => {
    const release = { id: 1, tag_name: 'v2.0.0' };
    mockFetch.mockResolvedValueOnce(jsonResponse(release, 201));
    const result = await client.createRelease('owner', 'repo', {
      tag_name: 'v2.0.0', name: 'Release 2.0', body: 'Notes'
    });
    expect(result).toEqual(release);
  });
});

describe('getRelease', () => {
  test('fetches release by id', async () => {
    const release = { id: 1, tag_name: 'v1.0.0' };
    mockFetch.mockResolvedValueOnce(jsonResponse(release));
    const result = await client.getRelease('owner', 'repo', 1);
    expect(result).toEqual(release);
  });
});

describe('getReleaseByTag', () => {
  test('fetches release by tag', async () => {
    const release = { id: 1, tag_name: 'v1.0.0' };
    mockFetch.mockResolvedValueOnce(jsonResponse(release));
    const result = await client.getReleaseByTag('owner', 'repo', 'v1.0.0');
    expect(result).toEqual(release);
  });
});

describe('deleteRelease', () => {
  test('deletes a release', async () => {
    mockFetch.mockResolvedValueOnce(emptyResponse());
    await expect(client.deleteRelease('owner', 'repo', 1)).resolves.toBeUndefined();
  });
});

// ==================== User & Repository ====================

describe('createRepository', () => {
  test('creates a user repository', async () => {
    const repo = { id: 1, name: 'new-repo', full_name: 'owner/new-repo' };
    mockFetch.mockResolvedValueOnce(jsonResponse(repo, 201));

    const result = await client.createRepository({ name: 'new-repo', private: true });

    expect(result).toEqual(repo);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/api/v1/user/repos',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'new-repo', private: true })
      })
    );
  });
});

describe('createOrgRepository', () => {
  test('creates an organization repository and encodes org names', async () => {
    const repo = { id: 2, name: 'new-repo', full_name: 'my org/new-repo' };
    mockFetch.mockResolvedValueOnce(jsonResponse(repo, 201));

    const result = await client.createOrgRepository('my org', { name: 'new-repo' });

    expect(result).toEqual(repo);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/api/v1/orgs/my%20org/repos',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('searchRepositories', () => {
  test('fetches all search result pages', async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, name: `repo-${i + 1}` }));
    const page2 = [{ id: 4, name: 'repo-4' }];
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: page1 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: page2 }));

    const result = await client.searchRepositories('forgejo ts', 3);

    expect(result).toEqual([...page1, ...page2]);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(String(mockFetch.mock.calls[0][0]));
    const secondUrl = new URL(String(mockFetch.mock.calls[1][0]));
    expect(firstUrl.pathname).toBe('/api/v1/repos/search');
    expect(firstUrl.searchParams.get('q')).toBe('forgejo ts');
    expect(firstUrl.searchParams.get('page')).toBe('1');
    expect(firstUrl.searchParams.get('limit')).toBe('3');
    expect(secondUrl.searchParams.get('page')).toBe('2');
    expect(secondUrl.searchParams.get('limit')).toBe('3');
  });
});

// ==================== Raw API ====================

describe('rawRequest', () => {
  test('handles GET', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ topics: [] }));
    const result = await client.rawRequest('GET', '/repos/owner/repo/topics');
    expect(result).toEqual({ topics: [] });
  });

  test('handles POST with body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }, 201));
    const result = await client.rawRequest('POST', '/repos/owner/repo/topics', { topics: ['test'] });
    expect(result).toEqual({ ok: true });
  });
});

// ==================== Authentication ====================

describe('authentication', () => {
  test('includes token in headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: '9.0.0' }));
    await client.testConnection();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'token test-token'
        })
      })
    );
  });

  test('omits Authorization when no token', async () => {
    const noAuthClient = new ForgejoClient({ instanceUrl: 'https://git.example.com' });
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: '9.0.0' }));
    await noAuthClient.testConnection();

    const calledHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(calledHeaders.Authorization).toBeUndefined();
  });
});

// ==================== Error handling ====================

describe('error handling', () => {
  test('throws ForgejoApiError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'not found' }, 404));
    try {
      await client.getPullRequest('owner', 'repo', 999);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForgejoApiError);
      const err = e as ForgejoApiError;
      expect(err.statusCode).toBe(404);
    }
  });

  test('throws ForgejoNetworkError on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client.testConnection()).resolves.toBe(false);
  });

  test('strips trailing slash from instanceUrl', async () => {
    const c = new ForgejoClient({ instanceUrl: 'https://git.example.com/' });
    mockFetch.mockResolvedValueOnce(jsonResponse({ version: '9' }));
    await c.testConnection();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/api/v1/version',
      expect.any(Object)
    );
  });

  test('throws ForgejoNetworkError on timeout (GET)', async () => {
    const err = new Error('The operation was aborted');
    err.name = 'TimeoutError';
    mockFetch.mockRejectedValueOnce(err);
    await expect(client.getPullRequest('owner', 'repo', 1))
      .rejects.toThrow(ForgejoNetworkError);
  });

  test('throws ForgejoNetworkError on generic Error (GET)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('something broke'));
    await expect(client.getPullRequest('owner', 'repo', 1))
      .rejects.toThrow(ForgejoNetworkError);
  });

  test('rethrows non-Error values from request', async () => {
    mockFetch.mockRejectedValueOnce('string error');
    await expect(client.getPullRequest('owner', 'repo', 1)).rejects.toBe('string error');
  });

  test('throws ForgejoNetworkError on network error in requestWithBody', async () => {
    mockFetch.mockRejectedValueOnce(new Error('connection refused'));
    await expect(client.createIssue('owner', 'repo', 'title'))
      .rejects.toThrow(ForgejoNetworkError);
  });

  test('rethrows non-Error values from requestWithBody', async () => {
    mockFetch.mockRejectedValueOnce('string error');
    await expect(client.createIssue('owner', 'repo', 'title')).rejects.toBe('string error');
  });

  test('throws ForgejoApiError on webRequest failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 403, statusText: 'Forbidden',
      text: async () => '', headers: { get: () => '' },
    } as unknown as Response);
    await expect(client.getWorkflowLogs('owner', 'repo', 1))
      .rejects.toThrow(ForgejoApiError);
  });

  test('throws ForgejoNetworkError on webRequest network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    await expect(client.getWorkflowLogs('owner', 'repo', 1))
      .rejects.toThrow(ForgejoNetworkError);
  });

  test('rethrows non-Error from webRequest', async () => {
    mockFetch.mockRejectedValueOnce(42);
    await expect(client.getWorkflowLogs('owner', 'repo', 1)).rejects.toBe(42);
  });

  test('handles webRequest without auth token', async () => {
    const noAuthClient = new ForgejoClient({ instanceUrl: 'https://git.example.com' });
    mockFetch.mockResolvedValueOnce(textResponse('logs'));
    await noAuthClient.getWorkflowLogs('owner', 'repo', 1);
    const calledHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(calledHeaders.Authorization).toBeUndefined();
  });
});

describe('job index resolution from scraped run data', () => {
  // Minimal fixture based on real Forgejo response from
  // actions/runs/471/jobs/2/attempt/1 (sensitive data removed).
  // The run has 3 jobs; the tasks API returns database IDs (51313–51315)
  // but Forgejo URLs use positional indices (0, 1, 2).
  const run471Jobs = [
    { id: 51313, name: 'test (18)', status: 'success' },
    { id: 51314, name: 'test (20)', status: 'success' },
    { id: 51315, name: 'smoke-test-vsix', status: 'success' },
  ];

  function makeJobPageHtml(
    jobs: { id: number; name: string; status: string }[],
    steps: { summary: string; duration: string; status: string }[]
  ): string {
    const data = {
      state: {
        run: { jobs, status: 'success', done: true },
        currentJob: { steps }
      }
    };
    const encoded = JSON.stringify(data).replace(/"/g, '&#34;');
    return `<div data-initial-post-response="${encoded}"></div>`;
  }

  const smokeTestSteps = [
    { summary: 'Set up job', duration: '2s', status: 'success' },
    { summary: 'actions/checkout@v4', duration: '1s', status: 'success' },
    { summary: 'Install dependencies', duration: '1m13s', status: 'success' },
    { summary: 'Package and verify .vsix contents', duration: '6s', status: 'success' },
    { summary: 'Complete job', duration: '1s', status: 'success' },
  ];

  test('getJobSteps resolves jobId 51315 to positional index 2', async () => {
    // 1st fetch: scrape jobs/0 page for the mapping
    mockFetch.mockResolvedValueOnce(textResponse(
      makeJobPageHtml(run471Jobs, [])
    ));
    // 2nd fetch: scrape jobs/2 page for the actual steps
    mockFetch.mockResolvedValueOnce(textResponse(
      makeJobPageHtml(run471Jobs, smokeTestSteps)
    ));

    const steps = await client.getJobSteps('owner', 'repo', 471, { jobId: 51315 });

    // Mapping scrape should target jobs/0
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://git.example.com/owner/repo/actions/runs/471/jobs/0/attempt/1'
    );
    // Steps scrape should target jobs/2 (not jobs/51315!)
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://git.example.com/owner/repo/actions/runs/471/jobs/2'
    );
    expect(steps).toEqual(smokeTestSteps);
  });

  test('caches job mapping across calls for the same run', async () => {
    // First call populates cache
    mockFetch.mockResolvedValueOnce(textResponse(
      makeJobPageHtml(run471Jobs, [])
    ));
    mockFetch.mockResolvedValueOnce(textResponse(
      makeJobPageHtml(run471Jobs, smokeTestSteps)
    ));
    await client.getJobSteps('owner', 'repo', 471, { jobId: 51315 });

    // Second call for a different job in the same run — no mapping scrape
    mockFetch.mockResolvedValueOnce(textResponse(
      makeJobPageHtml(run471Jobs, [
        { summary: 'Set up job', duration: '2s', status: 'success' },
        { summary: 'Run unit tests', duration: '13s', status: 'success' },
      ])
    ));
    const steps = await client.getJobSteps('owner', 'repo', 471, { jobId: 51313 });

    // Only 1 new fetch (the actual job page), no mapping re-scrape
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Should resolve jobId 51313 → index 0
    expect(mockFetch.mock.calls[2][0]).toBe(
      'https://git.example.com/owner/repo/actions/runs/471/jobs/0'
    );
    expect(steps).toHaveLength(2);
  });

  test('getWorkflowLogs resolves jobId to positional index', async () => {
    mockFetch.mockResolvedValueOnce(textResponse(
      makeJobPageHtml(run471Jobs, [])
    ));
    mockFetch.mockResolvedValueOnce(textResponse('step 1 log output'));

    await client.getWorkflowLogs('owner', 'repo', 471, { jobId: 51314 });

    // Should resolve jobId 51314 → index 1
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://git.example.com/owner/repo/actions/runs/471/jobs/1/logs'
    );
  });

  // Reproduces the real bug: the /actions/tasks API returns task IDs (43111–43113)
  // while the scraped web page returns job IDs (51313–51315). These are different
  // ID spaces, so id-based lookup fails. Resolution must fall back to job name.
  // Uses real HTML fixtures scraped from git.araj.me/maxking/forgejo-vscode/actions/runs/471.
  test('falls back to name when task IDs differ from scraped job IDs', async () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    const mappingHtml = fs.readFileSync(path.join(fixturesDir, 'run-471-jobs-0.html'), 'utf8');
    const smokeJobHtml = fs.readFileSync(path.join(fixturesDir, 'run-471-jobs-2.html'), 'utf8');

    // 1st fetch: scrape jobs/0/attempt/1 for the mapping
    mockFetch.mockResolvedValueOnce(textResponse(mappingHtml));
    // 2nd fetch: scrape jobs/2 for the actual smoke-test-vsix steps
    mockFetch.mockResolvedValueOnce(textResponse(smokeJobHtml));

    // Pass task ID 43113 (from /actions/tasks) which does NOT match any
    // scraped job ID (51315) — but the name "smoke-test-vsix" matches index 2
    const steps = await client.getJobSteps('owner', 'repo', 471, {
      jobId: 43113,
      jobName: 'smoke-test-vsix'
    });

    // Should resolve via name to jobs/2
    expect(mockFetch.mock.calls[1][0]).toBe(
      'https://git.example.com/owner/repo/actions/runs/471/jobs/2'
    );
    expect(steps).toEqual([
      { summary: 'Set up job', duration: '2s', status: 'success' },
      { summary: 'actions/checkout@v4', duration: '1s', status: 'success' },
      { summary: 'Install dependencies', duration: '1m13s', status: 'success' },
      { summary: 'Package and verify .vsix contents', duration: '6s', status: 'success' },
      { summary: 'Complete job', duration: '1s', status: 'success' },
    ]);
  });
});

describe('getJobSteps edge cases', () => {
  test('returns empty when steps is not an array', async () => {
    const data = { state: { currentJob: { steps: 'not-an-array' } } };
    const encoded = JSON.stringify(data).replace(/"/g, '&#34;');
    const html = `<div data-initial-post-response="${encoded}"></div>`;
    mockFetch.mockResolvedValueOnce(textResponse(html));
    const result = await client.getJobSteps('owner', 'repo', 5);
    expect(result).toEqual([]);
  });

  test('fills defaults for missing step fields', async () => {
    const data = { state: { currentJob: { steps: [{}] } } };
    const encoded = JSON.stringify(data).replace(/"/g, '&#34;');
    const html = `<div data-initial-post-response="${encoded}"></div>`;
    mockFetch.mockResolvedValueOnce(textResponse(html));
    const result = await client.getJobSteps('owner', 'repo', 5);
    expect(result).toEqual([{ summary: 'Unknown step', duration: '', status: 'unknown' }]);
  });

  test('throws when job ref is missing usable identifiers', async () => {
    await expect(client.getWorkflowLogs('owner', 'repo', 5, {}))
      .rejects.toThrow('Workflow job reference requires jobHtmlUrl or jobIndex');
  });
});

describe('ForgejoNetworkError', () => {
  test('message without cause', () => {
    const err = new ForgejoNetworkError('https://example.com');
    expect(err.message).toBe('Network error: Cannot reach https://example.com');
    expect(err.url).toBe('https://example.com');
    expect(err.cause).toBeUndefined();
  });
});

describe('listWorkflowRuns with status filter', () => {
  test('passes status param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ total_count: 0, workflow_runs: [] }));
    await client.listWorkflowRuns('owner', 'repo', { status: 'success' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('status=success'),
      expect.any(Object)
    );
  });
});
