import { useState, useEffect, useCallback } from "react";
import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { readdirSync, statSync } from "fs";
import { join, basename } from "path";

interface FileTreeProps {
  rootPath: string;
  width?: number;
  height?: number;
  isActive?: boolean;
  showHidden?: boolean;
  navigateToPath?: string | null;
  onNavigated?: () => void;
  onFileOpen?: (filePath: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  depth: number;
}

function getVisibleNodes(
  rootPath: string,
  expandedPaths: Set<string>,
  showHidden: boolean = true,
  maxDepth: number = 10
): TreeNode[] {
  const nodes: TreeNode[] = [];

  function traverse(dirPath: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      // Don't use withFileTypes - Bun has issues with Dirent objects
      const names = readdirSync(dirPath);
      // Folders to always exclude
      const excludedFolders = [".git", "node_modules", "vendor"];
      const entries = names
        .filter((name) => !excludedFolders.includes(name))
        .filter((name) => showHidden || !name.startsWith("."))
        .map((name) => {
          const fullPath = join(dirPath, name);
          let isDir = false;
          try {
            isDir = statSync(fullPath).isDirectory();
          } catch {
            // Ignore stat errors
          }
          return { name, fullPath, isDir };
        })
        .sort((a, b) => {
          // Ordner zuerst, dann alphabetisch
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

      for (const entry of entries) {
        nodes.push({
          name: entry.name,
          path: entry.fullPath,
          isDirectory: entry.isDir,
          depth,
        });

        // Rekursiv wenn Ordner expandiert ist
        if (entry.isDir && expandedPaths.has(entry.fullPath)) {
          traverse(entry.fullPath, depth + 1);
        }
      }
    } catch {
      // Ignore permission errors etc.
    }
  }

  traverse(rootPath, 0);
  return nodes;
}

export function FileTree({
  rootPath,
  width = 25,
  height,
  isActive = true,
  showHidden = true,
  navigateToPath = null,
  onNavigated,
  onFileOpen,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);

  // No useMemo - avoid caching issues on tab switch
  const nodes = getVisibleNodes(rootPath, expandedPaths, showHidden);

  // Navigation zu einem bestimmten Pfad (von FileSearch)
  useEffect(() => {
    if (!navigateToPath) return;

    // Alle Parent-Ordner expandieren
    const pathsToExpand: string[] = [];
    let current = navigateToPath;

    while (current !== rootPath && current.startsWith(rootPath)) {
      const parent = join(current, "..");
      if (parent !== current) {
        pathsToExpand.push(parent);
        current = parent;
      } else {
        break;
      }
    }

    if (pathsToExpand.length > 0) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        for (const p of pathsToExpand) {
          next.add(p);
        }
        return next;
      });
    }

    // Nach dem nächsten Render den Index setzen
    setTimeout(() => {
      const updatedNodes = getVisibleNodes(
        rootPath,
        new Set([...expandedPaths, ...pathsToExpand]),
        showHidden
      );
      const targetIndex = updatedNodes.findIndex((n) => n.path === navigateToPath);
      if (targetIndex >= 0) {
        setSelectedIndex(targetIndex);
      }
      onNavigated?.();
    }, 0);
  }, [navigateToPath, rootPath, showHidden]);

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= nodes.length) {
      setSelectedIndex(Math.max(0, nodes.length - 1));
    }
  }, [nodes.length, selectedIndex]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const selectedNode = nodes[selectedIndex];

  useKeyboard((key) => {
    if (!isActive) return;

    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.name === "down") {
      setSelectedIndex((i) => Math.min(nodes.length - 1, i + 1));
    } else if (key.name === "return") {
      if (selectedNode?.isDirectory) {
        toggleExpand(selectedNode.path);
      } else if (selectedNode && onFileOpen) {
        onFileOpen(selectedNode.path);
      }
    } else if (key.name === "right") {
      if (selectedNode?.isDirectory && !expandedPaths.has(selectedNode.path)) {
        toggleExpand(selectedNode.path);
      }
    } else if (key.name === "left") {
      if (selectedNode?.isDirectory && expandedPaths.has(selectedNode.path)) {
        // Zuklappen
        toggleExpand(selectedNode.path);
      } else if (selectedNode && selectedNode.depth > 0) {
        // Zum Parent springen
        const parentPath = join(selectedNode.path, "..");
        const parentIndex = nodes.findIndex((n) => n.path === parentPath);
        if (parentIndex >= 0) {
          setSelectedIndex(parentIndex);
        }
      }
    }
  });

  const repoName = basename(rootPath);

  // Sichtbare Zeilen (scroll window)
  // height - 4 für Header (Repo-Name + Leerzeile), Scroll-Indikator und Hotkeys
  const maxVisible = height ? Math.max(5, height - 4) : 50;
  const scrollOffset = Math.max(0, selectedIndex - maxVisible + 5);
  const visibleNodes = nodes.slice(scrollOffset, scrollOffset + maxVisible);

  return (
    <box flexDirection="column" width={width}>
      {/* Header */}
      <text attributes={TextAttributes.BOLD}>▸ {truncate(repoName, width - 3)}</text>
      <box height={1} />

      {/* Tree */}
      <box flexDirection="column" flexGrow={1}>
        {visibleNodes.map((node, visibleIdx) => {
          const actualIndex = scrollOffset + visibleIdx;
          const isSelected = actualIndex === selectedIndex;
          const indent = "  ".repeat(node.depth);
          const icon = node.isDirectory ? "▸ " : "  ";
          const displayName = truncate(node.name, width - 4 - node.depth * 2);
          return (
            <text
              key={node.path}
              attributes={isSelected ? TextAttributes.INVERSE : undefined}
            >
              {indent}{icon}{displayName}
            </text>
          );
        })}
      </box>

      {/* Scrollindikator */}
      {nodes.length > maxVisible && (
        <text attributes={TextAttributes.DIM}>
          {selectedIndex + 1}/{nodes.length}
        </text>
      )}

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Hotkeys */}
      <text attributes={TextAttributes.DIM}>
        enter:open h:{showHidden ? "hide" : "show"} f:search
      </text>
    </box>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}
