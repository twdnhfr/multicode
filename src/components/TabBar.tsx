import { TextAttributes } from "@opentui/core";
import type { Worktree } from "../config";
import type { OTLPData } from "./OTLPReceiver";

export interface Tab {
  id: string;
  name: string;
  path: string;
  isTerminalOpen?: boolean;
  worktrees: Worktree[];
  activeWorktreeId: string;
  sessionId?: string; // Claude session ID
  isNewSession?: boolean; // true = use --session-id, false = use --resume
}

// "running" = hat Prozess aber nicht aktiv, "active" = Tool läuft, "thinking" = denkt, "waiting" = auf Input
export type ClaudeStatus = "active" | "thinking" | "waiting" | "running" | "idle";

interface TabBarProps {
  tabs: Tab[];
  activeIndex: number;
  isFocused?: boolean;
  otlpData?: OTLPData | null;
  otlpRunning?: boolean;
}

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

export function TabBar({ tabs, activeIndex, isFocused, otlpData, otlpRunning }: TabBarProps) {
  if (tabs.length === 0) return null;

  const otlpStatus = getOtlpStatus(otlpData, otlpRunning);

  return (
    <box
      flexDirection="row"
      borderStyle="single"
      border={true}
      borderColor={isFocused ? "#22c55e" : undefined}
    >
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        const label = `${index + 1}:${truncate(tab.name, 15)}`;

        // Zeige Status NUR wenn:
        // 1. OTLP session ID matcht die Tab session ID UND
        // 2. OTLP zeigt echte Aktivität (thinking/active)
        let tabStatus: ClaudeStatus = "idle";
        const sessionMatches = tab.sessionId && otlpData?.sessionId && tab.sessionId === otlpData.sessionId;
        if (sessionMatches && (otlpStatus === "thinking" || otlpStatus === "active")) {
          tabStatus = otlpStatus;
        }

        const symbol = getStatusSymbol(tabStatus);

        if (symbol) {
          // Zeige Symbol vor dem Tab-Namen
          return (
            <box key={tab.id} paddingLeft={1} paddingRight={1}>
              <text
                attributes={isActive ? TextAttributes.INVERSE | TextAttributes.BOLD : undefined}
              >
                {symbol}[{label}]
              </text>
            </box>
          );
        }

        return (
          <box key={tab.id} paddingLeft={1} paddingRight={1}>
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
        <text attributes={TextAttributes.DIM}>Tab: Focus | 1-9: switch | x: close</text>
      </box>
    </box>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}
