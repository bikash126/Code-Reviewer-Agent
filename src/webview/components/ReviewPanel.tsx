import React, { useEffect, useState } from "react";
import { ReviewResult, ReviewStatus } from "../../types";

interface Props {
  prId: number;
  status: ReviewStatus | undefined;
  error: string | undefined;
  review: ReviewResult | undefined;
  postedUrl: string | undefined;
  onRunReview: () => void;
  onRegenerate: () => void;
  onEditSummary: (markdown: string) => void;
  onPostSummary: () => void;
}

const RISK_LABEL: Record<ReviewResult["riskLevel"], string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

export function ReviewPanel({
  prId,
  status,
  error,
  review,
  postedUrl,
  onRunReview,
  onRegenerate,
  onEditSummary,
  onPostSummary,
}: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(review?.summaryMarkdown ?? "");

  useEffect(() => {
    setDraft(review?.summaryMarkdown ?? "");
    setEditing(false);
  }, [prId, review?.summaryMarkdown]);

  const isBusy = status === "reviewing" || status === "posting" || status === "loading-detail";

  return (
    <div className="review-panel">
      <div className="review-panel-header">
        <h2>AI Review</h2>
        <div className="review-actions">
          {!review && (
            <button onClick={onRunReview} disabled={isBusy}>
              {status === "reviewing" ? "Reviewing..." : "Run AI Review"}
            </button>
          )}
          {review && (
            <>
              <button onClick={onRegenerate} disabled={isBusy}>
                {status === "reviewing" ? "Regenerating..." : "Regenerate"}
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
              <button className="primary" onClick={onPostSummary} disabled={isBusy || editing}>
                {status === "posting" ? "Posting..." : "Post Summary"}
              </button>
            </>
          )}
        </div>
      </div>

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

      {!review && !isBusy && !error && <p className="empty-state">Run an AI review to generate a summary.</p>}

      {review && (
        <div className="review-body">
          <span className={`risk-badge risk-${review.riskLevel}`}>{RISK_LABEL[review.riskLevel]}</span>

          <h3>Key Changes</h3>
          <ul>
            {review.keyChanges.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>

          <h3>Potential Issues</h3>
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

          <h3>Suggested Test Focus</h3>
          <ul>
            {review.testSuggestions.map((suggestion, i) => (
              <li key={i}>{suggestion}</li>
            ))}
          </ul>

          <h3>Bitbucket Summary {editing ? "(editing)" : ""}</h3>
          {editing ? (
            <textarea
              className="summary-editor"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
            />
          ) : (
            <pre className="summary-preview">{draft || review.summaryMarkdown}</pre>
          )}
        </div>
      )}
    </div>
  );
}
