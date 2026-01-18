import { TextAttributes } from "@opentui/core";
import type { Worktree } from "../config";
import type { SyncStatus } from "./WorktreeManager";
import type { OTLPData } from "./OTLPReceiver";
import type { ClaudeStatus } from "./TabBar";

function getOtlpStatus(otlpData: OTLPData | null | undefined, otlpRunning: boolean | undefined): "active" | "thinking" | "waiting" | "idle" {
  if (!otlpRunning || !otlpData) return "idle";
  if (otlpData.isThinking) return "thinking";
  if (otlpData.currentTool) return "active";
  return "waiting";
}

function getStatusSymbol(status: ClaudeStatus): string {
  switch (status) {
    case "active":
      return "⚡"; // Blitz für Tool-Ausführung
    case "thinking":
      return "◉"; // Gefüllter Kreis für Thinking
    default:
      return "";
  }
}

interface WorktreeBarProps {
  worktrees: Worktree[];
  activeWorktreeId: string;
  syncStatuses?: Map<string, SyncStatus>;
  isFocused?: boolean;
  otlpData?: OTLPData | null;
  otlpRunning?: boolean;
  tabSessionId?: string; // Session ID des aktiven Tabs für OTLP Matching
}

export function WorktreeBar({
  worktrees,
  activeWorktreeId,
  syncStatuses,
  isFocused,
  otlpData,
  otlpRunning,
  tabSessionId,
}: WorktreeBarProps) {
  if (worktrees.length === 0) return null;

  const otlpStatus = getOtlpStatus(otlpData, otlpRunning);

  return (
    <box
      flexDirection="row"
      borderStyle="single"
      border={true}
      borderColor={isFocused ? "#22c55e" : undefined}
    >
      {worktrees.map((wt, index) => {
        const isActive = wt.id === activeWorktreeId;
        const sync = syncStatuses?.get(wt.id);
        const syncStr = sync ? `↑${sync.ahead}↓${sync.behind}` : "";
        const label = `${index + 1}:${truncate(wt.branch, 12)}${syncStr}`;

        // Zeige Status NUR wenn:
        // 1. OTLP session matcht Tab session UND
        // 2. Worktree ist aktiv UND
        // 3. OTLP zeigt echte Aktivität (thinking/active)
        let wtStatus: ClaudeStatus = "idle";
        const sessionMatches = tabSessionId && otlpData?.sessionId && tabSessionId === otlpData.sessionId;
        if (sessionMatches && isActive && (otlpStatus === "thinking" || otlpStatus === "active")) {
          wtStatus = otlpStatus;
        }

        const symbol = getStatusSymbol(wtStatus);

        if (symbol) {
          // Zeige Symbol vor dem Worktree-Namen
          return (
            <box key={wt.id} paddingLeft={1} paddingRight={1}>
              <text
                attributes={isActive ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
              >
                {symbol}[{label}]
              </text>
            </box>
          );
        }

        return (
          <box key={wt.id} paddingLeft={1} paddingRight={1}>
            <text
              attributes={isActive ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
            >
              [{label}]
            </text>
          </box>
        );
      })}
      <box flexGrow={1} />
      <box paddingLeft={1} paddingRight={1}>
        <text attributes={TextAttributes.DIM}>Tab: Focus | 1-9: switch | w: manage</text>
      </box>
    </box>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}
