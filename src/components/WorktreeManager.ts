import { execSync } from "child_process";
import { existsSync, readdirSync, mkdirSync, copyFileSync } from "fs";
import { join, basename } from "path";
import type { Worktree } from "../config";

export interface SyncStatus {
  ahead: number;
  behind: number;
}

/**
 * Listet alle Git Worktrees eines Repositories
 */
export function listWorktrees(repoPath: string): Worktree[] {
  try {
    const output = execSync("git worktree list --porcelain", {
      cwd: repoPath,
      encoding: "utf-8",
    });

    const worktrees: Worktree[] = [];
    let current: Partial<Worktree> = {};

    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        current.path = line.slice(9);
      } else if (line.startsWith("branch refs/heads/")) {
        current.branch = line.slice(18);
      } else if (line === "") {
        if (current.path && current.branch) {
          worktrees.push({
            id: current.path === repoPath ? "main" : `wt-${basename(current.path)}`,
            path: current.path,
            branch: current.branch,
            isMain: current.path === repoPath,
          });
        }
        current = {};
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Generiert den nächsten freien Worktree-Pfad
 */
export function getNextWorktreePath(projectName: string, basePath: string): string {
  if (!existsSync(basePath)) {
    mkdirSync(basePath, { recursive: true });
  }

  const existing = readdirSync(basePath)
    .filter((name) => name.startsWith(`${projectName}_`))
    .map((name) => {
      const suffix = name.split("_").pop();
      return parseInt(suffix || "0", 10);
    })
    .filter((n) => !isNaN(n));

  const next = Math.max(0, ...existing) + 1;
  const suffix = next.toString().padStart(3, "0");

  return join(basePath, `${projectName}_${suffix}`);
}

/**
 * Generiert einen zufälligen Branch-Namen
 */
export function generateBranchName(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const suffix = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `worktree-${suffix}`;
}

/**
 * Erstellt einen neuen Worktree
 */
export function createWorktree(
  repoPath: string,
  worktreePath: string,
  branchName: string
): void {
  execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
    cwd: repoPath,
    encoding: "utf-8",
  });

  const exampleEnvPath = join(worktreePath, ".env.example");
  const envPath = join(worktreePath, ".env");
  if (existsSync(exampleEnvPath) && !existsSync(envPath)) {
    copyFileSync(exampleEnvPath, envPath);
  }
}

/**
 * Entfernt einen Worktree
 */
export function removeWorktree(repoPath: string, worktreePath: string): void {
  execSync(`git worktree remove "${worktreePath}" --force`, {
    cwd: repoPath,
    encoding: "utf-8",
  });
}

/**
 * Benennt einen Branch um
 */
export function renameBranch(
  worktreePath: string,
  oldName: string,
  newName: string
): void {
  execSync(`git branch -m "${oldName}" "${newName}"`, {
    cwd: worktreePath,
    encoding: "utf-8",
  });
}

/**
 * Ermittelt den Sync-Status (ahead/behind) eines Branches
 */
export function getSyncStatus(worktreePath: string): SyncStatus {
  try {
    const output = execSync(
      'git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || echo "0 0"',
      {
        cwd: worktreePath,
        encoding: "utf-8",
      }
    );

    const [behind, ahead] = output.trim().split(/\s+/).map(Number);
    return { ahead: ahead || 0, behind: behind || 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

/**
 * Prüft ob ein Verzeichnis ein Git-Repository ist
 */
export function isGitRepository(path: string): boolean {
  try {
    execSync("git rev-parse --git-dir", {
      cwd: path,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}
