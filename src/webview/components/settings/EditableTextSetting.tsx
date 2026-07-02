import React, { useEffect, useState } from "react";
import { postMessage } from "../../vscodeApi";

interface Props {
  settingKey: string;
  title: string;
  description?: React.ReactNode;
  value: string;
  placeholder?: string;
  rows?: number;
  saveLabel?: string;
  resetLabel?: string;
}

export function EditableTextSetting({
  settingKey,
  title,
  description,
  value,
  placeholder,
  rows = 8,
  saveLabel = "Save",
  resetLabel = "Reset to Default",
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState(value);

  // Re-sync the local draft whenever the persisted value changes underneath us
  // (e.g. after Save or Reset round-trips through the extension host).
  useEffect(() => {
    setDraft(value);
  }, [settingKey, value]);

  const dirty = draft !== value;

  return (
    <div className="settings-field">
      {title && <h4>{title}</h4>}
      {description && <p className="settings-field-description">{description}</p>}
      <textarea
        className="settings-textarea"
        rows={rows}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="settings-field-actions">
        <button
          className="primary"
          disabled={!dirty}
          onClick={() => postMessage({ type: "updateSetting", key: settingKey, value: draft })}
        >
          {saveLabel}
        </button>
        <button onClick={() => postMessage({ type: "resetSetting", key: settingKey })}>{resetLabel}</button>
      </div>
    </div>
  );
}
