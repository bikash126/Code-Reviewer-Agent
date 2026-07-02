import { BitbucketRemoteInfo } from "../types";

/**
 * Parses a git remote URL and extracts the Bitbucket Cloud workspace + repo slug.
 * Supports HTTPS (with or without embedded credentials) and SSH remote formats, e.g.:
 *   https://bitbucket.org/my-workspace/my-repo.git
 *   https://user@bitbucket.org/my-workspace/my-repo.git
 *   git@bitbucket.org:my-workspace/my-repo.git
 *   ssh://git@bitbucket.org/my-workspace/my-repo.git
 */
export function parseBitbucketRemote(remoteUrl: string): BitbucketRemoteInfo | undefined {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return undefined;
  }

  // scp-like syntax: git@bitbucket.org:workspace/repo.git
  const scpMatch = trimmed.match(/^[^@/]+@([^:/]+):(.+)$/);
  if (scpMatch && !trimmed.includes("://")) {
    const host = scpMatch[1];
    if (!isBitbucketHost(host)) {
      return undefined;
    }
    return extractWorkspaceRepo(scpMatch[2]);
  }

  try {
    const url = new URL(trimmed);
    if (!isBitbucketHost(url.hostname)) {
      return undefined;
    }
    return extractWorkspaceRepo(url.pathname);
  } catch {
    return undefined;
  }
}

function isBitbucketHost(host: string): boolean {
  return host.toLowerCase() === "bitbucket.org";
}

function extractWorkspaceRepo(pathLike: string): BitbucketRemoteInfo | undefined {
  const cleaned = pathLike.replace(/^\/+/, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) {
    return undefined;
  }
  const [workspace, repoSlug] = parts;
  return { workspace, repoSlug };
}
