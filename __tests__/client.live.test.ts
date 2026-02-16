/**
 * Live integration tests against a real Forgejo instance.
 *
 * These tests run against a Forgejo container (e.g. http://forgejo:3000).
 * They are skipped unless FORGEJO_TEST_URL and FORGEJO_TEST_TOKEN env vars are set.
 *
 * Setup is done by scripts/setup-forgejo-test.sh which creates:
 *   - testuser with API token
 *   - test-repo with main branch (auto_init)
 *   - feature-branch with test.txt file
 *   - PR #1: "Test PR" (feature-branch -> main)
 *   - Issue #2: "Test Issue"
 *   - Tag v1.0.0
 *   - Release v1.0.0
 */

import { ForgejoClient, ForgejoApiError } from '../src/index';

const FORGEJO_URL = process.env.FORGEJO_TEST_URL || '';
const FORGEJO_TOKEN = process.env.FORGEJO_TEST_TOKEN || '';
const OWNER = 'testuser';
const REPO = 'test-repo';

const describeIfLive = FORGEJO_URL && FORGEJO_TOKEN ? describe : describe.skip;

describeIfLive('ForgejoClient - live integration tests', () => {
  let client: ForgejoClient;

  beforeAll(() => {
    client = new ForgejoClient({ instanceUrl: FORGEJO_URL, token: FORGEJO_TOKEN });
  });

  // ======================== Connection ========================

  describe('testConnection', () => {
    it('should successfully connect to the live instance', async () => {
      const result = await client.testConnection();
      expect(result).toBe(true);
    });

    it('should return boolean with bad token', async () => {
      const badClient = new ForgejoClient({ instanceUrl: FORGEJO_URL, token: 'invalid-token-xxx' });
      const result = await badClient.testConnection();
      expect(typeof result).toBe('boolean');
    });

    it('should fail with unreachable host', async () => {
      const badClient = new ForgejoClient({ instanceUrl: 'http://localhost:59999', token: 'token' });
      const result = await badClient.testConnection();
      expect(result).toBe(false);
    });
  });

  // ======================== Pull Requests ========================

  describe('listPullRequests', () => {
    it('should list open pull requests', async () => {
      const prs = await client.listPullRequests(OWNER, REPO, 'open');
      expect(Array.isArray(prs)).toBe(true);
      expect(prs.length).toBeGreaterThanOrEqual(1);
      expect(prs[0]).toHaveProperty('number');
      expect(prs[0]).toHaveProperty('title');
      expect(prs[0].title).toBe('Test PR');
    });

    it('should throw for non-existent repo', async () => {
      await expect(client.listPullRequests(OWNER, 'nonexistent-repo', 'open'))
        .rejects.toThrow(ForgejoApiError);
    });
  });

  describe('getPullRequest', () => {
    it('should fetch PR #1 details', async () => {
      const pr = await client.getPullRequest(OWNER, REPO, 1);
      expect(pr.number).toBe(1);
      expect(pr.title).toBe('Test PR');
      expect(typeof pr.body).toBe('string');
      expect(pr.state).toBe('open');
      expect(pr).toHaveProperty('head');
      expect(pr).toHaveProperty('base');
    });

    it('should throw 404 for non-existent PR', async () => {
      await expect(client.getPullRequest(OWNER, REPO, 999))
        .rejects.toThrow(ForgejoApiError);
    });
  });

  describe('getPullRequestFiles', () => {
    it('should list files changed in PR #1', async () => {
      const files = await client.getPullRequestFiles(OWNER, REPO, 1);
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThanOrEqual(1);
      expect(files[0]).toHaveProperty('filename');
      expect(files[0].filename).toBe('test.txt');
    });
  });

  describe('getPullRequestRefs', () => {
    it('should return head and base refs for PR #1', async () => {
      const refs = await client.getPullRequestRefs(OWNER, REPO, 1);
      expect(refs.head).toBe('feature-branch');
      expect(refs.base).toBe('main');
    });
  });

  describe('getPullRequestReviews', () => {
    it('should return reviews array (may be empty)', async () => {
      const reviews = await client.getPullRequestReviews(OWNER, REPO, 1);
      expect(Array.isArray(reviews)).toBe(true);
    });
  });

  describe('getPullRequestCommits', () => {
    it('should return commits for PR #1', async () => {
      const commits = await client.getPullRequestCommits(OWNER, REPO, 1);
      expect(Array.isArray(commits)).toBe(true);
      expect(commits.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('updatePullRequest', () => {
    it('should update PR body', async () => {
      const updated = await client.updatePullRequest(OWNER, REPO, 1, { body: 'Updated PR body' });
      expect(updated.body).toBe('Updated PR body');

      // Verify by fetching again
      const pr = await client.getPullRequest(OWNER, REPO, 1);
      expect(pr.body).toBe('Updated PR body');
    });
  });

  // ======================== Issues ========================

  describe('listIssues', () => {
    it('should list issues (excluding PRs)', async () => {
      const issues = await client.listIssues(OWNER, REPO, 'open');
      expect(Array.isArray(issues)).toBe(true);
      const issueTitles = issues.map(i => i.title);
      expect(issueTitles).toContain('Test Issue');
      // Ensure PRs are filtered out (Forgejo returns pull_request: null for issues)
      const prsInList = issues.filter(i => i.pull_request);
      expect(prsInList).toHaveLength(0);
    });
  });

  describe('getIssue', () => {
    it('should fetch issue #2 details', async () => {
      const issue = await client.getIssue(OWNER, REPO, 2);
      expect(issue.number).toBe(2);
      expect(issue.title).toBe('Test Issue');
      expect(typeof issue.body).toBe('string');
    });
  });

  describe('createIssue', () => {
    it('should create a new issue', async () => {
      const issue = await client.createIssue(OWNER, REPO, 'Created by test', 'Test body');
      expect(issue).toHaveProperty('number');
      expect(issue.title).toBe('Created by test');
      expect(issue.body).toBe('Test body');
    });
  });

  describe('updateIssue', () => {
    it('should update issue body', async () => {
      const updated = await client.updateIssue(OWNER, REPO, 2, { body: 'Updated issue body' });
      expect(updated.body).toBe('Updated issue body');

      const issue = await client.getIssue(OWNER, REPO, 2);
      expect(issue.body).toBe('Updated issue body');
    });
  });

  describe('createComment', () => {
    it('should add a comment to an issue', async () => {
      const comment = await client.createComment(OWNER, REPO, 2, 'Test comment from live test');
      expect(comment).toHaveProperty('id');
      expect(comment.body).toBe('Test comment from live test');
    });
  });

  describe('getIssueComments', () => {
    it('should list comments on issue #2', async () => {
      const comments = await client.getIssueComments(OWNER, REPO, 2);
      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeGreaterThanOrEqual(1);
      expect(comments.some(c => c.body === 'Test comment from live test')).toBe(true);
    });
  });

  describe('getIssueTimeline', () => {
    it('should return timeline events', async () => {
      const events = await client.getIssueTimeline(OWNER, REPO, 2);
      expect(Array.isArray(events)).toBe(true);
    });
  });

  // ======================== Files ========================

  describe('getFileContents', () => {
    it('should fetch README.md from main branch', async () => {
      const contents = await client.getFileContents(OWNER, REPO, 'README.md', 'main');
      expect(typeof contents).toBe('string');
      expect(contents.length).toBeGreaterThan(0);
    });

    it('should fetch test.txt from feature branch', async () => {
      const contents = await client.getFileContents(OWNER, REPO, 'test.txt', 'feature-branch');
      expect(contents).toBe('Hello World');
    });

    it('should throw for non-existent file', async () => {
      await expect(client.getFileContents(OWNER, REPO, 'nonexistent.txt', 'main'))
        .rejects.toThrow(ForgejoApiError);
    });
  });

  // ======================== Tags ========================

  describe('listTags', () => {
    it('should list tags including v1.0.0', async () => {
      const tags = await client.listTags(OWNER, REPO);
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThanOrEqual(1);
      expect(tags.some(t => t.name === 'v1.0.0')).toBe(true);
    });
  });

  describe('createTag / deleteTag', () => {
    it('should create and delete a tag', async () => {
      const tag = await client.createTag(OWNER, REPO, {
        tag_name: 'v99.0.0-test',
        target: 'main',
        message: 'Test tag'
      });
      expect(tag.name).toBe('v99.0.0-test');

      // Verify it exists
      const tags = await client.listTags(OWNER, REPO);
      expect(tags.some(t => t.name === 'v99.0.0-test')).toBe(true);

      // Delete it
      await client.deleteTag(OWNER, REPO, 'v99.0.0-test');

      // Verify it's gone
      const tagsAfter = await client.listTags(OWNER, REPO);
      expect(tagsAfter.some(t => t.name === 'v99.0.0-test')).toBe(false);
    });
  });

  // ======================== Releases ========================

  describe('listReleases', () => {
    it('should list releases including v1.0.0', async () => {
      const releases = await client.listReleases(OWNER, REPO);
      expect(Array.isArray(releases)).toBe(true);
      expect(releases.length).toBeGreaterThanOrEqual(1);
      expect(releases.some(r => r.tag_name === 'v1.0.0')).toBe(true);
    });
  });

  describe('getReleaseByTag', () => {
    it('should fetch release by tag name', async () => {
      const release = await client.getReleaseByTag(OWNER, REPO, 'v1.0.0');
      expect(release.tag_name).toBe('v1.0.0');
      expect(release.name).toBe('Release v1.0.0');
      expect(release.body).toBe('Test release notes');
    });
  });

  describe('getRelease', () => {
    it('should fetch release by id', async () => {
      const releases = await client.listReleases(OWNER, REPO);
      const v1 = releases.find(r => r.tag_name === 'v1.0.0')!;
      const release = await client.getRelease(OWNER, REPO, v1.id);
      expect(release.tag_name).toBe('v1.0.0');
    });
  });

  describe('createRelease / deleteRelease', () => {
    it('should create and delete a release', async () => {
      // Create a tag first
      await client.createTag(OWNER, REPO, {
        tag_name: 'v99.1.0-test',
        target: 'main',
        message: 'Test release tag'
      });

      const release = await client.createRelease(OWNER, REPO, {
        tag_name: 'v99.1.0-test',
        name: 'Test Release',
        body: 'Test release notes'
      });
      expect(release).toHaveProperty('id');
      expect(release.tag_name).toBe('v99.1.0-test');

      // Delete it
      await client.deleteRelease(OWNER, REPO, release.id);

      // Verify it's gone
      await expect(client.getReleaseByTag(OWNER, REPO, 'v99.1.0-test'))
        .rejects.toThrow(ForgejoApiError);

      // Clean up the tag
      await client.deleteTag(OWNER, REPO, 'v99.1.0-test');
    });
  });

  // ======================== Raw API ========================

  describe('rawRequest', () => {
    it('should make a GET request', async () => {
      const result = await client.rawRequest('GET', `/repos/${OWNER}/${REPO}`);
      expect(result).toHaveProperty('full_name', `${OWNER}/${REPO}`);
    });

    it('should make a POST request', async () => {
      const result = await client.rawRequest<{ id: number }>('POST', `/repos/${OWNER}/${REPO}/issues`, {
        title: 'Created via rawRequest',
        body: 'Raw API test'
      });
      expect(result).toHaveProperty('id');
    });
  });

  // ======================== Error handling ========================

  describe('error handling', () => {
    it('should throw ForgejoApiError with statusCode on 404', async () => {
      try {
        await client.getPullRequest(OWNER, 'no-such-repo', 1);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ForgejoApiError);
        expect((e as ForgejoApiError).statusCode).toBe(404);
      }
    });
  });
});
