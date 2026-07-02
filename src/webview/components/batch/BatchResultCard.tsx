import React, { useEffect, useState } from "react";
import { BatchPullRequestItem, BatchReviewItemStatus, ReviewResult } from "../../../types";

interface Props {
  item: BatchPullRequestItem;
  status: BatchReviewItemStatus | undefined;
  error: string | undefined;
  review: ReviewResult | undefined;
  postedUrl: string | undefined;
  onRegenerate: () => void;
  onEditSummary: (markdown: string) => void;
  onPostSummary: () => void;
}

const RISK_LABEL: Record<ReviewResult["riskLevel"], string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

export function BatchResultCard({
  item,
  status,
  error,
  review,
  postedUrl,
  onRegenerate,
  onEditSummary,
  onPostSummary,
}: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review?.summaryMarkdown ?? "");

  useEffect(() => {
    setDraft(review?.summaryMarkdown ?? "");
    setEditing(false);
  }, [item.workspace, item.repoSlug, item.id, review?.summaryMarkdown]);

  const isBusy = status === "reviewing" || status === "posting" || status === "queued";

  return (
    <div className="review-panel batch-result-card">
      <div className="review-panel-header">
        <div>
          <span className="badge batch-repo-badge">
            {item.workspace}/{item.repoSlug}
          </span>
          <h3>
            #{item.id} {item.title}
          </h3>
        </div>
        <div className="review-actions">
          {status === "queued" && <span className="badge">Queued</span>}
          {review && (
            <>
              <button onClick={onRegenerate} disabled={isBusy}>
                {status === "reviewing" ? "Reviewing..." : "Regenerate"}
              </button>
              {!editing && (
                <button onClick={() => setEditing(true)} disabled={isBusy}>
                  Edit Summary
                </button>
              )}
              {editing && (
                <button
                  onClick={() => {
                    onEditSummary(draft);
                    setEditing(false);
                  }}
                >
                  Save Edit
                </button>
              )}
              <button className="primary" onClick={onPostSummary} disabled={isBusy || editing || status === "posted"}>
                {status === "posting" ? "Posting..." : status === "posted" ? "Posted" : "Post Summary"}
              </button>
            </>
          )}
        </div>
      </div>

      {status === "reviewing" && <p className="empty-state">Reviewing...</p>}
      {error && <div className="error-banner">{error}</div>}
      {postedUrl !== undefined && status === "posted" && (
        <div className="success-banner">
          Summary posted to Bitbucket.{" "}
          {postedUrl && (
            <a href={postedUrl} target="_blank" rel="noreferrer">
              View comment
            </a>
          )}
        </div>
      )}

      {review && (
        <div className="review-body">
          <span className={`risk-badge risk-${review.riskLevel}`}>{RISK_LABEL[review.riskLevel]}</span>

          <h4>Key Changes</h4>
          <ul>
            {review.keyChanges.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>

          <h4>Potential Issues</h4>
          {review.potentialIssues.length === 0 && <p className="empty-state">No issues flagged.</p>}
          <ul>
            {review.potentialIssues.map((issue, i) => (
              <li key={i} className={`issue issue-${issue.severity}`}>
                <span className="issue-severity">{issue.severity}</span>
                {issue.file && <span className="issue-file">{issue.file}</span>}
                <span className="issue-detail">{issue.detail}</span>
              </li>
            ))}
          </ul>

          <h4>Suggested Test Focus</h4>
          <ul>
            {review.testSuggestions.map((suggestion, i) => (
              <li key={i}>{suggestion}</li>
            ))}
          </ul>

          <h4>Bitbucket Summary {editing ? "(editing)" : ""}</h4>
          {editing ? (
            <textarea className="summary-editor" value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} />
          ) : (
            <pre className="summary-preview">{draft || review.summaryMarkdown}</pre>
          )}
        </div>
      )}
    </div>
  );
}
