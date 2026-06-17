import { User, UserRef, Label, PaginationOptions } from './common.js';

export type IssueState = 'open' | 'closed' | 'all';
export type IssueSort = 'oldest' | 'recentupdate' | 'leastupdate' | 'mostcomment' | 'leastcomment' | 'priority';

export interface IssueListOptions extends PaginationOptions {
  /** Filter by issue state. Defaults to 'all'. */
  state?: IssueState;
  /** Free-text server-side search query, matched by Forgejo against issue title/body. */
  query?: string;
  /** Comma-separated label names. */
  labels?: string;
  /** Comma-separated milestone names or IDs. */
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
  /** Sort order accepted by the Forgejo API. */
  sort?: IssueSort | string;
}

export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: User;
  labels: Label[];
  assignees: UserRef[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  comments: number;
}

export interface IssueListItem {
  number: number;
  title: string;
  state: 'open' | 'closed';
  user: UserRef;
  html_url: string;
  created_at: string;
  comments: number;
  pull_request?: {
    url: string;
  };
}

export interface IssueComment {
  id: number;
  body: string;
  user: User;
  created_at: string;
  html_url: string;
}

export interface TimelineEvent {
  id: number;
  event: string;
  created_at: string;
  user: User;
  label?: Label;
  assignee?: User;
  milestone?: {
    title: string;
  };
}
