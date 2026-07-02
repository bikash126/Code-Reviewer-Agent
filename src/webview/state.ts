import {
  batchItemKey,
  BatchPullRequestItem,
  BatchReviewItemStatus,
  BitbucketRemoteInfo,
  ConnectionState,
  ExtensionToWebviewMessage,
  fileDiffKey,
  FileDiffOpenStatus,
  IntegrationsState,
  PullRequestDetail,
  PullRequestSummary,
  ReviewResult,
  ReviewSettings,
  ReviewStatus,
} from "../types";

export type ActiveTab = "reviewer" | "settings" | "integrations" | "changelog" | "batch";

export interface AppState {
  activeTab: ActiveTab;
  connectionState: ConnectionState;
  pullRequests: PullRequestSummary[];
  loadingList: boolean;
  selectedPrId?: number;
  detailByPr: Record<number, PullRequestDetail>;
  reviewByPr: Record<number, ReviewResult>;
  statusByPr: Record<number, ReviewStatus>;
  errorByPr: Record<number, string>;
  lastPostedUrlByPr: Record<number, string>;
  settings?: ReviewSettings;
  integrations?: IntegrationsState;
  fileDiffOpenStatusByKey: Record<string, FileDiffOpenStatus>;
  fileDiffOpenErrorByKey: Record<string, string>;
  batchRepos: BitbucketRemoteInfo[];
  batchSelectedRepoKeys: Record<string, boolean>;
  batchItems: BatchPullRequestItem[];
  batchLoadingList: boolean;
  batchSelectedItemKeys: Record<string, boolean>;
  batchStatusByKey: Record<string, BatchReviewItemStatus>;
  batchResultByKey: Record<string, ReviewResult>;
  batchErrorByKey: Record<string, string>;
  batchPostedUrlByKey: Record<string, string>;
}

export const initialState: AppState = {
  activeTab: "reviewer",
  connectionState: { connected: false },
  pullRequests: [],
  loadingList: false,
  detailByPr: {},
  reviewByPr: {},
  statusByPr: {},
  errorByPr: {},
  lastPostedUrlByPr: {},
  fileDiffOpenStatusByKey: {},
  fileDiffOpenErrorByKey: {},
  batchRepos: [],
  batchSelectedRepoKeys: {},
  batchItems: [],
  batchLoadingList: false,
  batchSelectedItemKeys: {},
  batchStatusByKey: {},
  batchResultByKey: {},
  batchErrorByKey: {},
  batchPostedUrlByKey: {},
};

export type AppAction =
  | ExtensionToWebviewMessage
  | { type: "selectPullRequest"; prId: number }
  | { type: "resetForRepositorySwitch" }
  | { type: "setActiveTab"; tab: ActiveTab }
  | { type: "toggleBatchRepoSelection"; workspace: string; repoSlug: string }
  | { type: "toggleBatchItemSelection"; key: string };

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "connectionState":
      return { ...state, connectionState: action.state };
    case "pullRequestList":
      return { ...state, pullRequests: action.pullRequests, loadingList: action.loading };
    case "pullRequestDetail":
      return { ...state, detailByPr: { ...state.detailByPr, [action.prId]: action.detail } };
    case "reviewStatus": {
      const errorByPr = { ...state.errorByPr };
      if (action.error) {
        errorByPr[action.prId] = action.error;
      } else {
        delete errorByPr[action.prId];
      }
      return { ...state, statusByPr: { ...state.statusByPr, [action.prId]: action.status }, errorByPr };
    }
    case "reviewResult":
      return { ...state, reviewByPr: { ...state.reviewByPr, [action.prId]: action.result } };
    case "postSummaryResult": {
      if (!action.success) {
        return state;
      }
      return {
        ...state,
        lastPostedUrlByPr: { ...state.lastPostedUrlByPr, [action.prId]: action.commentUrl ?? "" },
      };
    }
    case "settings":
      return { ...state, settings: action.settings };
    case "focusSettingsTab":
      return { ...state, activeTab: "settings" };
    case "integrations":
      return { ...state, integrations: action.integrations };
    case "focusIntegrationsTab":
      return { ...state, activeTab: "integrations" };
    case "focusChangelogTab":
      return { ...state, activeTab: "changelog" };
    case "focusBatchReviewTab":
      return { ...state, activeTab: "batch" };
    case "setActiveTab":
      return { ...state, activeTab: action.tab };
    case "selectPullRequest":
      return { ...state, selectedPrId: action.prId };
    case "fileDiffOpenStatus": {
      const key = fileDiffKey(action.prId, action.path);
      const fileDiffOpenErrorByKey = { ...state.fileDiffOpenErrorByKey };
      if (action.error) {
        fileDiffOpenErrorByKey[key] = action.error;
      } else {
        delete fileDiffOpenErrorByKey[key];
      }
      return {
        ...state,
        fileDiffOpenStatusByKey: { ...state.fileDiffOpenStatusByKey, [key]: action.status },
        fileDiffOpenErrorByKey,
      };
    }
    case "batchRepos": {
      const batchSelectedRepoKeys: Record<string, boolean> = {};
      for (const remote of action.repos) {
        batchSelectedRepoKeys[`${remote.workspace}/${remote.repoSlug}`] = true;
      }
      return { ...state, batchRepos: action.repos, batchSelectedRepoKeys };
    }
    case "batchPullRequestList":
      return { ...state, batchItems: action.items, batchLoadingList: action.loading };
    case "batchReviewStatus": {
      const key = batchItemKey(action.target.workspace, action.target.repoSlug, action.target.prId);
      const batchErrorByKey = { ...state.batchErrorByKey };
      if (action.error) {
        batchErrorByKey[key] = action.error;
      } else {
        delete batchErrorByKey[key];
      }
      return { ...state, batchStatusByKey: { ...state.batchStatusByKey, [key]: action.status }, batchErrorByKey };
    }
    case "batchReviewResult": {
      const key = batchItemKey(action.target.workspace, action.target.repoSlug, action.target.prId);
      return { ...state, batchResultByKey: { ...state.batchResultByKey, [key]: action.result } };
    }
    case "batchPostResult": {
      if (!action.success) {
        return state;
      }
      const key = batchItemKey(action.target.workspace, action.target.repoSlug, action.target.prId);
      return { ...state, batchPostedUrlByKey: { ...state.batchPostedUrlByKey, [key]: action.commentUrl ?? "" } };
    }
    case "toggleBatchRepoSelection": {
      const key = `${action.workspace}/${action.repoSlug}`;
      return {
        ...state,
        batchSelectedRepoKeys: { ...state.batchSelectedRepoKeys, [key]: !state.batchSelectedRepoKeys[key] },
      };
    }
    case "toggleBatchItemSelection": {
      return {
        ...state,
        batchSelectedItemKeys: {
          ...state.batchSelectedItemKeys,
          [action.key]: !state.batchSelectedItemKeys[action.key],
        },
      };
    }
    case "resetForRepositorySwitch":
      return {
        ...state,
        pullRequests: [],
        loadingList: true,
        selectedPrId: undefined,
        detailByPr: {},
        reviewByPr: {},
        statusByPr: {},
        errorByPr: {},
        lastPostedUrlByPr: {},
        fileDiffOpenStatusByKey: {},
        fileDiffOpenErrorByKey: {},
      };
    default:
      return state;
  }
}
