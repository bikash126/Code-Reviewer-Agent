// Raw Bitbucket Cloud REST API (2.0) response shapes — intentionally partial,
// only the fields this extension consumes.

export interface BbPaginated<T> {
  values: T[];
  next?: string;
  page?: number;
  pagelen?: number;
  size?: number;
}

export interface BbAccount {
  display_name: string;
  account_id?: string;
  uuid?: string;
  links?: { avatar?: { href: string } };
}

export interface BbBranchRef {
  branch: { name: string };
  commit?: { hash: string };
  repository?: { full_name: string };
}

export interface BbPullRequest {
  id: number;
  title: string;
  description?: string;
  state: "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED";
  author: BbAccount;
  source: BbBranchRef;
  destination: BbBranchRef;
  created_on: string;
  updated_on: string;
  comment_count?: number;
  task_count?: number;
  participants?: { role: "REVIEWER" | "PARTICIPANT"; approved: boolean; user: BbAccount }[];
  links: { html: { href: string } };
}

export interface BbDiffStatEntry {
  status: "added" | "removed" | "modified" | "renamed";
  lines_added: number;
  lines_removed: number;
  old?: { path: string };
  new?: { path: string };
}

export interface BbErrorBody {
  error?: { message?: string; detail?: string };
}
