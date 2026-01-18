import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { TextAttributes, StyledText } from "@opentui/core";
import { readFileSync } from "fs";
import { basename } from "path";
import { fileViewerState } from "../fileViewerState";

export const Route = createFileRoute("/file")({
  validateSearch: (search: Record<string, unknown>) => ({
    path: (search.path as string) || "",
  }),
  component: FileScreen,
});

function FileScreen() {
  const { path: filePath } = Route.useSearch();

  const [, forceUpdate] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);

  // Account for TabBar/WorktreeBar + ScriptBar chrome to avoid off-by-one clipping.
  const visibleLines = process.stdout.rows ? process.stdout.rows - 5 : 30;
  // Header (file name + path + spacer), footer (hotkeys), and borders consume 8 rows.
  const contentHeight = Math.max(5, visibleLines - 8);
  // Breite: Terminal - FileTree(30) - Borders(4) - LineNum(5) - Margins(4)
  const maxLineWidth = (process.stdout.columns || 120) - 30 - 4 - 5 - 4;

  // Load file content
  useEffect(() => {
    if (!filePath) return;
    // Reset immediately when path changes
    fileViewerState.reset();
    setLoadedPath(null);

    try {
      const text = readFileSync(filePath, "utf-8");
      const lines = text.split("\n");
      fileViewerState.setFilePath(filePath);
      fileViewerState.setContentInfo(lines.length, contentHeight);
      fileViewerState.setLines(lines);
      // Ensure cursor is at start (force notify to ensure UI updates)
      fileViewerState.setCursor(0, 0, true);
      setLoadedPath(filePath);
      setError(null);
    } catch (err) {
      setError(`Cannot read file: ${err}`);
      setLoadedPath(filePath);
    }
  }, [filePath]);

  // Update contentHeight when it changes
  useEffect(() => {
    if (loadedPath) {
      fileViewerState.setContentInfo(fileViewerState.getLines().length, contentHeight);
    }
  }, [contentHeight, loadedPath]);

  // Subscribe to state changes
  useEffect(() => {
    return fileViewerState.subscribe(() => {
      forceUpdate((n) => n + 1);
    });
  }, []);

  const fileName = filePath ? basename(filePath) : "";
  const scrollOffset = fileViewerState.getScrollOffset();
  const cursorLine = fileViewerState.getCursorLine();
  const cursorCol = fileViewerState.getCursorCol();
  const mode = fileViewerState.getMode();
  const lines = fileViewerState.getLines();
  const isModified = fileViewerState.isModified();
  const searchActive = fileViewerState.isSearchActive();
  const searchQuery = fileViewerState.getSearchQuery();
  const searchMatches = fileViewerState.getSearchMatches();
  const activeMatchIndex = fileViewerState.getActiveMatchIndex();
  const jumpActive = fileViewerState.isJumpActive();
  const jumpQuery = fileViewerState.getJumpQuery();

  if (!filePath) {
    return <text>No file specified</text>;
  }

  // Show loading while file is being loaded
  if (loadedPath !== filePath) {
    return <text>Loading...</text>;
  }

  // Mode indicator
  const modeIndicator = mode === "insert" ? "-- INSERT --" : "-- NORMAL --";
  const modifiedIndicator = isModified ? "[+]" : "";
  const matchByLine = new Map<number, { positions: number[]; activePositions: number[] }>();
  for (let i = 0; i < searchMatches.length; i++) {
    const match = searchMatches[i];
    const existing = matchByLine.get(match.line) || { positions: [], activePositions: [] };
    existing.positions.push(...match.positions);
    if (i === activeMatchIndex) {
      existing.activePositions.push(...match.positions);
    }
    matchByLine.set(match.line, existing);
  }

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      border={true}
      borderStyle="single"
      borderColor={mode === "insert" ? "#f59e0b" : "#22c55e"}
    >
      {/* Header */}
      <box flexDirection="row">
        <text attributes={TextAttributes.BOLD}>{fileName} {modifiedIndicator}</text>
        <box flexGrow={1} />
        <text attributes={TextAttributes.DIM}>
          {cursorLine + 1}:{cursorCol + 1} | {lines.length} lines
        </text>
      </box>
      <text attributes={TextAttributes.DIM}>
        {filePath.length > maxLineWidth ? "…" + filePath.slice(-(maxLineWidth - 1)) : filePath}
      </text>
      <box height={1} />

      {/* Content */}
      {error ? (
        <text>{error}</text>
      ) : (
        <box flexDirection="column" flexGrow={1}>
          {lines.slice(scrollOffset, scrollOffset + contentHeight).map((line, i) => {
            const actualLine = scrollOffset + i;
            const lineNum = String(actualLine + 1).padStart(4, " ");
            const isCursorLine = actualLine === cursorLine;
            const matchInfo = matchByLine.get(actualLine);

            // Truncate line if needed
            let displayLine = line.length > maxLineWidth
              ? line.slice(0, maxLineWidth - 1) + "…"
              : line;

            const matchPositions = (matchInfo?.positions || []).filter((pos) => pos < displayLine.length);
            const activePositions = (matchInfo?.activePositions || []).filter((pos) => pos < displayLine.length);

            // For cursor line, insert a visible cursor marker
            if (isCursorLine) {
              const col = Math.min(cursorCol, displayLine.length);
              const before = displayLine.slice(0, col);
              const cursorChar = displayLine[col] || " ";
              const after = displayLine.slice(col + 1);
              // Use block character for cursor visibility
              displayLine = before + "\u2588" + after; // █ block character
            }

            return (
              <text
                key={actualLine}
                content={buildLineContent(lineNum, displayLine, matchPositions, activePositions)}
              />
            );
          })}
        </box>
      )}

      {/* Mode indicator and Hotkeys */}
      <box flexDirection="row">
        <text attributes={mode === "insert" ? TextAttributes.BOLD : TextAttributes.DIM}>
          {modeIndicator}
        </text>
        <box flexGrow={1} />
        <text attributes={TextAttributes.DIM}>
          {searchActive
            ? `search: ${searchQuery || ""}  esc:exit  up/down:next`
            : jumpActive
              ? `line: ${jumpQuery || ""}  enter:go  esc:exit`
              : mode === "normal"
                ? "h/j/k/l:move i:insert f:search n:line s:save q:quit"
                : "esc:normal"}
        </text>
      </box>
    </box>
  );
}

function buildLineContent(
  lineNum: string,
  displayLine: string,
  matchPositions: number[],
  activePositions: number[]
): StyledText | string {
  if (matchPositions.length === 0) {
    return `${lineNum} ${displayLine}`;
  }

  const activeSet = new Set(activePositions);
  const matchSet = new Set(matchPositions);

  const chunks: { __isChunk: true; text: string; attributes?: number }[] = [
    { __isChunk: true, text: `${lineNum} ` },
  ];

  let currentText = "";
  let currentAttributes: number | undefined;

  const flush = () => {
    if (currentText) {
      chunks.push({ __isChunk: true, text: currentText, attributes: currentAttributes });
      currentText = "";
    }
  };

  for (let i = 0; i < displayLine.length; i++) {
    let nextAttributes: number | undefined;
    if (activeSet.has(i)) {
      nextAttributes = TextAttributes.INVERSE | TextAttributes.BOLD;
    } else if (matchSet.has(i)) {
      nextAttributes = TextAttributes.BOLD;
    }

    if (currentAttributes !== nextAttributes) {
      flush();
      currentAttributes = nextAttributes;
    }

    currentText += displayLine[i];
  }

  flush();
  return new StyledText(chunks);
}
