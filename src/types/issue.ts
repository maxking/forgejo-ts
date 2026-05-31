import { User, UserRef, Label } from './common.js';

export type IssueState = 'open' | 'closed' | 'all';

export interface IssueListOptions {
  /** Filter by issue state. Defaults to 'all'. */
  state?: IssueState;
  /** Free-text server-side search query, matched by Forgejo against issue title/body. */
  query?: string;
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
