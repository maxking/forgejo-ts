import { User, UserRef, Label } from './common.js';
import type { IssueState } from './issue.js';

export interface PullRequestListOptions {
  /** Filter by pull request state. Defaults to 'all'. */
  state?: IssueState;
  /** Free-text server-side search query, matched by Forgejo against pull request title/body. */
  query?: string;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: User;
  created_at: string;
  updated_at: string;
  html_url: string;
  head: {
    ref: string;
    sha: string;
    repo: {
      full_name: string;
    };
  };
  base: {
    ref: string;
  };
  mergeable: boolean;
  merged: boolean;
  merge_commit_sha: string | null;
  draft: boolean;
  comments: number;
  labels: Label[];
}

export interface PullRequestListItem {
  number: number;
  title: string;
  state: 'open' | 'closed';
  user: UserRef;
  html_url: string;
  created_at: string;
  merged: boolean;
  draft: boolean;
  comments: number;
}

export interface PullRequestFile {
  filename: string;
  status: 'added' | 'modified' | 'changed' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  patch?: string;
  previous_filename?: string;
}

export interface FileContentsResponse {
  content: string;
  encoding: string;
  name: string;
  path: string;
  sha: string;
  size: number;
}

export interface CommitStatus {
  id: number;
  status: 'pending' | 'success' | 'error' | 'failure' | 'warning';
  context: string;
  description: string;
  target_url: string;
  created_at: string;
  updated_at: string;
}

export interface PullRequestReview {
  id: number;
  state: string;
  body: string;
  user: User;
  submitted_at: string;
  html_url: string;
}

export interface PullRequestCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: User;
  html_url: string;
}
