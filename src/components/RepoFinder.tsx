import { useState, useEffect, useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useDialogKeyboard, type PromptContext } from "@opentui-ui/dialog/react";
import { readdirSync } from "fs";

interface RepoFinderProps extends PromptContext<string> {
  repoDirectory: string;
}

// Einfaches Fuzzy-Matching: prüft ob alle Zeichen von query in text vorkommen (in Reihenfolge)
function fuzzyMatch(text: string, query: string): { matches: boolean; score: number } {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (!lowerQuery) return { matches: true, score: 0 };

  let queryIndex = 0;
  let score = 0;
  let consecutiveBonus = 0;

  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      // Bonus für Match am Anfang
      if (i === 0) score += 10;
      // Bonus für aufeinanderfolgende Matches
      score += 1 + consecutiveBonus;
      consecutiveBonus += 1;
      queryIndex++;
    } else {
      consecutiveBonus = 0;
    }
  }

  return {
    matches: queryIndex === lowerQuery.length,
    score: queryIndex === lowerQuery.length ? score : 0,
  };
}

export function RepoFinder({ resolve, dismiss, dialogId, repoDirectory }: RepoFinderProps) {
  const [query, setQuery] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    try {
      const entries = readdirSync(repoDirectory, { withFileTypes: true });
      const dirs = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      setFolders(dirs);
    } catch {
      setFolders([]);
    }
  }, [repoDirectory]);

  // Gefilterte und sortierte Ergebnisse
  const filteredFolders = useMemo(() => {
    if (!query) return folders;

    return folders
      .map((folder) => ({ folder, ...fuzzyMatch(folder, query) }))
      .filter((item) => item.matches)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.folder);
  }, [folders, query]);

  // Reset selection wenn sich die gefilterte Liste ändert
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredFolders.length]);

  useDialogKeyboard((key) => {
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.name === "down") {
      setSelectedIndex((i) => Math.min(filteredFolders.length - 1, i + 1));
    } else if (key.name === "return") {
      if (filteredFolders[selectedIndex]) {
        resolve(filteredFolders[selectedIndex]);
      }
    } else if (key.name === "escape") {
      dismiss();
    } else if (key.name === "backspace") {
      setQuery((q) => q.slice(0, -1));
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      // Normaler Buchstabe/Zeichen
      setQuery((q) => q + key.sequence);
    }
  }, dialogId);

  // Scrolling window - zeige 10 Items um die Selektion herum
  const maxVisible = 10;
  let scrollOffset = 0;
  if (filteredFolders.length > maxVisible) {
    const idealOffset = selectedIndex - Math.floor(maxVisible / 2);
    const maxOffset = filteredFolders.length - maxVisible;
    scrollOffset = Math.max(0, Math.min(idealOffset, maxOffset));
  }

  const visibleFolders = filteredFolders.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <box flexDirection="column" width={50}>
      <text attributes={TextAttributes.BOLD}>Open repository</text>
      <box height={1} />

      {/* Eingabefeld */}
      <box>
        <text>&gt; </text>
        <text>{query}</text>
        <text attributes={TextAttributes.BLINK}>_</text>
      </box>

      <box height={1} />

      {/* Ordnerliste */}
      <box flexDirection="column">
        {visibleFolders.length === 0 ? (
          <text attributes={TextAttributes.DIM}>No matches</text>
        ) : (
          visibleFolders.map((folder, index) => {
            const actualIndex = scrollOffset + index;
            const isSelected = selectedIndex === actualIndex;
            return (
              <text
                key={folder}
                attributes={isSelected ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
              >
                {isSelected ? "▶ " : "  "}{folder}
              </text>
            );
          })
        )}
      </box>

      <box height={1} />
      <text attributes={TextAttributes.DIM}>
        {filteredFolders.length} of {folders.length} repositories
      </text>
      <box height={1} />
      <text attributes={TextAttributes.DIM}>
        ↑↓: Navigate | Enter: Open | Esc: Cancel
      </text>
    </box>
  );
}
