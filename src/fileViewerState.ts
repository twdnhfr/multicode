// Simple shared state for file viewer
type Listener = () => void;
type Mode = "normal" | "insert";
type SearchMatch = { line: number; start: number; length: number; positions: number[] };

let scrollOffset = 0;
let contentLength = 0;
let contentHeight = 30;
let cursorLine = 0;
let cursorCol = 0;
let mode: Mode = "normal";
let lines: string[] = [];
let modified = false;
let filePath: string | null = null;
let searchActive = false;
let searchQuery = "";
let searchMatches: SearchMatch[] = [];
let activeMatchIndex = 0;
let jumpActive = false;
let jumpQuery = "";
const listeners: Set<Listener> = new Set();

export const fileViewerState = {
  getScrollOffset: () => scrollOffset,
  getContentLength: () => contentLength,
  getContentHeight: () => contentHeight,
  getCursorLine: () => cursorLine,
  getCursorCol: () => cursorCol,
  getMode: () => mode,
  getLines: () => lines,
  isModified: () => modified,
  getFilePath: () => filePath,
  isSearchActive: () => searchActive,
  getSearchQuery: () => searchQuery,
  getSearchMatches: () => searchMatches,
  getActiveMatchIndex: () => activeMatchIndex,
  isJumpActive: () => jumpActive,
  getJumpQuery: () => jumpQuery,
  setFilePath: (path: string) => {
    filePath = path;
  },

  setScrollOffset: (offset: number) => {
    const newOffset = Math.max(0, Math.min(contentLength - contentHeight, offset));
    if (newOffset !== scrollOffset) {
      scrollOffset = newOffset;
      listeners.forEach((l) => l());
    }
  },

  setContentInfo: (length: number, height: number) => {
    const changed = contentLength !== length || contentHeight !== height;
    contentLength = length;
    contentHeight = height;
    if (changed) {
      listeners.forEach((l) => l());
    }
  },

  setLines: (newLines: string[]) => {
    lines = newLines;
    contentLength = lines.length;
    if (searchActive && searchQuery) {
      updateSearchMatches();
    }
    listeners.forEach((l) => l());
  },

  // Cursor movement
  setCursor: (line: number, col: number, forceNotify: boolean = false) => {
    const newLine = Math.max(0, Math.min(contentLength - 1, line));
    const lineLength = lines[newLine]?.length || 0;
    const newCol = Math.max(0, Math.min(lineLength, col));

    const changed = newLine !== cursorLine || newCol !== cursorCol;
    cursorLine = newLine;
    cursorCol = newCol;

    // Auto-scroll to keep cursor visible
    if (cursorLine < scrollOffset) {
      scrollOffset = cursorLine;
    } else if (cursorLine >= scrollOffset + contentHeight) {
      scrollOffset = cursorLine - contentHeight + 1;
    }

    if (changed || forceNotify) {
      listeners.forEach((l) => l());
    }
  },

  cursorUp: () => {
    fileViewerState.setCursor(cursorLine - 1, cursorCol);
  },

  cursorDown: () => {
    fileViewerState.setCursor(cursorLine + 1, cursorCol);
  },

  cursorLeft: () => {
    if (cursorCol > 0) {
      fileViewerState.setCursor(cursorLine, cursorCol - 1);
    } else if (cursorLine > 0) {
      // Wrap to end of previous line
      const prevLineLength = lines[cursorLine - 1]?.length || 0;
      fileViewerState.setCursor(cursorLine - 1, prevLineLength);
    }
  },

  cursorRight: () => {
    const lineLength = lines[cursorLine]?.length || 0;
    if (cursorCol < lineLength) {
      fileViewerState.setCursor(cursorLine, cursorCol + 1);
    } else if (cursorLine < contentLength - 1) {
      // Wrap to start of next line
      fileViewerState.setCursor(cursorLine + 1, 0);
    }
  },

  cursorLineStart: () => {
    fileViewerState.setCursor(cursorLine, 0);
  },

  cursorLineEnd: () => {
    const lineLength = lines[cursorLine]?.length || 0;
    fileViewerState.setCursor(cursorLine, lineLength);
  },

  // Mode switching
  setMode: (newMode: Mode) => {
    if (newMode !== mode) {
      mode = newMode;
      listeners.forEach((l) => l());
    }
  },

  enterInsertMode: () => {
    fileViewerState.setMode("insert");
  },

  enterNormalMode: () => {
    fileViewerState.setMode("normal");
    // In normal mode, cursor can't be past end of line
    const lineLength = lines[cursorLine]?.length || 0;
    if (cursorCol > 0 && cursorCol >= lineLength) {
      cursorCol = Math.max(0, lineLength - 1);
    }
  },

  // Text editing
  insertChar: (char: string) => {
    if (mode !== "insert") return;
    const line = lines[cursorLine] || "";
    lines[cursorLine] = line.slice(0, cursorCol) + char + line.slice(cursorCol);
    cursorCol++;
    modified = true;
    listeners.forEach((l) => l());
  },

  deleteCharBefore: () => {
    if (mode !== "insert") return;
    if (cursorCol > 0) {
      const line = lines[cursorLine] || "";
      lines[cursorLine] = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
      cursorCol--;
      modified = true;
      listeners.forEach((l) => l());
    } else if (cursorLine > 0) {
      // Join with previous line
      const prevLine = lines[cursorLine - 1] || "";
      const currentLine = lines[cursorLine] || "";
      cursorCol = prevLine.length;
      lines[cursorLine - 1] = prevLine + currentLine;
      lines.splice(cursorLine, 1);
      cursorLine--;
      contentLength = lines.length;
      modified = true;
      listeners.forEach((l) => l());
    }
  },

  deleteWordBefore: () => {
    if (mode !== "insert") return;
    if (cursorCol === 0) {
      if (cursorLine === 0) return;
      // Join with previous line
      const prevLine = lines[cursorLine - 1] || "";
      const currentLine = lines[cursorLine] || "";
      cursorCol = prevLine.length;
      lines[cursorLine - 1] = prevLine + currentLine;
      lines.splice(cursorLine, 1);
      cursorLine--;
      contentLength = lines.length;
      modified = true;
      listeners.forEach((l) => l());
      return;
    }

    const line = lines[cursorLine] || "";
    let i = cursorCol - 1;
    while (i >= 0 && isWhitespace(line[i])) {
      i--;
    }
    while (i >= 0 && isWordChar(line[i])) {
      i--;
    }
    const start = i + 1;
    lines[cursorLine] = line.slice(0, start) + line.slice(cursorCol);
    cursorCol = start;
    modified = true;
    listeners.forEach((l) => l());
  },

  deleteCharAt: () => {
    if (mode !== "insert") return;
    const line = lines[cursorLine] || "";
    if (cursorCol < line.length) {
      lines[cursorLine] = line.slice(0, cursorCol) + line.slice(cursorCol + 1);
      modified = true;
      listeners.forEach((l) => l());
    } else if (cursorLine < lines.length - 1) {
      // Join with next line
      const nextLine = lines[cursorLine + 1] || "";
      lines[cursorLine] = line + nextLine;
      lines.splice(cursorLine + 1, 1);
      contentLength = lines.length;
      modified = true;
      listeners.forEach((l) => l());
    }
  },

  deleteWordAt: () => {
    if (mode !== "insert") return;
    const line = lines[cursorLine] || "";
    if (cursorCol >= line.length) {
      if (cursorLine >= lines.length - 1) return;
      // Join with next line
      const nextLine = lines[cursorLine + 1] || "";
      lines[cursorLine] = line + nextLine;
      lines.splice(cursorLine + 1, 1);
      contentLength = lines.length;
      modified = true;
      listeners.forEach((l) => l());
      return;
    }

    let i = cursorCol;
    while (i < line.length && isWhitespace(line[i])) {
      i++;
    }
    while (i < line.length && isWordChar(line[i])) {
      i++;
    }

    if (i === cursorCol) return;
    lines[cursorLine] = line.slice(0, cursorCol) + line.slice(i);
    modified = true;
    listeners.forEach((l) => l());
  },

  insertNewline: () => {
    if (mode !== "insert") return;
    const line = lines[cursorLine] || "";
    const before = line.slice(0, cursorCol);
    const after = line.slice(cursorCol);
    lines[cursorLine] = before;
    lines.splice(cursorLine + 1, 0, after);
    cursorLine++;
    cursorCol = 0;
    contentLength = lines.length;
    modified = true;

    // Auto-scroll
    if (cursorLine >= scrollOffset + contentHeight) {
      scrollOffset = cursorLine - contentHeight + 1;
    }

    listeners.forEach((l) => l());
  },

  scrollUp: () => {
    fileViewerState.setScrollOffset(scrollOffset - 1);
  },

  scrollDown: () => {
    fileViewerState.setScrollOffset(scrollOffset + 1);
  },

  pageUp: () => {
    fileViewerState.setScrollOffset(scrollOffset - contentHeight);
    fileViewerState.setCursor(cursorLine - contentHeight, cursorCol);
  },

  pageDown: () => {
    fileViewerState.setScrollOffset(scrollOffset + contentHeight);
    fileViewerState.setCursor(cursorLine + contentHeight, cursorCol);
  },

  scrollToTop: () => {
    fileViewerState.setScrollOffset(0);
    fileViewerState.setCursor(0, 0);
  },

  scrollToBottom: () => {
    fileViewerState.setScrollOffset(contentLength - contentHeight);
    fileViewerState.setCursor(contentLength - 1, 0);
  },

  save: () => {
    if (!filePath || !modified) return false;
    try {
      const { writeFileSync } = require("fs");
      writeFileSync(filePath, lines.join("\n"));
      modified = false;
      listeners.forEach((l) => l());
      return true;
    } catch {
      return false;
    }
  },

  // Line jump
  enterJumpMode: () => {
    jumpActive = true;
    jumpQuery = "";
    listeners.forEach((l) => l());
  },

  exitJumpMode: () => {
    jumpActive = false;
    jumpQuery = "";
    listeners.forEach((l) => l());
  },

  appendJumpChar: (char: string) => {
    if (!jumpActive) return;
    if (char < "0" || char > "9") return;
    jumpQuery += char;
    listeners.forEach((l) => l());
  },

  deleteJumpChar: () => {
    if (!jumpActive || jumpQuery.length === 0) return;
    jumpQuery = jumpQuery.slice(0, -1);
    listeners.forEach((l) => l());
  },

  confirmJump: () => {
    if (!jumpActive) return;
    const lineNumber = Number.parseInt(jumpQuery, 10);
    if (!Number.isNaN(lineNumber)) {
      const targetLine = Math.max(0, Math.min(contentLength - 1, lineNumber - 1));
      fileViewerState.setCursor(targetLine, 0, true);
    }
    jumpActive = false;
    jumpQuery = "";
    listeners.forEach((l) => l());
  },

  // Search
  enterSearchMode: () => {
    searchActive = true;
    searchQuery = "";
    searchMatches = [];
    activeMatchIndex = 0;
    listeners.forEach((l) => l());
  },

  exitSearchMode: () => {
    searchActive = false;
    searchQuery = "";
    searchMatches = [];
    activeMatchIndex = 0;
    listeners.forEach((l) => l());
  },

  appendSearchChar: (char: string) => {
    if (!searchActive) return;
    searchQuery += char;
    updateSearchMatches();
  },

  deleteSearchChar: () => {
    if (!searchActive || searchQuery.length === 0) return;
    searchQuery = searchQuery.slice(0, -1);
    updateSearchMatches();
  },

  nextMatch: () => {
    if (!searchActive || searchMatches.length === 0) return;
    activeMatchIndex = (activeMatchIndex + 1) % searchMatches.length;
    moveToActiveMatch();
  },

  prevMatch: () => {
    if (!searchActive || searchMatches.length === 0) return;
    activeMatchIndex = (activeMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    moveToActiveMatch();
  },

  reset: () => {
    scrollOffset = 0;
    contentLength = 0;
    cursorLine = 0;
    cursorCol = 0;
    mode = "normal";
    lines = [];
    modified = false;
    filePath = null;
    searchActive = false;
    searchQuery = "";
    searchMatches = [];
    activeMatchIndex = 0;
    jumpActive = false;
    jumpQuery = "";
    listeners.forEach((l) => l());
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

function updateSearchMatches() {
  if (!searchActive || searchQuery.length === 0) {
    searchMatches = [];
    activeMatchIndex = 0;
    listeners.forEach((l) => l());
    return;
  }

  const matches: SearchMatch[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i] || "";
    const occurrences = findAllOccurrences(lineText, searchQuery);
    for (const start of occurrences) {
      const positions: number[] = [];
      for (let p = 0; p < searchQuery.length; p++) {
        positions.push(start + p);
      }
      matches.push({ line: i, start, length: searchQuery.length, positions });
    }
  }

  searchMatches = matches;
  activeMatchIndex = 0;

  if (searchMatches.length > 0) {
    moveToActiveMatch();
  } else {
    listeners.forEach((l) => l());
  }
}

function moveToActiveMatch() {
  const match = searchMatches[activeMatchIndex];
  if (!match) {
    listeners.forEach((l) => l());
    return;
  }
  fileViewerState.setCursor(match.line, match.start, true);
}

function findAllOccurrences(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const starts: number[] = [];
  let index = 0;
  while (index <= lowerHaystack.length - lowerNeedle.length) {
    const found = lowerHaystack.indexOf(lowerNeedle, index);
    if (found === -1) break;
    starts.push(found);
    index = found + 1;
  }
  return starts;
}

function isWhitespace(char: string | undefined): boolean {
  return char !== undefined && (char === " " || char === "\t");
}

function isWordChar(char: string | undefined): boolean {
  if (!char) return false;
  return /[A-Za-z0-9_]/.test(char);
}
