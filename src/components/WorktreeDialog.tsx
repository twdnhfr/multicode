import { useState, useEffect } from "react";
import { TextAttributes, StyledText, RGBA } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Worktree } from "../config";
import {
  listWorktrees,
  getNextWorktreePath,
  generateBranchName,
  createWorktree,
  removeWorktree,
  renameBranch,
  getSyncStatus,
  type SyncStatus,
} from "./WorktreeManager";

interface WorktreeDialogProps {
  projectName: string;
  repoPath: string;
  worktreeBasePath: string;
  onSelect: (worktree: Worktree) => void;
  onCancel: () => void;
  onWorktreesChanged: (worktrees: Worktree[]) => void;
}

type DialogMode = "list" | "rename" | "confirmDelete";

export function WorktreeDialog({
  projectName,
  repoPath,
  worktreeBasePath,
  onSelect,
  onCancel,
  onWorktreesChanged,
}: WorktreeDialogProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [syncStatuses, setSyncStatuses] = useState<Map<string, SyncStatus>>(new Map());
  const [mode, setMode] = useState<DialogMode>("list");
  const [renameValue, setRenameValue] = useState("");
  const [renameCursor, setRenameCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load worktrees
  useEffect(() => {
    refreshWorktrees();
  }, [repoPath]);

  function refreshWorktrees() {
    const wts = listWorktrees(repoPath);
    setWorktrees(wts);
    onWorktreesChanged(wts);

    // Sync-Status für alle laden
    const statuses = new Map<string, SyncStatus>();
    for (const wt of wts) {
      statuses.set(wt.id, getSyncStatus(wt.path));
    }
    setSyncStatuses(statuses);
  }

  const selectedWorktree = worktrees[selectedIndex];

  useKeyboard((key) => {
    setError(null);

    if (mode === "list") {
      handleListMode(key);
    } else if (mode === "rename") {
      handleRenameMode(key);
    } else if (mode === "confirmDelete") {
      handleConfirmDeleteMode(key);
    }
  });

  function handleListMode(key: { name: string; sequence?: string; ctrl?: boolean }) {
    if (key.name === "escape") {
      onCancel();
      return;
    }
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.name === "down") {
      setSelectedIndex((i) => Math.min(worktrees.length - 1, i + 1));
      return;
    }
    if (key.name === "return" && selectedWorktree) {
      onSelect(selectedWorktree);
      return;
    }
    if (key.name === "n") {
      // Create new worktree
      try {
        const wtPath = getNextWorktreePath(projectName, worktreeBasePath);
        const branchName = generateBranchName();
        createWorktree(repoPath, wtPath, branchName);
        refreshWorktrees();
        // Zum neuen Worktree springen
        setSelectedIndex(worktrees.length);
      } catch (e) {
        setError(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
      }
      return;
    }
    if (key.name === "d" && selectedWorktree && !selectedWorktree.isMain) {
      setMode("confirmDelete");
      return;
    }
    if (key.name === "r" && selectedWorktree && !selectedWorktree.isMain) {
      setRenameValue(selectedWorktree.branch);
      setRenameCursor(selectedWorktree.branch.length);
      setMode("rename");
      return;
    }
  }

  function handleRenameMode(key: { name: string; sequence?: string; ctrl?: boolean }) {
    if (key.name === "escape") {
      setMode("list");
      return;
    }
    if (key.name === "return") {
      try {
        if (renameValue && renameValue !== selectedWorktree?.branch) {
          renameBranch(selectedWorktree!.path, selectedWorktree!.branch, renameValue);
          refreshWorktrees();
        }
        setMode("list");
      } catch (e) {
        setError(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
      }
      return;
    }
    if (key.name === "left") {
      setRenameCursor((p) => Math.max(0, p - 1));
      return;
    }
    if (key.name === "right") {
      setRenameCursor((p) => Math.min(renameValue.length, p + 1));
      return;
    }
    if (key.name === "backspace") {
      if (renameCursor > 0) {
        setRenameValue((v) => v.slice(0, renameCursor - 1) + v.slice(renameCursor));
        setRenameCursor((p) => p - 1);
      }
      return;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      setRenameValue((v) => v.slice(0, renameCursor) + key.sequence + v.slice(renameCursor));
      setRenameCursor((p) => p + 1);
    }
  }

  function handleConfirmDeleteMode(key: { name: string }) {
    if (key.name === "escape" || key.name === "n") {
      setMode("list");
      return;
    }
    if (key.name === "y" && selectedWorktree) {
      try {
        removeWorktree(repoPath, selectedWorktree.path);
        refreshWorktrees();
        setSelectedIndex((i) => Math.max(0, i - 1));
        setMode("list");
      } catch (e) {
        setError(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
        setMode("list");
      }
    }
  }

  return (
    <box flexDirection="column" padding={1}>
      {/* Header */}
      <box justifyContent="center" paddingBottom={1}>
        <text attributes={TextAttributes.BOLD}>
          Worktrees: {projectName}
        </text>
      </box>

      {/* Error */}
      {error && (
        <box paddingBottom={1}>
          <text content={new StyledText([{ __isChunk: true, text: error, fg: RGBA.fromInts(239, 68, 68) }])} />
        </box>
      )}

      {/* List */}
      {mode === "list" && (
        <>
          <box flexDirection="column" paddingBottom={1}>
            {worktrees.map((wt, index) => {
              const isSelected = index === selectedIndex;
              const sync = syncStatuses.get(wt.id);
              const syncStr = sync ? `↑${sync.ahead} ↓${sync.behind}` : "";
              const mainTag = wt.isMain ? " (Main)" : "";

              return (
                <box key={wt.id} flexDirection="column">
                  <text
                    attributes={isSelected ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
                  >
                    {isSelected ? "▶ " : "  "}{wt.branch}{mainTag}
                    {syncStr && `  ${syncStr}`}
                  </text>
                  <text attributes={TextAttributes.DIM}>
                    {"    "}{wt.path}
                  </text>
                </box>
              );
            })}
          </box>

          {/* Actions */}
          <box paddingTop={1}>
            <text attributes={TextAttributes.DIM}>
              {selectedWorktree?.isMain
                ? "[n] New  [Enter] Open  [Esc] Cancel"
                : "[n] New  [d] Delete  [r] Rename  [Enter] Open  [Esc] Cancel"}
            </text>
          </box>
        </>
      )}

      {/* Rename Mode */}
      {mode === "rename" && (
        <box flexDirection="column">
          <text>New branch name:</text>
          <box borderStyle="single" padding={1}>
            <text
              content={new StyledText([
                { __isChunk: true, text: renameValue.slice(0, renameCursor) },
                { __isChunk: true, text: renameValue[renameCursor] || " ", attributes: TextAttributes.INVERSE },
                { __isChunk: true, text: renameValue.slice(renameCursor + 1) },
              ])}
            />
          </box>
          <text attributes={TextAttributes.DIM}>
            [Enter] Save  [Esc] Cancel
          </text>
        </box>
      )}

      {/* Confirm Delete Mode */}
      {mode === "confirmDelete" && selectedWorktree && (
        <box flexDirection="column">
          <text>Delete worktree "{selectedWorktree.branch}"?</text>
          <text attributes={TextAttributes.DIM}>Branch and files will be removed.</text>
          <box height={1} />
          <text>[y] Yes  [n] No</text>
        </box>
      )}
    </box>
  );
}
