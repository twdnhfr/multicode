import { useState, useEffect, useMemo } from "react";
import { TextAttributes } from "@opentui/core";
import { useDialogKeyboard, type PromptContext } from "@opentui-ui/dialog/react";
import { readdirSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

interface FolderPickerProps extends PromptContext<string> {
  initialPath?: string;
}

export function FolderPicker({ resolve, dismiss, dialogId, initialPath }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || homedir());
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Der tatsächlich ausgewählte Pfad basierend auf Markierung
  const selectedPath = useMemo(() => {
    if (selectedIndex === -1) {
      // ".." ausgewählt -> Elternverzeichnis
      return dirname(currentPath);
    } else if (folders[selectedIndex]) {
      // Ordner ausgewählt -> vollständiger Pfad
      return join(currentPath, folders[selectedIndex]);
    }
    return currentPath;
  }, [currentPath, folders, selectedIndex]);

  useEffect(() => {
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });
      const dirs = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      setFolders(dirs);
      setSelectedIndex(0);
    } catch {
      setFolders([]);
    }
  }, [currentPath]);

  useDialogKeyboard((key) => {
    if (key.name === "up") {
      setSelectedIndex((i) => Math.max(-1, i - 1));
    }
    if (key.name === "down") {
      setSelectedIndex((i) => Math.min(folders.length - 1, i + 1));
    }
    if (key.name === "left") {
      // Go up one directory
      const parent = dirname(currentPath);
      if (parent !== currentPath) {
        setCurrentPath(parent);
      }
    }
    if (key.name === "right") {
      // Enter selected folder
      if (selectedIndex === -1) {
        const parent = dirname(currentPath);
        if (parent !== currentPath) {
          setCurrentPath(parent);
        }
      } else if (folders[selectedIndex]) {
        setCurrentPath(join(currentPath, folders[selectedIndex]));
      }
    }
    if (key.name === "return") {
      // Confirm the selected path
      resolve(selectedPath);
    }
    if (key.name === "escape") {
      dismiss();
    }
  }, dialogId);

  // Scrolling: Berechne sichtbaren Bereich basierend auf Auswahl
  const maxVisible = 10;
  const scrollOffset = useMemo(() => {
    if (selectedIndex < 0) return 0; // ".." ist ausgewählt
    if (selectedIndex < maxVisible - 2) return 0;
    return Math.min(selectedIndex - (maxVisible - 3), folders.length - maxVisible);
  }, [selectedIndex, folders.length]);

  const visibleFolders = folders.slice(
    Math.max(0, scrollOffset),
    Math.max(0, scrollOffset) + maxVisible
  );

  return (
    <box flexDirection="column" width={50}>
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
      <text attributes={TextAttributes.BOLD}>{selectedPath}</text>
      <box height={1} />
      <text attributes={TextAttributes.DIM}>
        ↑↓: Navigate | ←: Back | →: Open | Enter: Select | Esc: Cancel
      </text>
    </box>
  );
}
