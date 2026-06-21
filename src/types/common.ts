/**
 * Shared types used across multiple Forgejo API entities.
 */

export interface User {
  login: string;
  avatar_url: string;
}

export interface UserRef {
  login: string;
}

export interface Label {
  name: string;
  color: string;
}

export interface PaginationOptions {
  /** Page number of results to return (1-based). Defaults to 1. */
  page?: number;
  /** Page size of results. Defaults to 50. */
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  hasMore: boolean;
  totalCount: number | null;
}

export interface RepositorySearchOptions extends PaginationOptions {
  query?: string;
}

export interface CreateRepositoryOptions {
  /** Repository name (required) */
  name: string;
  description?: string;
  private?: boolean;
  /** Initialize with README, .gitignore and license */
  auto_init?: boolean;
  default_branch?: string;
  gitignores?: string;
  license?: string;
  readme?: string;
  /** Mark as template repository */
  template?: boolean;
  /** Signature trust model: default | collaborator | committer | collaboratorcommitter */
  trust_model?: 'default' | 'collaborator' | 'committer' | 'collaboratorcommitter';
}

export interface RepositoryInfo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  owner: User;
}

export interface RepositoryBranch {
  name: string;
  commit?: {
    id?: string;
    sha?: string;
  };
}

export interface RepositoryContentEntry {
  type: string;
  name: string;
  path: string;
  sha?: string;
  size?: number;
  content?: string;
  encoding?: string;
  html_url?: string;
  download_url?: string;
}

export interface RepositoryContentOptions extends PaginationOptions {
  ref?: string;
}
