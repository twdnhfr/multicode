import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";

interface CloseWorktreeDialogProps {
  branchName: string;
  onCloseTab: () => void;
  onDeleteWorktree: () => void;
  onCancel: () => void;
}

export function CloseWorktreeDialog({
  branchName,
  onCloseTab,
  onDeleteWorktree,
  onCancel,
}: CloseWorktreeDialogProps) {
  useKeyboard((key) => {
    if (key.name === "1") {
      onCloseTab();
      return;
    }
    if (key.name === "2") {
      onDeleteWorktree();
      return;
    }
    if (key.name === "escape") {
      onCancel();
      return;
    }
  });

  return (
    <box flexDirection="column" padding={1}>
      <box justifyContent="center" paddingBottom={1}>
        <text attributes={TextAttributes.BOLD}>Close Worktree</text>
      </box>

      <text>What do you want to do with "{branchName}"?</text>
      <box height={1} />

      <box flexDirection="column" gap={1}>
        <text>[1] Close tab only</text>
        <text attributes={TextAttributes.DIM}>    (Worktree will be preserved)</text>
        <box height={1} />
        <text>[2] Delete worktree completely</text>
        <text attributes={TextAttributes.DIM}>    (git worktree remove + files)</text>
      </box>

      <box height={1} />
      <text attributes={TextAttributes.DIM}>[Esc] Cancel</text>
    </box>
  );
}
