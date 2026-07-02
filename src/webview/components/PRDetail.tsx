import React from "react";
import { FileDiffOpenStatus, PullRequestDetail } from "../../types";
import { FileTree } from "./FileTree";

interface Props {
  detail: PullRequestDetail;
  fileDiffStatusByPath: Record<string, FileDiffOpenStatus>;
  fileDiffErrorByPath: Record<string, string>;
  onOpenFileDiff: (path: string) => void;
}

export function PRDetail({
  detail,
  fileDiffStatusByPath,
  fileDiffErrorByPath,
  onOpenFileDiff,
}: Props): React.JSX.Element {
  const approvedCount = detail.reviewers.filter((r) => r.approved).length;

  return (
    <div className="pr-detail">
      <h2>
        #{detail.id} {detail.title}
      </h2>
      <div className="pr-detail-meta">
        <span>
          {detail.author.displayName} &middot; {detail.state}
        </span>
        <span>
          {detail.sourceBranch} &rarr; {detail.destinationBranch}
        </span>
        <span>
          {detail.commentCount} comments &middot; {detail.taskCount} tasks
        </span>
        <span>
          {approvedCount}/{detail.reviewers.length} reviewers approved
        </span>
        <a href={detail.webUrl} target="_blank" rel="noreferrer">
          Open in Bitbucket
        </a>
      </div>
      {detail.description && <p className="pr-description">{detail.description}</p>}
      <details className="pr-changed-files" open>
        <summary>{detail.changedFiles.length} changed files</summary>
        <FileTree
          files={detail.changedFiles}
          fileDiffStatusByPath={fileDiffStatusByPath}
          fileDiffErrorByPath={fileDiffErrorByPath}
          onOpenFileDiff={onOpenFileDiff}
        />
      </details>
    </div>
  );
}
