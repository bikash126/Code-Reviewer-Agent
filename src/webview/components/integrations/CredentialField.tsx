import React, { useState } from "react";

interface Props {
  label: string;
  configured: boolean;
  placeholder: string;
  saveLabel?: string;
  onSave: (value: string) => void;
  helpText?: React.ReactNode;
  extraFields?: React.ReactNode;
}

/**
 * A single secret credential row: status line, masked input, Save button.
 * The current secret value is never sent to the webview, so the input always starts
 * empty; typing a value and saving overwrites the stored credential, and saving an
 * empty value clears it.
 */
export function CredentialField({
  label,
  configured,
  placeholder,
  saveLabel = "Save",
  onSave,
  helpText,
  extraFields,
}: Props): React.JSX.Element {
  const [value, setValue] = useState("");

  return (
    <div className="credential-field">
      <div className="credential-field-header">
        <span className="credential-label">{label}</span>
        <span className={configured ? "credential-status configured" : "credential-status"}>
          {configured ? "Configured" : "Not set"}
        </span>
      </div>
      {extraFields}
      <div className="credential-field-row">
        <input
          type="password"
          className="credential-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => {
            onSave(value);
            setValue("");
          }}
        >
          {saveLabel}
        </button>
      </div>
      {helpText && <div className="credential-help">{helpText}</div>}
    </div>
  );
}
