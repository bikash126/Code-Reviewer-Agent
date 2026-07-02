import React from "react";
import { PullRequestSummary } from "../../types";

interface Props {
  pullRequests: PullRequestSummary[];
  loading: boolean;
  selectedPrId?: number;
  onSelect: (prId: number) => void;
  onRefresh: () => void;
}

export function PRList({ pullRequests, loading, selectedPrId, onSelect, onRefresh }: Props): React.JSX.Element {
  return (
    <div className="pr-list">
      <div className="pr-list-header">
        <h2>Open Pull Requests</h2>
        <button onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {pullRequests.length === 0 && !loading && <p className="empty-state">No open pull requests found.</p>}
      <ul>
        {pullRequests.map((pr) => (
          <li
            key={pr.id}
            className={pr.id === selectedPrId ? "pr-item selected" : "pr-item"}
            onClick={() => onSelect(pr.id)}
          >
            <div className="pr-item-title">
              #{pr.id} {pr.title}
            </div>
            <div className="pr-item-meta">
              {pr.author.displayName} &middot; {pr.sourceBranch} &rarr; {pr.destinationBranch}
            </div>
            <div className="pr-item-badges">
              <span className="badge">{pr.commentCount} comments</span>
              {pr.taskCount > 0 && <span className="badge">{pr.taskCount} tasks</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
