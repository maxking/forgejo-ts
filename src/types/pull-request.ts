import { User, UserRef, Label, PaginationOptions } from './common.js';
import type { IssueState } from './issue.js';

export interface PullRequestListOptions extends PaginationOptions {
  /** Filter by pull request state. Defaults to 'all'. */
  state?: IssueState;
  /** Free-text server-side search query, matched by Forgejo against pull request title/body. */
  query?: string;
  /** Sort order accepted by the Forgejo API. */
  sort?: string;
  /** Filter by milestone ID. */
  milestone?: number;
  /** Filter by label IDs. */
  labels?: number[];
  /** Filter by pull request author. */
  poster?: string;
}

export interface PullRequestSearchOptions extends PaginationOptions {
  /** Filter by pull request state. Defaults to 'all'. */
  state?: IssueState;
  /** Free-text server-side search query, matched by Forgejo against pull request title/body. */
  query: string;
  /** Comma-separated label names or IDs for the issues search endpoint. */
  labels?: string;
  /** Comma-separated milestone names or IDs for the issues search endpoint. */
  milestones?: string;
  /** Only show items updated after this RFC 3339 timestamp. */
  since?: string;
  /** Only show items updated before this RFC 3339 timestamp. */
  before?: string;
  /** Only show items created by this user. */
  createdBy?: string;
  /** Only show items assigned to this user. */
  assignedBy?: string;
  /** Only show items mentioning this user. */
  mentionedBy?: string;
  /** Sort order accepted by the Forgejo issues search API. */
  sort?: string;
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
