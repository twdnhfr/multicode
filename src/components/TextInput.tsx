import { useState } from "react";
import { TextAttributes } from "@opentui/core";
import { useDialogKeyboard } from "@opentui-ui/dialog/react";

interface TextInputProps {
  dialogId: string;
  resolve: (value: string | undefined) => void;
  label: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
}

export function TextInput({
  dialogId,
  resolve,
  label,
  description,
  initialValue = "",
  placeholder = "",
}: TextInputProps) {
  const [value, setValue] = useState(initialValue);

  useDialogKeyboard((key) => {
    if (key.name === "return") {
      resolve(value);
      return;
    }

    if (key.name === "escape") {
      resolve(undefined);
      return;
    }

    if (key.name === "backspace") {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    // Normale Zeichen
    if (key.sequence && !key.ctrl && !key.meta) {
      setValue((prev) => prev + key.sequence);
    }
  }, dialogId);

  const displayValue = value || placeholder;
  const isPlaceholder = !value && placeholder;

  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text attributes={TextAttributes.BOLD}>{label}</text>
      {description && (
        <text attributes={TextAttributes.DIM}>{description}</text>
      )}
      <box height={1} />
      <box borderStyle="single" paddingLeft={1} paddingRight={1}>
        <text attributes={isPlaceholder ? TextAttributes.DIM : undefined}>
          {displayValue}█
        </text>
      </box>
      <box height={1} />
      <text attributes={TextAttributes.DIM}>
        Enter = Confirm | Esc = Cancel
      </text>
    </box>
  );
}
