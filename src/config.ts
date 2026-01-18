import { existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

const CONFIG_PATH = join(homedir(), ".multicoderc");

export interface Worktree {
  id: string;
  path: string;
  branch: string;
  isMain: boolean;
}

export interface SavedTab {
  name: string;
  path: string;
  worktrees?: Worktree[];
  activeWorktreeId?: string;
  sessionId?: string; // Claude session ID for --resume
}

export interface Config {
  repoDirectory: string;
  claudePath?: string;
  openTabs?: SavedTab[];
  activeTabIndex?: number;
  worktreeBasePath?: string;
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): Config | null {
  if (!configExists()) {
    return null;
  }

  try {
    const content = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(content) as Config;
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function updateConfig(partial: Partial<Config>): void {
  const current = loadConfig() || { repoDirectory: "" };
  saveConfig({ ...current, ...partial });
}

export function detectClaudePath(): string | null {
  try {
    const result = execSync("which claude", { encoding: "utf-8" });
    return result.trim() || null;
  } catch {
    return null;
  }
}
