import { useState, useEffect, useMemo } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { TextAttributes, StyledText } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { toast } from "@opentui-ui/toast/react";
import { saveConfig, loadConfig, detectClaudePath } from "../config";
import { readdirSync } from "fs";
import { homedir } from "os";
import { join, dirname, basename } from "path";

export const Route = createFileRoute("/setup")({
  component: Setup,
});

type SetupTab = "repo" | "claude" | "worktree";

function Setup() {
  const router = useRouter();
  const config = loadConfig();
  const detectedClaudePath = detectClaudePath();

  // Aktueller Tab
  const [activeTab, setActiveTab] = useState<SetupTab>("repo");

  // Repository-Ordner State
  // Wenn bereits ein repoDirectory konfiguriert ist, starte im Elternverzeichnis
  // damit das konfigurierte Verzeichnis auswählbar ist
  const [repoPath, setRepoPath] = useState(() => {
    if (config?.repoDirectory) {
      return dirname(config.repoDirectory);
    }
    return homedir();
  });
  const [folders, setFolders] = useState<string[]>([]);
  // Finde den Index des konfigurierten Ordners in der Ordnerliste
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [initialSelectionDone, setInitialSelectionDone] = useState(false);

  // Claude Path State
  const [claudePath, setClaudePath] = useState(
    config?.claudePath || detectedClaudePath || "claude"
  );
  const [cursorPos, setCursorPos] = useState(claudePath.length);

  // Worktree Base Path State
  const [worktreePath, setWorktreePath] = useState(
    config?.worktreeBasePath || join(homedir(), "worktrees")
  );
  const [worktreeCursorPos, setWorktreeCursorPos] = useState(worktreePath.length);

  // Der tatsächlich ausgewählte Pfad basierend auf Markierung
  const selectedRepoPath = useMemo(() => {
    if (selectedIndex === -1) {
      return dirname(repoPath);
    } else if (folders[selectedIndex]) {
      return join(repoPath, folders[selectedIndex]);
    }
    return repoPath;
  }, [repoPath, folders, selectedIndex]);

  // Ordner laden wenn sich repoPath ändert
  useEffect(() => {
    try {
      const entries = readdirSync(repoPath, { withFileTypes: true });
      const dirs = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      setFolders(dirs);

      // Bei initialem Laden: Finde und selektiere den konfigurierten Ordner
      if (!initialSelectionDone && config?.repoDirectory) {
        const configuredFolderName = basename(config.repoDirectory);
        const idx = dirs.findIndex((d) => d === configuredFolderName);
        if (idx >= 0) {
          setSelectedIndex(idx);
        } else {
          setSelectedIndex(0);
        }
        setInitialSelectionDone(true);
      } else {
        setSelectedIndex(0);
      }
    } catch {
      setFolders([]);
    }
  }, [repoPath]);

  function saveAndExit() {
    saveConfig({
      repoDirectory: selectedRepoPath,
      claudePath: claudePath || detectedClaudePath || "claude",
      worktreeBasePath: worktreePath,
    });
    toast.success("Settings saved!");
    router.navigate({ to: "/" });
  }

  useKeyboard((key) => {
    // Tab-Wechsel mit 1 und 2
    if (key.name === "1") {
      setActiveTab("repo");
      return;
    }
    if (key.name === "2") {
      setActiveTab("claude");
      return;
    }
    if (key.name === "3") {
      setActiveTab("worktree");
      return;
    }

    // Escape zum Abbrechen
    if (key.name === "escape") {
      router.navigate({ to: "/" });
      return;
    }

    // Ctrl+S zum Speichern
    if (key.ctrl && key.name === "s") {
      saveAndExit();
      return;
    }

    // Tab-spezifische Tastenkürzel
    if (activeTab === "repo") {
      handleRepoKeyboard(key);
    } else if (activeTab === "claude") {
      handleClaudeKeyboard(key);
    } else {
      handleWorktreeKeyboard(key);
    }
  });

  function handleRepoKeyboard(key: { name: string; sequence?: string }) {
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(-1, i - 1));
    }
    if (key.name === "down") {
      setSelectedIndex((i) => Math.min(folders.length - 1, i + 1));
    }
    if (key.name === "left") {
      const parent = dirname(repoPath);
      if (parent !== repoPath) {
        setRepoPath(parent);
      }
    }
    if (key.name === "right" || key.name === "return") {
      if (selectedIndex === -1) {
        const parent = dirname(repoPath);
        if (parent !== repoPath) {
          setRepoPath(parent);
        }
      } else if (folders[selectedIndex]) {
        setRepoPath(join(repoPath, folders[selectedIndex]));
      }
    }
  }

  function handleClaudeKeyboard(key: { name: string; sequence?: string; ctrl?: boolean }) {
    if (key.name === "left") {
      setCursorPos((p) => Math.max(0, p - 1));
      return;
    }
    if (key.name === "right") {
      setCursorPos((p) => Math.min(claudePath.length, p + 1));
      return;
    }
    if (key.name === "backspace") {
      if (cursorPos > 0) {
        setClaudePath((p) => p.slice(0, cursorPos - 1) + p.slice(cursorPos));
        setCursorPos((p) => p - 1);
      }
      return;
    }
    if (key.name === "delete") {
      setClaudePath((p) => p.slice(0, cursorPos) + p.slice(cursorPos + 1));
      return;
    }
    // Home/End
    if (key.ctrl && key.name === "a") {
      setCursorPos(0);
      return;
    }
    if (key.ctrl && key.name === "e") {
      setCursorPos(claudePath.length);
      return;
    }
    // Normale Zeichen
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      setClaudePath((p) => p.slice(0, cursorPos) + key.sequence + p.slice(cursorPos));
      setCursorPos((p) => p + 1);
    }
  }

  function handleWorktreeKeyboard(key: { name: string; sequence?: string; ctrl?: boolean }) {
    if (key.name === "left") {
      setWorktreeCursorPos((p) => Math.max(0, p - 1));
      return;
    }
    if (key.name === "right") {
      setWorktreeCursorPos((p) => Math.min(worktreePath.length, p + 1));
      return;
    }
    if (key.name === "backspace") {
      if (worktreeCursorPos > 0) {
        setWorktreePath((p) => p.slice(0, worktreeCursorPos - 1) + p.slice(worktreeCursorPos));
        setWorktreeCursorPos((p) => p - 1);
      }
      return;
    }
    if (key.name === "delete") {
      setWorktreePath((p) => p.slice(0, worktreeCursorPos) + p.slice(worktreeCursorPos + 1));
      return;
    }
    if (key.ctrl && key.name === "a") {
      setWorktreeCursorPos(0);
      return;
    }
    if (key.ctrl && key.name === "e") {
      setWorktreeCursorPos(worktreePath.length);
      return;
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      setWorktreePath((p) => p.slice(0, worktreeCursorPos) + key.sequence + p.slice(worktreeCursorPos));
      setWorktreeCursorPos((p) => p + 1);
    }
  }

  // Scrolling für Ordnerliste
  const maxVisible = 12;
  const scrollOffset = useMemo(() => {
    if (selectedIndex < 0) return 0;
    if (selectedIndex < maxVisible - 2) return 0;
    return Math.min(selectedIndex - (maxVisible - 3), folders.length - maxVisible);
  }, [selectedIndex, folders.length]);

  const visibleFolders = folders.slice(
    Math.max(0, scrollOffset),
    Math.max(0, scrollOffset) + maxVisible
  );

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      flexDirection="column"
      backgroundColor="#000000"
      borderStyle="single"
      borderColor="#22c55e"
    >
      {/* Header */}
      <box justifyContent="center" padding={1}>
        <ascii-font font="tiny" text="Setup" />
      </box>

      {/* Tab-Leiste */}
      <box flexDirection="row" justifyContent="center" gap={2} paddingBottom={1}>
        <text
          attributes={activeTab === "repo" ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
        >
          {" "}1: Repository{" "}
        </text>
        <text
          attributes={activeTab === "claude" ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
        >
          {" "}2: Claude{" "}
        </text>
        <text
          attributes={activeTab === "worktree" ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
        >
          {" "}3: Worktrees{" "}
        </text>
      </box>

      {/* Content */}
      <box flexGrow={1} justifyContent="center" alignItems="center">
        {activeTab === "repo" ? (
          <box flexDirection="column" width={60}>
            <text attributes={TextAttributes.BOLD}>Choose your repository directory</text>
            <box height={1} />

            <box flexDirection="column">
              {/* Parent directory option */}
              <text
                attributes={selectedIndex === -1 ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
              >
                {selectedIndex === -1 ? "▶ " : "  "}📁 ..
              </text>

              {/* Scroll indicator oben */}
              {scrollOffset > 0 && (
                <text attributes={TextAttributes.DIM}>  ↑ {scrollOffset} more</text>
              )}

              {/* Folder list */}
              {visibleFolders.map((folder, visibleIndex) => {
                const actualIndex = visibleIndex + Math.max(0, scrollOffset);
                return (
                  <text
                    key={folder}
                    attributes={selectedIndex === actualIndex ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
                  >
                    {selectedIndex === actualIndex ? "▶ " : "  "}📁 {folder}
                  </text>
                );
              })}

              {/* Scroll indicator unten */}
              {scrollOffset + maxVisible < folders.length && (
                <text attributes={TextAttributes.DIM}>
                  ↓ {folders.length - scrollOffset - maxVisible} more
                </text>
              )}
            </box>

            <box height={1} />
            <text attributes={TextAttributes.BOLD}>Selected: {selectedRepoPath}</text>
            <box height={1} />
            <text attributes={TextAttributes.DIM}>
              ↑↓: Navigate | ←: Back | →/Enter: Open
            </text>
          </box>
        ) : activeTab === "claude" ? (
          <box flexDirection="column" width={60}>
            <text attributes={TextAttributes.BOLD}>Claude Code Path</text>
            <box height={1} />

            {detectedClaudePath && (
              <text attributes={TextAttributes.DIM}>
                Auto-detected: {detectedClaudePath}
              </text>
            )}

            <box height={1} />

            {/* Text-Input mit Cursor */}
            <box borderStyle="single" padding={1}>
              <text
                content={new StyledText([
                  { __isChunk: true, text: claudePath.slice(0, cursorPos) },
                  { __isChunk: true, text: claudePath[cursorPos] || " ", attributes: TextAttributes.INVERSE },
                  { __isChunk: true, text: claudePath.slice(cursorPos + 1) },
                ])}
              />
            </box>

            <box height={1} />
            <text attributes={TextAttributes.DIM}>
              Enter the path to Claude Code
            </text>
            <text attributes={TextAttributes.DIM}>
              ←→: Cursor | Ctrl+A: Start | Ctrl+E: End
            </text>
          </box>
        ) : (
          <box flexDirection="column" width={60}>
            <text attributes={TextAttributes.BOLD}>Worktree Base Directory</text>
            <box height={1} />

            <text attributes={TextAttributes.DIM}>
              New worktrees will be created here
            </text>

            <box height={1} />

            {/* Text-Input mit Cursor */}
            <box borderStyle="single" padding={1}>
              <text
                content={new StyledText([
                  { __isChunk: true, text: worktreePath.slice(0, worktreeCursorPos) },
                  { __isChunk: true, text: worktreePath[worktreeCursorPos] || " ", attributes: TextAttributes.INVERSE },
                  { __isChunk: true, text: worktreePath.slice(worktreeCursorPos + 1) },
                ])}
              />
            </box>

            <box height={1} />
            <text attributes={TextAttributes.DIM}>
              Example: ~/worktrees or /Users/tobi/gits_worktrees
            </text>
            <text attributes={TextAttributes.DIM}>
              ←→: Cursor | Ctrl+A: Start | Ctrl+E: End
            </text>
          </box>
        )}
      </box>

      {/* Footer */}
      <box justifyContent="center" padding={1}>
        <text attributes={TextAttributes.DIM}>
          1/2/3: Switch tab | Ctrl+S: Save | Esc: Cancel
        </text>
      </box>
    </box>
  );
}
