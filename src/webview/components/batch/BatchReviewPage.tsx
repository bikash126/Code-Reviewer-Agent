import React, { useEffect } from "react";
import {
  batchItemKey,
  BatchPullRequestItem,
  BatchReviewItemStatus,
  BatchReviewTarget,
  BitbucketRemoteInfo,
  ReviewResult,
} from "../../../types";
import { postMessage } from "../../vscodeApi";
import { BatchResultCard } from "./BatchResultCard";

interface Props {
  repos: BitbucketRemoteInfo[];
  selectedRepoKeys: Record<string, boolean>;
  items: BatchPullRequestItem[];
  loadingList: boolean;
  selectedItemKeys: Record<string, boolean>;
  statusByKey: Record<string, BatchReviewItemStatus>;
  resultByKey: Record<string, ReviewResult>;
  errorByKey: Record<string, string>;
  postedUrlByKey: Record<string, string>;
  onToggleRepo: (workspace: string, repoSlug: string) => void;
  onToggleItem: (key: string) => void;
}

export function BatchReviewPage({
  repos,
  selectedRepoKeys,
  items,
  loadingList,
  selectedItemKeys,
  statusByKey,
  resultByKey,
  errorByKey,
  postedUrlByKey,
  onToggleRepo,
  onToggleItem,
}: Props): React.JSX.Element {
  useEffect(() => {
    postMessage({ type: "getBatchRepos" });
  }, []);

  const selectedRepos = repos.filter((r) => selectedRepoKeys[`${r.workspace}/${r.repoSlug}`]);
  const selectedItems = items.filter((item) => selectedItemKeys[batchItemKey(item.workspace, item.repoSlug, item.id)]);
  const reviewedItems = items.filter((item) => statusByKey[batchItemKey(item.workspace, item.repoSlug, item.id)]);

  const runBatchReview = () => {
    const targets: BatchReviewTarget[] = selectedItems.map((item) => ({
      workspace: item.workspace,
      repoSlug: item.repoSlug,
      prId: item.id,
    }));
    postMessage({ type: "runBatchReview", items: targets });
  };

  return (
    <div className="settings-page batch-review-page">
      <section className="settings-section">
        <h3>Batch Review</h3>
        <p className="settings-section-description">
          Review pull requests across every Bitbucket repo in this workspace at once. AI summaries are generated in
          bulk, but each still requires its own confirmation before posting to Bitbucket.
        </p>

        <h4 className="settings-subheading">Repositories</h4>
        {repos.length === 0 && <p className="empty-state">No Bitbucket repositories found in this workspace.</p>}
        <div className="batch-repo-list">
          {repos.map((remote) => {
            const key = `${remote.workspace}/${remote.repoSlug}`;
            return (
              <label key={key} className="settings-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(selectedRepoKeys[key])}
                  onChange={() => onToggleRepo(remote.workspace, remote.repoSlug)}
                />
                <span className="settings-toggle-text">
                  <span className="settings-toggle-label">{key}</span>
                </span>
              </label>
            );
          })}
        </div>
        {repos.length > 0 && (
          <button
            className="primary"
            onClick={() => postMessage({ type: "loadBatchPullRequests", repos: selectedRepos })}
            disabled={selectedRepos.length === 0 || loadingList}
          >
            {loadingList ? "Loading pull requests..." : "Load Pull Requests"}
          </button>
        )}
      </section>

      {items.length > 0 && (
        <section className="settings-section">
          <h4 className="settings-subheading">
            Select Pull Requests <span className="settings-count">{selectedItems.length} selected</span>
          </h4>
          <ul className="batch-pr-list">
            {items.map((item) => {
              const key = batchItemKey(item.workspace, item.repoSlug, item.id);
              return (
                <li key={key} className="batch-pr-row">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedItemKeys[key])}
                      onChange={() => onToggleItem(key)}
                    />
                    <span className="settings-toggle-text">
                      <span className="settings-toggle-label">
                        <span className="badge batch-repo-badge">
                          {item.workspace}/{item.repoSlug}
                        </span>{" "}
                        #{item.id} {item.title}
                      </span>
                      <span className="settings-toggle-description">
                        {item.author.displayName} &middot; {item.sourceBranch} &rarr; {item.destinationBranch}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button className="primary" onClick={runBatchReview} disabled={selectedItems.length === 0}>
            Run Batch Review ({selectedItems.length})
          </button>
        </section>
      )}

      {reviewedItems.length > 0 && (
        <section className="settings-section">
          <h4 className="settings-subheading">Results</h4>
          {reviewedItems.map((item) => {
            const key = batchItemKey(item.workspace, item.repoSlug, item.id);
            const target: BatchReviewTarget = { workspace: item.workspace, repoSlug: item.repoSlug, prId: item.id };
            return (
              <BatchResultCard
                key={key}
                item={item}
                status={statusByKey[key]}
                error={errorByKey[key]}
                review={resultByKey[key]}
                postedUrl={postedUrlByKey[key]}
                onRegenerate={() => postMessage({ type: "runBatchReview", items: [target] })}
                onEditSummary={(summaryMarkdown) => postMessage({ type: "editBatchSummary", target, summaryMarkdown })}
                onPostSummary={() => postMessage({ type: "postBatchSummary", target })}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
