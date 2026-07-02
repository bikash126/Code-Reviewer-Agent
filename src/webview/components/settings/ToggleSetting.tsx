import React from "react";
import { postMessage } from "../../vscodeApi";

interface Props {
  settingKey: string;
  label: string;
  description?: string;
  checked: boolean;
}

export function ToggleSetting({ settingKey, label, description, checked }: Props): React.JSX.Element {
  return (
    <label className="settings-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => postMessage({ type: "updateSetting", key: settingKey, value: e.target.checked })}
      />
      <span className="settings-toggle-text">
        <span className="settings-toggle-label">{label}</span>
        {description && <span className="settings-toggle-description">{description}</span>}
      </span>
    </label>
  );
}
