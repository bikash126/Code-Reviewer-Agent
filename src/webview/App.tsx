import React, { useEffect, useReducer } from "react";
import { fileDiffKey, FileDiffOpenStatus } from "../types";
import { initialState, reducer } from "./state";
import { onMessage, postMessage } from "./vscodeApi";
import { PRList } from "./components/PRList";
import { PRDetail } from "./components/PRDetail";
import { ReviewPanel } from "./components/ReviewPanel";
import { SettingsPage } from "./components/settings/SettingsPage";
import { IntegrationsPage } from "./components/integrations/IntegrationsPage";
// import { ChangelogPage } from "./components/changelog/ChangelogPage";
import { BatchReviewPage } from "./components/batch/BatchReviewPage";

export function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const unsubscribe = onMessage(dispatch);
    postMessage({ type: "ready" });
    return unsubscribe;
  }, []);

  const { connectionState } = state;

  if (!connectionState.connected) {
    return (
      <div className="connect-screen">
        <h1>Bitbucket PR Reviewer</h1>
        <p>Connect to Bitbucket Cloud to list pull requests for this repository.</p>
        <button className="primary" onClick={() => postMessage({ type: "connect" })}>
          Connect to Bitbucket
        </button>
      </div>
    );
  }

  const selectedPrId = state.selectedPrId;
  const detail = selectedPrId !== undefined ? state.detailByPr[selectedPrId] : undefined;
  const review = selectedPrId !== undefined ? state.reviewByPr[selectedPrId] : undefined;
  const status = selectedPrId !== undefined ? state.statusByPr[selectedPrId] : undefined;
  const error = selectedPrId !== undefined ? state.errorByPr[selectedPrId] : undefined;
  const postedUrl = selectedPrId !== undefined ? state.lastPostedUrlByPr[selectedPrId] : undefined;

  const fileDiffStatusByPath: Record<string, FileDiffOpenStatus> = {};
  const fileDiffErrorByPath: Record<string, string> = {};
  if (detail && selectedPrId !== undefined) {
    for (const file of detail.changedFiles) {
      const key = fileDiffKey(selectedPrId, file.path);
      const fileStatus = state.fileDiffOpenStatusByKey[key];
      if (fileStatus) {
        fileDiffStatusByPath[file.path] = fileStatus;
      }
      const fileError = state.fileDiffOpenErrorByKey[key];
      if (fileError) {
        fileDiffErrorByPath[file.path] = fileError;
      }
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <span>
          Connected as {connectionState.accountLabel} ({connectionState.authMethod})
        </span>
        <span>
          {connectionState.workspace}/{connectionState.repoSlug}
        </span>
        <button
          onClick={() => {
            dispatch({ type: "resetForRepositorySwitch" });
            postMessage({ type: "switchRepository" });
          }}
        >
          Switch Repository
        </button>
        <button onClick={() => postMessage({ type: "signOut" })}>Sign Out</button>
      </header>
      <nav className="app-tabs">
        <button
          className={state.activeTab === "reviewer" ? "app-tab active" : "app-tab"}
          onClick={() => dispatch({ type: "setActiveTab", tab: "reviewer" })}
        >
          Reviewer
        </button>
        <button
          className={state.activeTab === "settings" ? "app-tab active" : "app-tab"}
          onClick={() => dispatch({ type: "setActiveTab", tab: "settings" })}
        >
          Settings
        </button>
        <button
          className={state.activeTab === "integrations" ? "app-tab active" : "app-tab"}
          onClick={() => dispatch({ type: "setActiveTab", tab: "integrations" })}
        >
          Integrations
        </button>
        {/* <button
          className={state.activeTab === "changelog" ? "app-tab active" : "app-tab"}
          onClick={() => dispatch({ type: "setActiveTab", tab: "changelog" })}
        >
          Changelog
        </button> */}
        <button
          className={state.activeTab === "batch" ? "app-tab active" : "app-tab"}
          onClick={() => dispatch({ type: "setActiveTab", tab: "batch" })}
        >
          Batch Review
        </button>
      </nav>
      {state.activeTab === "reviewer" && (
        <div className="app-body">
          <PRList
            pullRequests={state.pullRequests}
            loading={state.loadingList}
            selectedPrId={selectedPrId}
            onSelect={(prId) => {
              dispatch({ type: "selectPullRequest", prId });
              postMessage({ type: "selectPullRequest", prId });
            }}
            onRefresh={() => postMessage({ type: "refreshPullRequests" })}
          />
          <div className="app-main">
            {detail && selectedPrId !== undefined && (
              <PRDetail
                detail={detail}
                fileDiffStatusByPath={fileDiffStatusByPath}
                fileDiffErrorByPath={fileDiffErrorByPath}
                onOpenFileDiff={(path) => postMessage({ type: "openFileDiff", prId: selectedPrId, path })}
              />
            )}
            {selectedPrId !== undefined && (
              <ReviewPanel
                prId={selectedPrId}
                status={status}
                error={error}
                review={review}
                postedUrl={postedUrl}
                onRunReview={() => postMessage({ type: "runReview", prId: selectedPrId })}
                onRegenerate={() => postMessage({ type: "regenerateReview", prId: selectedPrId })}
                onEditSummary={(summaryMarkdown) =>
                  postMessage({ type: "editSummary", prId: selectedPrId, summaryMarkdown })
                }
                onPostSummary={() => postMessage({ type: "postSummary", prId: selectedPrId })}
              />
            )}
            {selectedPrId === undefined && <p className="empty-state">Select a pull request to get started.</p>}
          </div>
        </div>
      )}
      {state.activeTab === "settings" && (
        <div className="app-body settings-body">
          <SettingsPage settings={state.settings} />
        </div>
      )}
      {state.activeTab === "integrations" && (
        <div className="app-body settings-body">
          <IntegrationsPage integrations={state.integrations} />
        </div>
      )}
      {/* {state.activeTab === "changelog" && (
        <div className="app-body settings-body">
          <ChangelogPage />
        </div>
      )} */}
      {state.activeTab === "batch" && (
        <div className="app-body settings-body">
          <BatchReviewPage
            repos={state.batchRepos}
            selectedRepoKeys={state.batchSelectedRepoKeys}
            items={state.batchItems}
            loadingList={state.batchLoadingList}
            selectedItemKeys={state.batchSelectedItemKeys}
            statusByKey={state.batchStatusByKey}
            resultByKey={state.batchResultByKey}
            errorByKey={state.batchErrorByKey}
            postedUrlByKey={state.batchPostedUrlByKey}
            onToggleRepo={(workspace, repoSlug) => dispatch({ type: "toggleBatchRepoSelection", workspace, repoSlug })}
            onToggleItem={(key) => dispatch({ type: "toggleBatchItemSelection", key })}
          />
        </div>
      )}
    </div>
  );
}
