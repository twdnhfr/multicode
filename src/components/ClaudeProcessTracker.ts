import { execSync } from "child_process";

export interface ClaudeProcess {
  pid: number;
  cwd: string;
}

export interface ClaudeStatusPerPath {
  hasProcess: boolean;
  isActive: boolean; // true wenn OTLP-Aktivität für diesen Pfad
  status: "running" | "idle";
}

type ProcessListener = (processes: Map<string, ClaudeProcess[]>) => void;

class ClaudeProcessTrackerService {
  private processes: Map<string, ClaudeProcess[]> = new Map(); // cwd -> processes
  private listeners: Set<ProcessListener> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private pollInterval = 3000; // 3 Sekunden

  getProcesses(): Map<string, ClaudeProcess[]> {
    return new Map(this.processes);
  }

  getProcessesForPath(path: string): ClaudeProcess[] {
    // Exakter Match oder Prefix-Match für Worktrees
    for (const [cwd, procs] of this.processes) {
      if (cwd === path || path.startsWith(cwd) || cwd.startsWith(path)) {
        return procs;
      }
    }
    return [];
  }

  hasProcessInPath(path: string): boolean {
    return this.getProcessesForPath(path).length > 0;
  }

  subscribe(listener: ProcessListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snapshot = this.getProcesses();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  start(): void {
    if (this.intervalId) return;

    // Sofort einmal ausführen
    this.poll();

    // Dann periodisch
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private poll(): void {
    try {
      // Finde alle Claude-Prozesse
      const pids = this.getClaudePids();
      const newProcesses = new Map<string, ClaudeProcess[]>();

      for (const pid of pids) {
        const cwd = this.getProcessCwd(pid);
        if (cwd) {
          const existing = newProcesses.get(cwd) || [];
          existing.push({ pid, cwd });
          newProcesses.set(cwd, existing);
        }
      }

      // Prüfe ob sich was geändert hat
      if (!this.mapsEqual(this.processes, newProcesses)) {
        this.processes = newProcesses;
        this.notify();
      }
    } catch {
      // Fehler ignorieren, nächstes Mal wieder versuchen
    }
  }

  private getClaudePids(): number[] {
    try {
      // pgrep findet alle Claude-Prozesse
      const result = execSync("pgrep -f 'claude' 2>/dev/null || true", {
        encoding: "utf-8",
        timeout: 2000,
      });

      return result
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => parseInt(line.trim(), 10))
        .filter((pid) => !isNaN(pid));
    } catch {
      return [];
    }
  }

  private getProcessCwd(pid: number): string | null {
    try {
      // lsof -p PID | grep cwd
      const result = execSync(`lsof -p ${pid} 2>/dev/null | grep cwd | awk '{print $9}'`, {
        encoding: "utf-8",
        timeout: 2000,
      });

      const cwd = result.trim();
      return cwd || null;
    } catch {
      return null;
    }
  }

  private mapsEqual(a: Map<string, ClaudeProcess[]>, b: Map<string, ClaudeProcess[]>): boolean {
    if (a.size !== b.size) return false;

    for (const [key, value] of a) {
      const other = b.get(key);
      if (!other) return false;
      if (value.length !== other.length) return false;

      const pidSetA = new Set(value.map((p) => p.pid));
      const pidSetB = new Set(other.map((p) => p.pid));
      for (const pid of pidSetA) {
        if (!pidSetB.has(pid)) return false;
      }
    }

    return true;
  }
}

// Singleton
export const claudeProcessTracker = new ClaudeProcessTrackerService();
