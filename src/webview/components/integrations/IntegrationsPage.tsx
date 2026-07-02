import React, { useState } from "react";
import { IntegrationsState } from "../../../types";
import { postMessage } from "../../vscodeApi";
import { CredentialField } from "./CredentialField";

interface Props {
  integrations: IntegrationsState | undefined;
}

export function IntegrationsPage({ integrations }: Props): React.JSX.Element {
  if (!integrations) {
    return <p className="empty-state">Loading integrations...</p>;
  }

  return (
    <div className="settings-page">
      <section className="settings-section">
        <h3>AI Provider Keys</h3>
        <CredentialField
          label="Claude"
          configured={integrations.claude.configured}
          placeholder="sk-ant-api03-..."
          onSave={(apiKey) => postMessage({ type: "saveAiProviderKey", provider: "claude", apiKey })}
          helpText={
            <>
              Get key:{" "}
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
            </>
          }
        />
        <CredentialField
          label="Gemini"
          configured={integrations.gemini.configured}
          placeholder="AIza..."
          onSave={(apiKey) => postMessage({ type: "saveAiProviderKey", provider: "gemini", apiKey })}
          helpText={
            <>
              Get key:{" "}
              <a href="https://aistudio.google.com" target="_blank" rel="noreferrer">
                aistudio.google.com
              </a>
            </>
          }
        />
        <div className="credential-field">
          <div className="credential-field-header">
            <span className="credential-label">OpenAI</span>
            <span className={integrations.openai.configured ? "credential-status configured" : "credential-status"}>
              {integrations.openai.configured ? "Configured" : "Not set"}
            </span>
          </div>
          <p className="credential-help">
            {integrations.openai.configured
              ? "Managed automatically the first time you run an AI review."
              : "You'll be prompted for an OpenAI API key the first time you run an AI review."}
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h3>Git Provider</h3>
        <div className="credential-field">
          <div className="credential-field-header">
            <span className="credential-label">Bitbucket</span>
            <span
              className={integrations.bitbucket.configured ? "credential-status configured" : "credential-status"}
            >
              {integrations.bitbucket.configured ? "Configured" : "Not set"}
            </span>
          </div>
          <p className="credential-help">
            {integrations.bitbucket.configured
              ? "Connected. Use \"Bitbucket PR Reviewer: Sign Out\" to disconnect."
              : "Run \"Bitbucket PR Reviewer: Connect to Bitbucket\" to connect."}
          </p>
        </div>

        <CredentialField
          label="GitHub"
          configured={integrations.github.configured}
          placeholder="ghp_xxxxxxxxxxxx or github_pat_xxxxx"
          onSave={(token) => postMessage({ type: "saveGithubToken", token })}
          helpText={
            <details>
              <summary>Required scopes & setup instructions</summary>
              <p>
                Create a token at{" "}
                <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
                  github.com/settings/tokens
                </a>{" "}
                with the <code>repo</code> scope (classic token), or a fine-grained token with{" "}
                <code>Pull requests: Read and write</code> and <code>Contents: Read</code> permissions.
              </p>
            </details>
          }
        />

        <GitlabCredentialField
          configured={integrations.gitlab.configured}
          instanceUrl={integrations.gitlab.instanceUrl}
        />
      </section>

      <section className="settings-section">
        <h3>Jira Integration</h3>
        <p className="settings-section-description">
          Connect a Jira Cloud site to link PRs to Jira issues. Uses the same email + API token auth as Bitbucket
          API-token access.
        </p>
        <JiraCredentialField
          configured={integrations.jira.configured}
          siteUrl={integrations.jira.siteUrl}
          email={integrations.jira.email}
        />
      </section>
    </div>
  );
}

function GitlabCredentialField({
  configured,
  instanceUrl,
}: {
  configured: boolean;
  instanceUrl: string;
}): React.JSX.Element {
  const [url, setUrl] = useState(instanceUrl);
  const [token, setToken] = useState("");

  return (
    <div className="credential-field">
      <div className="credential-field-header">
        <span className="credential-label">GitLab</span>
        <span className={configured ? "credential-status configured" : "credential-status"}>
          {configured ? "Configured" : "Not set"}
        </span>
      </div>
      <label className="credential-subfield-label">Instance URL</label>
      <input
        type="text"
        className="credential-input"
        placeholder="https://gitlab.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <div className="credential-field-row">
        <input
          type="password"
          className="credential-input"
          placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => {
            postMessage({ type: "saveGitlabCredentials", token, instanceUrl: url });
            setToken("");
          }}
        >
          Save
        </button>
      </div>
      <div className="credential-help">
        <details>
          <summary>Required scopes & setup instructions</summary>
          <p>
            Create a token under User Settings &gt; Access Tokens on your GitLab instance, with the <code>api</code>{" "}
            scope.
          </p>
        </details>
      </div>
    </div>
  );
}

function JiraCredentialField({
  configured,
  siteUrl,
  email,
}: {
  configured: boolean;
  siteUrl: string;
  email: string;
}): React.JSX.Element {
  const [site, setSite] = useState(siteUrl);
  const [emailValue, setEmailValue] = useState(email);
  const [apiToken, setApiToken] = useState("");

  return (
    <div className="credential-field">
      <div className="credential-field-header">
        <span className="credential-label">Jira</span>
        <span className={configured ? "credential-status configured" : "credential-status"}>
          {configured ? "Configured" : "Not set"}
        </span>
      </div>
      <label className="credential-subfield-label">Site URL</label>
      <input
        type="text"
        className="credential-input"
        placeholder="https://yourteam.atlassian.net"
        value={site}
        onChange={(e) => setSite(e.target.value)}
      />
      <label className="credential-subfield-label">Email</label>
      <input
        type="text"
        className="credential-input"
        placeholder="you@example.com"
        value={emailValue}
        onChange={(e) => setEmailValue(e.target.value)}
      />
      <label className="credential-subfield-label">API Token</label>
      <div className="credential-field-row">
        <input
          type="password"
          className="credential-input"
          placeholder="Atlassian API token"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => {
            postMessage({ type: "saveJiraCredentials", siteUrl: site, email: emailValue, apiToken });
            setApiToken("");
          }}
        >
          Save
        </button>
      </div>
      <div className="credential-help">
        Get key:{" "}
        <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">
          id.atlassian.com/manage-profile/security/api-tokens
        </a>
      </div>
    </div>
  );
}
