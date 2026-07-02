import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "../types";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

export function postMessage(message: WebviewToExtensionMessage): void {
  vscodeApi.postMessage(message);
}

export function onMessage(handler: (message: ExtensionToWebviewMessage) => void): () => void {
  const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => handler(event.data);
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
