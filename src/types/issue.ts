import { User, UserRef, Label, Milestone, PaginationOptions } from './common.js';

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

/** Options accepted by `POST /repos/{owner}/{repo}/issues`. */
export interface CreateIssueOptions {
  /** Label IDs to attach to the new issue. */
  labels?: number[];
  /** Usernames to assign to the new issue. */
  assignees?: string[];
  /** Milestone ID to attach to the new issue. */
  milestone?: number;
  /** Due date as an RFC 3339 timestamp. */
  due_date?: string;
}

/**
 * Fields accepted by `PATCH /repos/{owner}/{repo}/issues/{index}`.
 *
 * The issues endpoint's `milestone` is a pointer in Forgejo's API, so an
 * explicit `0` unsets the milestone and omitting the field leaves it
 * unchanged. Forgejo stores pull requests as issues internally, so this
 * endpoint (and thus `updateIssue`) also accepts a pull request's index —
 * unlike the `/pulls/{index}` edit endpoint, whose milestone field cannot
 * represent "unset".
 */
export interface UpdateIssueOptions {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  /** Full replacement list of assignee usernames; pass `[]` to clear all assignees. */
  assignees?: string[];
  /** Milestone ID; pass `0` to unset, omit to leave unchanged. */
  milestone?: number;
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
  milestone?: Milestone | null;
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
