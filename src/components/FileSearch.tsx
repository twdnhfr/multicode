import { useState, useEffect, useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useDialogKeyboard, type PromptContext } from "@opentui-ui/dialog/react";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, relative, basename } from "path";

interface FileSearchProps extends PromptContext<string> {
  rootPath: string;
}

// Ordner die immer ignoriert werden
const IGNORED_DIRS = new Set(["node_modules", "vendor", ".git"]);

// Dateien die trotz .gitignore immer angezeigt werden
const WHITELIST = new Set([".env"]);

interface GitignorePattern {
  pattern: string;
  regex: RegExp;
  isDirectory: boolean;
}

// Gitignore Pattern zu Regex konvertieren
function patternToRegex(pattern: string): RegExp {
  // Escape special regex chars außer * und ?
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/{{GLOBSTAR}}/g, ".*");

  // Pattern ohne führenden Slash matcht überall
  if (!pattern.startsWith("/")) {
    regex = "(^|/)" + regex;
  } else {
    regex = "^" + regex.slice(1); // Remove leading slash for regex
  }

  // Am Ende matchen
  regex = regex + "(/|$)";

  return new RegExp(regex);
}

// .gitignore parsen
function parseGitignore(rootPath: string): GitignorePattern[] {
  const gitignorePath = join(rootPath, ".gitignore");
  if (!existsSync(gitignorePath)) return [];

  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const patterns: GitignorePattern[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();

      // Leere Zeilen und Kommentare ignorieren
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Negation patterns ignorieren wir (könnten später implementiert werden)
      if (trimmed.startsWith("!")) continue;

      const isDirectory = trimmed.endsWith("/");
      const pattern = isDirectory ? trimmed.slice(0, -1) : trimmed;

      patterns.push({
        pattern: trimmed,
        regex: patternToRegex(pattern),
        isDirectory,
      });
    }

    return patterns;
  } catch {
    return [];
  }
}

// Prüfen ob ein Pfad von gitignore ignoriert wird
function isIgnored(
  relPath: string,
  isDirectory: boolean,
  patterns: GitignorePattern[]
): boolean {
  // Whitelist prüfen (z.B. .env)
  const fileName = basename(relPath);
  if (WHITELIST.has(fileName)) return false;

  for (const { regex, isDirectory: patternIsDir } of patterns) {
    // Directory-only patterns nur auf Ordner anwenden
    if (patternIsDir && !isDirectory) continue;

    if (regex.test(relPath)) {
      return true;
    }
  }

  return false;
}

// Einzelnen Term gegen Text matchen
function matchSingleTerm(lowerText: string, term: string): { matches: boolean; score: number } {
  // Direkter Substring-Match (beste Qualität)
  const substringIndex = lowerText.indexOf(term);
  if (substringIndex !== -1) {
    let score = 100 + term.length * 10;

    // Bonus für Match am Wortanfang
    if (
      substringIndex === 0 ||
      lowerText[substringIndex - 1] === "/" ||
      lowerText[substringIndex - 1] === "." ||
      lowerText[substringIndex - 1] === "_" ||
      lowerText[substringIndex - 1] === "-"
    ) {
      score += 50;
    }

    // Bonus für Match im Dateinamen (nach letztem /)
    const lastSlash = lowerText.lastIndexOf("/");
    if (substringIndex > lastSlash) {
      score += 30;
    }

    return { matches: true, score };
  }

  // Fallback: Fuzzy-Match mit mindestens 60% aufeinanderfolgenden Zeichen
  let queryIndex = 0;
  let maxConsecutive = 0;
  let currentConsecutive = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < lowerText.length && queryIndex < term.length; i++) {
    if (lowerText[i] === term[queryIndex]) {
      if (lastMatchIndex === i - 1) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
      lastMatchIndex = i;
      queryIndex++;
    }
  }

  const allMatched = queryIndex === term.length;
  // Mindestens 60% der Query muss zusammenhängend sein
  const minConsecutive = Math.ceil(term.length * 0.6);
  const isGoodMatch = allMatched && maxConsecutive >= minConsecutive;

  return {
    matches: isGoodMatch,
    score: isGoodMatch ? maxConsecutive * 10 : 0,
  };
}

// Fuzzy-Matching: Mehrere Terme mit Leerzeichen getrennt (AND-Verknüpfung)
function fuzzyMatch(text: string, query: string): { matches: boolean; score: number } {
  const lowerText = text.toLowerCase();
  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery) return { matches: true, score: 0 };

  // Query in Terme aufteilen (Leerzeichen = AND)
  const terms = trimmedQuery.split(/\s+/).filter(Boolean);

  let totalScore = 0;

  // Alle Terme müssen matchen
  for (const term of terms) {
    const result = matchSingleTerm(lowerText, term);
    if (!result.matches) {
      return { matches: false, score: 0 };
    }
    totalScore += result.score;
  }

  return { matches: true, score: totalScore };
}

// Rekursiv alle Dateien sammeln
function getAllFiles(rootPath: string, maxDepth: number = 15): string[] {
  const files: string[] = [];
  const gitignorePatterns = parseGitignore(rootPath);

  function traverse(dirPath: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Ignorierte Ordner überspringen (hardcoded)
        if (IGNORED_DIRS.has(entry.name)) continue;

        const fullPath = join(dirPath, entry.name);
        const relPath = relative(rootPath, fullPath);

        // Gitignore prüfen
        if (isIgnored(relPath, entry.isDirectory(), gitignorePatterns)) continue;

        if (entry.isDirectory()) {
          traverse(fullPath, depth + 1);
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors etc.
    }
  }

  traverse(rootPath, 0);
  return files;
}

export function FileSearch({ resolve, dismiss, dialogId, rootPath }: FileSearchProps) {
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Dateien beim Öffnen laden
  useEffect(() => {
    const files = getAllFiles(rootPath);
    setAllFiles(files);
  }, [rootPath]);

  // Gefilterte und sortierte Ergebnisse
  const filteredFiles = useMemo(() => {
    // Relative Pfade für Anzeige und Suche
    const filesWithRelPath = allFiles.map((fullPath) => ({
      fullPath,
      relPath: relative(rootPath, fullPath),
    }));

    if (!query) {
      // Ohne Query: erste 10 Dateien (alphabetisch)
      return filesWithRelPath
        .sort((a, b) => a.relPath.localeCompare(b.relPath))
        .slice(0, 10);
    }

    return filesWithRelPath
      .map((file) => ({ ...file, ...fuzzyMatch(file.relPath, query) }))
      .filter((item) => item.matches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [allFiles, query, rootPath]);

  // Reset selection wenn sich die gefilterte Liste ändert
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredFiles.length]);

  useDialogKeyboard((key) => {
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.name === "down") {
      setSelectedIndex((i) => Math.min(filteredFiles.length - 1, i + 1));
    } else if (key.name === "return") {
      if (filteredFiles[selectedIndex]) {
        resolve(filteredFiles[selectedIndex].fullPath);
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

  return (
    <box flexDirection="column" width={60}>
      <text attributes={TextAttributes.BOLD}>Search file</text>
      <box height={1} />

      {/* Eingabefeld */}
      <box>
        <text attributes={TextAttributes.DIM}>&gt; </text>
        <text>{query}</text>
        <text attributes={TextAttributes.BLINK}>_</text>
      </box>

      <box height={1} />

      {/* Dateiliste */}
      <box flexDirection="column">
        {allFiles.length === 0 ? (
          <text attributes={TextAttributes.DIM}>Loading files...</text>
        ) : filteredFiles.length === 0 ? (
          <text attributes={TextAttributes.DIM}>No matches</text>
        ) : (
          filteredFiles.map((file, index) => (
            <text
              key={file.fullPath}
              attributes={selectedIndex === index ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
            >
              {selectedIndex === index ? "▶ " : "  "}{file.relPath}
            </text>
          ))
        )}
      </box>

      <box height={1} />
      <text attributes={TextAttributes.DIM}>
        {filteredFiles.length} of {allFiles.length} files
      </text>
      <box height={1} />
      <text attributes={TextAttributes.DIM}>
        ↑↓: Navigate | Enter: Select | Esc: Cancel
      </text>
    </box>
  );
}
