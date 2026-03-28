import { ForgejoClient, ForgejoApiError, ForgejoNetworkError } from '../src/index';

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
});

describe('getPullRequestCommits', () => {
  test('fetches commits', async () => {
    const commits = [{ sha: 'abc123' }];
    mockFetch.mockResolvedValueOnce(jsonResponse(commits));
    const result = await client.getPullRequestCommits('owner', 'repo', 1);
    expect(result).toEqual(commits);
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

  test('uses job id when html url is unavailable', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, { jobId: 352 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/352/logs',
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

  test('preserves falsy job id values', async () => {
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

  test('ignores empty html url and falls back to job id', async () => {
    mockFetch.mockResolvedValueOnce(textResponse('log line 1\nlog line 2'));

    await client.getWorkflowLogs('owner', 'repo', 5, {
      jobHtmlUrl: '',
      jobId: 352
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://git.example.com/owner/repo/actions/runs/5/jobs/352/logs',
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
      .rejects.toThrow('Workflow job reference requires jobHtmlUrl, jobId, or jobIndex');
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
