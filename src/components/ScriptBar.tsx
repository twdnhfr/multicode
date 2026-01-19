import { useState, useEffect } from "react";
import { TextAttributes, StyledText, RGBA } from "@opentui/core";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { OTLPData } from "./OTLPReceiver";

// Farben für Script-Status
const GREEN = RGBA.fromInts(34, 197, 94);
const RED = RGBA.fromInts(239, 68, 68);
const YELLOW = RGBA.fromInts(234, 179, 8);
const CYAN = RGBA.fromInts(34, 211, 238);

export type ScriptStatus = "running" | "success" | "error";

interface ScriptBarProps {
  repoPath: string | null;
  runningScripts?: Set<string>;
  scriptStatuses?: Map<string, ScriptStatus>;
  // OTLP Receiver
  otlpRunning?: boolean;
  otlpPort?: number;
  otlpData?: OTLPData | null;
  hasArtisan?: boolean;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

// Nur dev und build werden angezeigt
const SHOWN_SCRIPTS = ["dev", "build"];

export function ScriptBar({
  repoPath,
  runningScripts = new Set(),
  scriptStatuses = new Map(),
  otlpRunning = false,
  otlpPort = 4319,
  otlpData = null,
  hasArtisan = false,
}: ScriptBarProps) {
  const [scripts, setScripts] = useState<string[]>([]);

  useEffect(() => {
    if (!repoPath) {
      setScripts([]);
      return;
    }

    const packageJsonPath = join(repoPath, "package.json");

    if (!existsSync(packageJsonPath)) {
      setScripts([]);
      return;
    }

    try {
      const content = readFileSync(packageJsonPath, "utf-8");
      const pkg: PackageJson = JSON.parse(content);

      if (pkg.scripts) {
        // Nur dev und build anzeigen, falls vorhanden
        const available = SHOWN_SCRIPTS.filter((s) => s in pkg.scripts!);
        setScripts(available);
      } else {
        setScripts([]);
      }
    } catch {
      setScripts([]);
    }
  }, [repoPath]);

  // Build OTLP status string
  let otlpStatus = "";
  if (otlpRunning && otlpData) {
    if (otlpData.isThinking) {
      otlpStatus = "thinking...";
    } else if (otlpData.currentTool) {
      otlpStatus = otlpData.currentTool;
    } else if (otlpData.inputTokens > 0 || otlpData.outputTokens > 0) {
      otlpStatus = `${formatTokens(otlpData.inputTokens)}/${formatTokens(otlpData.outputTokens)}`;
    }
  }

  return (
    <box
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      gap={2}
    >
      {/* OTLP Receiver Toggle */}
      <text
        content={
          otlpRunning
            ? new StyledText([
                { __isChunk: true, text: "● ", fg: GREEN },
                { __isChunk: true, text: `[t] OTLP:${otlpPort}`, fg: GREEN },
                otlpStatus ? { __isChunk: true, text: ` ${otlpStatus}`, fg: CYAN } : { __isChunk: true, text: "" },
              ])
            : new StyledText([
                { __isChunk: true, text: "○ ", fg: RGBA.fromInts(100, 100, 100) },
                { __isChunk: true, text: "[t] OTLP", fg: RGBA.fromInts(100, 100, 100) },
              ])
        }
      />

      {/* Separator if we have scripts */}
      {scripts.length > 0 && <text attributes={TextAttributes.DIM}>|</text>}

      {/* Scripts */}
      {scripts.length > 0 && <text attributes={TextAttributes.DIM}>Scripts:</text>}
      {scripts.map((script) => {
        const isRunning = runningScripts.has(script);
        const status = scriptStatuses.get(script);

        // Zeige Hotkey-Hinweis für dev und build
        let label = script;
        if (script === "dev") label = "[d] dev";
        if (script === "build") label = "[b] build";

        // Bestimme Farbe basierend auf Status
        let color: RGBA | undefined;
        let prefix = "";

        if (isRunning) {
          color = GREEN;
          prefix = "● ";
        } else if (status === "running") {
          color = YELLOW;
          prefix = "◐ ";
        } else if (status === "success") {
          color = GREEN;
          prefix = "✓ ";
        } else if (status === "error") {
          color = RED;
          prefix = "✗ ";
        }

        // Immer content prop verwenden für konsistentes Rendering
        return (
          <text
            key={script}
            content={
              color
                ? new StyledText([
                    { __isChunk: true, text: prefix, fg: color },
                    { __isChunk: true, text: label, fg: color },
                  ])
                : label
            }
          />
        );
      })}

      {/* Laravel */}
      {hasArtisan && (
        <>
          {scripts.length > 0 && <text attributes={TextAttributes.DIM}>|</text>}
          <text attributes={TextAttributes.DIM}>Laravel:</text>
          <text attributes={TextAttributes.DIM}>[m] migrate</text>
        </>
      )}
    </box>
  );
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
