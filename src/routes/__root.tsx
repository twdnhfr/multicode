import { useState, useEffect, useCallback, useRef } from "react";
import { createRootRoute, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useKeyboard } from "@opentui/react";
import { DialogProvider, useDialog, useDialogState } from "@opentui-ui/dialog/react";
import { Toaster, toast } from "@opentui-ui/toast/react";
import { RepoFinder } from "../components/RepoFinder";
import { FileTree } from "../components/FileTree";
import { FileSearch } from "../components/FileSearch";
import { TabBar, type Tab } from "../components/TabBar";
import { Terminal, type TerminalHandle } from "../components/Terminal";
import { ScriptBar, type ScriptStatus } from "../components/ScriptBar";
import { WorktreeBar } from "../components/WorktreeBar";
import { WorktreeDialog } from "../components/WorktreeDialog";
import { CloseWorktreeDialog } from "../components/CloseWorktreeDialog";
import {
  listWorktrees,
  getSyncStatus,
  removeWorktree,
  type SyncStatus,
} from "../components/WorktreeManager";
import { loadConfig, updateConfig } from "../config";
import type { Worktree } from "../config";
import { join } from "path";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { spawn, type ChildProcess } from "child_process";
import { homedir } from "os";
import { otlpReceiver, type OTLPData } from "../components/OTLPReceiver";

// Erkennt den Package Manager und prüft ob Scripts existieren
function getProjectScriptInfo(repoPath: string): {
  packageManager: string;
  hasDevScript: boolean;
  hasBuildScript: boolean;
} {
  const result = { packageManager: "npm", hasDevScript: false, hasBuildScript: false };

  // Package Manager erkennen
  if (existsSync(join(repoPath, "bun.lockb")) || existsSync(join(repoPath, "bun.lock"))) {
    result.packageManager = "bun";
  } else if (existsSync(join(repoPath, "pnpm-lock.yaml"))) {
    result.packageManager = "pnpm";
  } else if (existsSync(join(repoPath, "yarn.lock"))) {
    result.packageManager = "yarn";
  }

  // Scripts prüfen
  const packageJsonPath = join(repoPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      result.hasDevScript = !!pkg.scripts?.dev;
      result.hasBuildScript = !!pkg.scripts?.build;
    } catch {
      // Ignore parse errors
    }
  }

  return result;
}

type FocusArea = "projectTabs" | "worktreeTabs" | "tree" | "terminal";

function RootLayout() {
  const router = useRouter();
  const dialog = useDialog();
  const isDialogOpen = useDialogState((s) => s.isOpen);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  // Tab-State - initialisiert aus Config
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const config = loadConfig();
    if (config?.openTabs && config.openTabs.length > 0) {
      return config.openTabs.map((t, i) => {
        // Worktrees aus Config laden oder vom Repo
        const worktrees = t.worktrees || listWorktrees(t.path);
        const mainWorktree = worktrees.find((wt) => wt.isMain) || worktrees[0];

        return {
          id: `restored-${i}`,
          name: t.name,
          path: t.path,
          isTerminalOpen: false,
          worktrees: worktrees.length > 0 ? worktrees : [{
            id: "main",
            path: t.path,
            branch: "main",
            isMain: true,
          }],
          activeWorktreeId: t.activeWorktreeId || mainWorktree?.id || "main",
          sessionId: t.sessionId, // Restore Claude session ID
        };
      });
    }
    return [];
  });

  const [activeTabIndex, setActiveTabIndex] = useState(() => {
    const config = loadConfig();
    return config?.activeTabIndex ?? 0;
  });

  // Fokus State (global, nicht pro Tab)
  const [focusArea, setFocusArea] = useState<FocusArea>("tree");

  // Hidden files toggle (Standard: eingeblendet)
  const [showHidden, setShowHidden] = useState(true);

  // Navigation zu Datei (von FileSearch)
  const [navigateToPath, setNavigateToPath] = useState<string | null>(null);

  // Worktree Sync-Status Cache
  const [worktreeSyncStatuses, setWorktreeSyncStatuses] = useState<
    Map<string, Map<string, SyncStatus>>
  >(new Map());

  // Refs für Terminal-Handles (um Keys zu senden)
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map());

  // Hintergrund-Prozesse für Scripts (pro Tab)
  const scriptProcesses = useRef<Map<string, ChildProcess>>(new Map());
  const [runningScripts, setRunningScripts] = useState<Map<string, Set<string>>>(new Map());
  // Status für einmalige Scripts (build, test, etc.)
  const [scriptStatuses, setScriptStatuses] = useState<Map<string, Map<string, ScriptStatus>>>(new Map());

  // OTLP Receiver State - starts automatically
  const [otlpRunning, setOtlpRunning] = useState(() => {
    if (!otlpReceiver.isRunning()) {
      otlpReceiver.start();
    }
    return otlpReceiver.isRunning();
  });
  const [otlpData, setOtlpData] = useState<OTLPData | null>(otlpReceiver.getData());

  // Subscribe to OTLP data changes
  useEffect(() => {
    const unsubscribe = otlpReceiver.subscribe((data) => {
      setOtlpData(data);
    });
    return unsubscribe;
  }, []);

  // Auto-start Claude on app launch if active tab has existing session
  useEffect(() => {
    const initialTab = tabs[activeTabIndex];
    if (initialTab?.sessionId && !initialTab.isTerminalOpen) {
      setTabs((prev) =>
        prev.map((tab, i) => (i === activeTabIndex ? { ...tab, isTerminalOpen: true } : tab))
      );
      setFocusArea("terminal");
    }
  }, []); // Empty deps = run once on mount

  const config = loadConfig();
  const activeTab = tabs[activeTabIndex];
  const activeRepoPath = activeTab?.path ?? null;
  const isTerminalOpen = activeTab?.isTerminalOpen ?? false;

  const activeWorktree = activeTab?.worktrees.find(
    (wt) => wt.id === activeTab.activeWorktreeId
  );
  const activeWorktreePath = activeWorktree?.path ?? activeRepoPath;

  // Tabs in Config speichern wenn sie sich ändern
  useEffect(() => {
    const openTabs = tabs.map((t) => ({
      name: t.name,
      path: t.path,
      worktrees: t.worktrees,
      activeWorktreeId: t.activeWorktreeId,
      sessionId: t.sessionId, // Persist Claude session ID
    }));
    updateConfig({ openTabs, activeTabIndex });
  }, [tabs, activeTabIndex]);

  // Sync-Status für Worktrees periodisch aktualisieren
  useEffect(() => {
    function updateSyncStatuses() {
      const newStatuses = new Map<string, Map<string, SyncStatus>>();

      for (const tab of tabs) {
        const tabStatuses = new Map<string, SyncStatus>();
        for (const wt of tab.worktrees) {
          tabStatuses.set(wt.id, getSyncStatus(wt.path));
        }
        newStatuses.set(tab.id, tabStatuses);
      }

      setWorktreeSyncStatuses(newStatuses);
    }

    updateSyncStatuses();
    const interval = setInterval(updateSyncStatuses, 30000); // Alle 30 Sekunden

    return () => clearInterval(interval);
  }, [tabs]);

  // Helper: Tab aktualisieren
  const updateTab = useCallback((index: number, updates: Partial<Tab>) => {
    setTabs((prev) =>
      prev.map((tab, i) => (i === index ? { ...tab, ...updates } : tab))
    );
  }, []);

  async function openRepoFinder() {
    if (!config?.repoDirectory) {
      toast.error("No repository folder configured", {
        description: "Press 's' for Setup",
      });
      return;
    }

    const selectedRepo = await dialog.prompt<string>({
      content: (ctx) => (
        <RepoFinder {...ctx} repoDirectory={config.repoDirectory} />
      ),
      size: "medium",
    });

    if (selectedRepo) {
      // Prüfe ob Repo schon offen ist
      const existingIndex = tabs.findIndex((t) => t.name === selectedRepo);
      if (existingIndex >= 0) {
        // Wechsle zu bestehendem Tab
        setActiveTabIndex(existingIndex);
        toast.info(`${selectedRepo}`, {
          description: "Tab already open",
        });
      } else {
        // Neuen Tab hinzufügen
        const repoFullPath = join(config.repoDirectory, selectedRepo);
        const worktrees = listWorktrees(repoFullPath);
        const mainWorktree = worktrees.find((wt) => wt.isMain) || {
          id: "main",
          path: repoFullPath,
          branch: "main",
          isMain: true,
        };

        const newTab: Tab = {
          id: `${Date.now()}`,
          name: selectedRepo,
          path: repoFullPath,
          isTerminalOpen: false,
          worktrees: worktrees.length > 0 ? worktrees : [mainWorktree],
          activeWorktreeId: mainWorktree.id,
        };
        setTabs((prev) => [...prev, newTab]);
        setActiveTabIndex(tabs.length); // Zum neuen Tab wechseln
        toast.success(`${selectedRepo}`, {
          description: "Opened in new tab",
        });
      }
    }
  }

  function closeActiveTab() {
    if (tabs.length === 0) return;

    const closingTab = tabs[activeTabIndex];

    // Alle Script-Prozesse für diesen Tab beenden
    if (closingTab) {
      const processKey = `${closingTab.id}:dev`;
      const proc = scriptProcesses.current.get(processKey);
      if (proc) {
        proc.kill();
        scriptProcesses.current.delete(processKey);
      }

      setRunningScripts((prev) => {
        const next = new Map(prev);
        next.delete(closingTab.id);
        return next;
      });
    }

    const newTabs = tabs.filter((_, i) => i !== activeTabIndex);
    setTabs(newTabs);

    // Aktiven Index anpassen
    if (activeTabIndex >= newTabs.length) {
      setActiveTabIndex(Math.max(0, newTabs.length - 1));
    }

    toast("Tab closed");
  }

  function switchToTab(index: number) {
    const targetTab = tabs[index];
    if (index >= 0 && index < tabs.length && targetTab) {
      setActiveTabIndex(index);

      // Auto-start Claude if tab has existing session but terminal is closed
      // Keep focus on tabs, don't switch to terminal
      if (targetTab.sessionId && !targetTab.isTerminalOpen) {
        // Use setTimeout to ensure state update happens first
        setTimeout(() => {
          setTabs((prev) =>
            prev.map((tab, i) => (i === index ? { ...tab, isTerminalOpen: true } : tab))
          );
        }, 0);
      }
    }
  }

  function switchToWorktree(worktreeId: string) {
    if (!activeTab) return;
    updateTab(activeTabIndex, { activeWorktreeId: worktreeId });
  }

  async function openWorktreeDialog() {
    if (!activeTab || !config?.worktreeBasePath) {
      toast.error("No project open or worktree path not configured", {
        description: "Configure the worktree path in settings (Ctrl+S)",
      });
      return;
    }

    const result = await dialog.prompt<Worktree | null>({
      content: (ctx) => (
        <WorktreeDialog
          projectName={activeTab.name}
          repoPath={activeTab.path}
          worktreeBasePath={config.worktreeBasePath!}
          onSelect={(wt) => ctx.resolve(wt)}
          onCancel={() => ctx.resolve(null)}
          onWorktreesChanged={(wts) => {
            updateTab(activeTabIndex, { worktrees: wts });
          }}
        />
      ),
      size: "medium",
    });

    if (result) {
      switchToWorktree(result.id);
    }
  }

  async function closeWorktreeTab() {
    if (!activeTab || !activeWorktree) return;

    // Main-Branch Tab kann nicht geschlossen werden
    if (activeWorktree.isMain) {
      // Stattdessen ganzen Projekt-Tab schließen
      closeActiveTab();
      return;
    }

    const result = await dialog.prompt<"close" | "delete" | null>({
      content: (ctx) => (
        <CloseWorktreeDialog
          branchName={activeWorktree.branch}
          onCloseTab={() => ctx.resolve("close")}
          onDeleteWorktree={() => ctx.resolve("delete")}
          onCancel={() => ctx.resolve(null)}
        />
      ),
      size: "small",
    });

    if (!result) return;

    if (result === "delete") {
      try {
        removeWorktree(activeTab.path, activeWorktree.path);
      } catch (e) {
        toast.error("Error deleting", {
          description: e instanceof Error ? e.message : "Unknown",
        });
        return;
      }
    }

    // Tab aus Liste entfernen und zum Main wechseln
    const newWorktrees = activeTab.worktrees.filter((wt) => wt.id !== activeWorktree.id);
    const mainWorktree = newWorktrees.find((wt) => wt.isMain) || newWorktrees[0];
    updateTab(activeTabIndex, {
      worktrees: newWorktrees,
      activeWorktreeId: mainWorktree?.id || "main",
    });

    toast(result === "delete" ? "Worktree deleted" : "Tab closed");
  }

  function openClaudeCode() {
    const currentTab = tabs[activeTabIndex];
    if (!activeRepoPath || !currentTab) {
      toast.error("No project open");
      return;
    }

    // Generate new session ID if tab doesn't have one
    // isNewSession tracks whether we need --session-id (new) or --resume (existing)
    const isNewSession = !currentTab.sessionId;
    const sessionId = currentTab.sessionId || crypto.randomUUID();

    updateTab(activeTabIndex, { isTerminalOpen: true, sessionId, isNewSession });
    setFocusArea("terminal");
  }

  function toggleDevScript() {
    if (!activeTab || !activeRepoPath) {
      toast.error("No project open");
      return;
    }

    const processKey = `${activeTab.id}:dev`;
    const existingProcess = scriptProcesses.current.get(processKey);

    if (existingProcess) {
      // Prozess beenden
      existingProcess.kill();
      scriptProcesses.current.delete(processKey);

      setRunningScripts((prev) => {
        const next = new Map(prev);
        const tabScripts = new Set(next.get(activeTab.id) || []);
        tabScripts.delete("dev");
        if (tabScripts.size === 0) {
          next.delete(activeTab.id);
        } else {
          next.set(activeTab.id, tabScripts);
        }
        return next;
      });

      toast("Dev server stopped");
      return;
    }

    // Prüfen ob dev script existiert
    const { packageManager, hasDevScript } = getProjectScriptInfo(activeRepoPath);
    if (!hasDevScript) {
      toast.error("No 'dev' script found");
      return;
    }

    // Prozess starten
    const proc = spawn(packageManager, ["run", "dev"], {
      cwd: activeRepoPath,
      stdio: "ignore",
      detached: false,
    });

    scriptProcesses.current.set(processKey, proc);

    setRunningScripts((prev) => {
      const next = new Map(prev);
      const tabScripts = new Set(next.get(activeTab.id) || []);
      tabScripts.add("dev");
      next.set(activeTab.id, tabScripts);
      return next;
    });

    proc.on("exit", () => {
      scriptProcesses.current.delete(processKey);
      setRunningScripts((prev) => {
        const next = new Map(prev);
        const tabScripts = new Set(next.get(activeTab.id) || []);
        tabScripts.delete("dev");
        if (tabScripts.size === 0) {
          next.delete(activeTab.id);
        } else {
          next.set(activeTab.id, tabScripts);
        }
        return next;
      });
    });

    toast.success("Dev server started", {
      description: `${packageManager} run dev`,
    });
  }

  function runBuildScript() {
    if (!activeTab || !activeRepoPath) {
      toast.error("No project open");
      return;
    }

    // Prüfen ob build script existiert
    const { packageManager, hasBuildScript } = getProjectScriptInfo(activeRepoPath);
    if (!hasBuildScript) {
      toast.error("No 'build' script found");
      return;
    }

    // Status auf "running" setzen
    setScriptStatuses((prev) => {
      const next = new Map(prev);
      const tabStatuses = new Map(next.get(activeTab.id) || []);
      tabStatuses.set("build", "running");
      next.set(activeTab.id, tabStatuses);
      return next;
    });

    toast("Build started...", {
      description: `${packageManager} run build`,
    });

    // Prozess starten
    const proc = spawn(packageManager, ["run", "build"], {
      cwd: activeRepoPath,
      stdio: "ignore",
      detached: false,
    });

    proc.on("exit", (code) => {
      const status: ScriptStatus = code === 0 ? "success" : "error";

      setScriptStatuses((prev) => {
        const next = new Map(prev);
        const tabStatuses = new Map(next.get(activeTab.id) || []);
        tabStatuses.set("build", status);
        next.set(activeTab.id, tabStatuses);
        return next;
      });

      if (code === 0) {
        toast.success("Build successful!");
      } else {
        toast.error("Build failed", {
          description: `Exit code: ${code}`,
        });
      }
    });

    proc.on("error", () => {
      setScriptStatuses((prev) => {
        const next = new Map(prev);
        const tabStatuses = new Map(next.get(activeTab.id) || []);
        tabStatuses.set("build", "error");
        next.set(activeTab.id, tabStatuses);
        return next;
      });

      toast.error("Build failed");
    });
  }

  function toggleHiddenFiles() {
    setShowHidden((prev) => !prev);
    toast(showHidden ? "Hidden files hidden" : "Hidden files shown");
  }

  function toggleOTLP() {
    if (otlpRunning) {
      otlpReceiver.stop();
      setOtlpRunning(false);
      toast("OTLP receiver stopped");
    } else {
      const success = otlpReceiver.start();
      if (success) {
        setOtlpRunning(true);
        toast.success(`OTLP receiver started on port ${otlpReceiver.getPort()}`);
      } else {
        toast.error("Failed to start OTLP receiver");
      }
    }
  }

  async function openFileSearch() {
    if (!activeRepoPath) {
      toast.error("No project open");
      return;
    }

    const selectedFile = await dialog.prompt<string>({
      content: (ctx) => <FileSearch {...ctx} rootPath={activeRepoPath} />,
      size: "medium",
    });

    if (selectedFile) {
      setNavigateToPath(selectedFile);
      setFocusArea("tree");
    }
  }

  // Prüfe ob wir auf der Home-Route sind (nicht auf Setup)
  const isOnHomeRoute = !currentPath || currentPath === "/" || !currentPath.startsWith("/setup");

  useKeyboard((key) => {
    // === GLOBALE HOTKEYS (funktionieren IMMER, auch bei offenem Terminal) ===
    if (key.ctrl) {
      // Ctrl+Q: Beenden
      if (key.name === "q") {
        process.exit(0);
      }
      // Ctrl+S: Setup
      if (key.name === "s") {
        router.navigate({ to: "/setup" });
        return;
      }
      // Ctrl+O: Repo öffnen
      if (key.name === "o") {
        openRepoFinder();
        return;
      }
    }

    // Tab zum Fokus-Wechsel zwischen Ebenen (nur ohne Shift)
    if (key.name === "tab" && !key.shift && !isDialogOpen && isOnHomeRoute) {
      setFocusArea((prev) => {
        if (isTerminalOpen) {
          // Mit Terminal: projectTabs → worktreeTabs → tree → terminal → projectTabs
          if (prev === "projectTabs") return "worktreeTabs";
          if (prev === "worktreeTabs") return "tree";
          if (prev === "tree") return "terminal";
          if (prev === "terminal") return "projectTabs";
          return "tree";
        } else {
          // Ohne Terminal: projectTabs → worktreeTabs → tree → projectTabs
          if (prev === "projectTabs") return "worktreeTabs";
          if (prev === "worktreeTabs") return "tree";
          if (prev === "tree") return "projectTabs";
          return "tree";
        }
      });
      return;
    }

    // Wenn Terminal fokussiert ist, Keys ans Terminal weiterleiten
    if (focusArea === "terminal" && isTerminalOpen && activeTab && isOnHomeRoute) {
      const terminalHandle = terminalRefs.current.get(activeTab.id);
      terminalHandle?.sendKey(key);
      return;
    }

    // Ignoriere restliche Tastenkürzel wenn ein Dialog offen ist oder nicht auf Home
    if (isDialogOpen || !isOnHomeRoute) return;

    // Tab schließen mit 'x'
    if (key.name === "x" && tabs.length > 0) {
      if (focusArea === "worktreeTabs" && activeWorktree && !activeWorktree.isMain) {
        closeWorktreeTab();
      } else {
        closeActiveTab();
      }
    }
    // 1-9 für Tab/Worktree-Wechsel basierend auf Fokus
    if (!key.ctrl && key.name >= "1" && key.name <= "9") {
      const index = parseInt(key.name, 10) - 1;

      if (focusArea === "worktreeTabs" && activeTab) {
        // Worktree wechseln wenn Worktree-Tabs fokussiert
        const worktree = activeTab.worktrees[index];
        if (worktree) {
          switchToWorktree(worktree.id);
        }
      } else if (focusArea === "projectTabs") {
        // Projekt-Tab wechseln wenn Projekt-Tabs fokussiert
        switchToTab(index);
      }
    }
    // Claude Code öffnen mit 'c'
    if (key.name === "c" && !isTerminalOpen) {
      openClaudeCode();
    }
    // Dev Script toggle mit 'd'
    if (key.name === "d") {
      toggleDevScript();
    }
    // Build Script mit 'b'
    if (key.name === "b") {
      runBuildScript();
    }
    // File Search mit 'f'
    if (key.name === "f") {
      openFileSearch();
    }
    // Hidden Files Toggle mit 'h'
    if (key.name === "h") {
      toggleHiddenFiles();
    }
    // Worktree Dialog mit 'w'
    if (key.name === "w") {
      openWorktreeDialog();
    }
    // OTLP Receiver Toggle mit 't'
    if (key.name === "t") {
      toggleOTLP();
    }
  });

  // Tree grün wenn fokussiert UND auf Home-Route
  const treeBorderColor = focusArea === "tree" && isOnHomeRoute ? "#22c55e" : undefined;
  const terminalBorderColor = focusArea === "terminal" && isTerminalOpen && isOnHomeRoute ? "#22c55e" : undefined;

  // Höhe für FileTree berechnen (Terminal-Höhe minus TabBar, WorktreeBar, ScriptBar, Borders)
  const terminalRows = process.stdout.rows || 40;
  const hasWorktreeBar = activeTab && activeTab.worktrees.length > 0;
  const treeHeight = terminalRows - (tabs.length > 0 ? 2 : 0) - (hasWorktreeBar ? 2 : 0) - 3; // TabBar + WorktreeBar + ScriptBar + Borders

  return (
    <box flexGrow={1} flexDirection="column">
      {/* Tab-Leiste wenn Tabs offen */}
      {tabs.length > 0 && (
        <TabBar
          tabs={tabs}
          activeIndex={activeTabIndex}
          isFocused={focusArea === "projectTabs"}
          otlpData={otlpData}
          otlpRunning={otlpRunning}
        />
      )}

      {/* Worktree-Leiste wenn Projekt aktiv */}
      {activeTab && activeTab.worktrees.length > 0 && (
        <WorktreeBar
          worktrees={activeTab.worktrees}
          activeWorktreeId={activeTab.activeWorktreeId}
          syncStatuses={worktreeSyncStatuses.get(activeTab.id)}
          isFocused={focusArea === "worktreeTabs"}
          otlpData={otlpData}
          otlpRunning={otlpRunning}
          tabSessionId={activeTab.sessionId}
        />
      )}

      {/* Hauptbereich */}
      <box flexGrow={1} flexDirection="row">
        {/* Sidebar mit FileTree wenn Repo aktiv */}
        {activeRepoPath && (
          <box
            flexDirection="column"
            borderStyle="single"
            border={true}
            borderColor={treeBorderColor}
          >
            <FileTree
              rootPath={activeWorktreePath || activeRepoPath}
              width={30}
              height={treeHeight}
              isActive={!isDialogOpen && focusArea === "tree" && isOnHomeRoute}
              showHidden={showHidden}
              navigateToPath={navigateToPath}
              onNavigated={() => setNavigateToPath(null)}
            />
          </box>
        )}

        {/* Content-Bereich */}
        <box flexGrow={1} flexDirection="column">
          {/* Terminal-Bereich mit grünem Rahmen (wenn Terminal offen) */}
          {isTerminalOpen && (
            <box flexGrow={1} borderStyle="single" borderColor={terminalBorderColor} />
          )}

          {/* Outlet: normal wenn kein Terminal */}
          {!isTerminalOpen && <Outlet />}
        </box>
      </box>

      {/* Script-Leiste am unteren Rand (nur auf Home-Route) */}
      {isOnHomeRoute && (
        <ScriptBar
          repoPath={activeRepoPath}
          runningScripts={activeTab ? runningScripts.get(activeTab.id) : undefined}
          scriptStatuses={activeTab ? scriptStatuses.get(activeTab.id) : undefined}
          otlpRunning={otlpRunning}
          otlpPort={otlpReceiver.getPort()}
          otlpData={otlpData}
        />
      )}

      {/* Outlet off-screen wenn Terminal offen - damit Setup etc. weiterhin mounted sind */}
      {isTerminalOpen && (
        <box position="absolute" top={-9999} left={-9999}>
          <Outlet />
        </box>
      )}

      {/* ALLE Terminals in einem Container - stabile Position im React-Tree */}
      {tabs.map((tab, index) => {
        if (!tab.isTerminalOpen) return null;

        const isActiveTab = index === activeTabIndex;
        // Top-Position: TabBar (2) + WorktreeBar (2) + 1 = 5
        const terminalTop = hasWorktreeBar ? 5 : 3;

        // Alle Terminals gleiche Größe, nur Position ändert sich
        return (
          <box
            key={tab.id}
            position="absolute"
            top={isActiveTab ? terminalTop : -9999}
            left={isActiveTab ? 33 : -9999}
            right={2}
            bottom={4}
          >
            <Terminal
              ref={(handle) => {
                if (handle) {
                  terminalRefs.current.set(tab.id, handle);
                } else {
                  terminalRefs.current.delete(tab.id);
                }
              }}
              cwd={tab.worktrees.find((wt) => wt.id === tab.activeWorktreeId)?.path || tab.path}
              command={config?.claudePath || "claude"}
              args={tab.sessionId ? [tab.isNewSession ? "--session-id" : "--resume", tab.sessionId] : []}
              onExit={() => {
                // Check if session was updated by pty-helper fallback
                const sessionUpdatePath = join(homedir(), ".multicode", "session-update.json");
                try {
                  if (existsSync(sessionUpdatePath)) {
                    const update = JSON.parse(readFileSync(sessionUpdatePath, "utf-8"));
                    // Check if this update is for our session (within last 30 seconds)
                    if (update.oldSessionId === tab.sessionId && Date.now() - update.timestamp < 30000) {
                      // Update to the new session ID
                      updateTab(index, { isTerminalOpen: false, isNewSession: false, sessionId: update.newSessionId });
                      // Clean up the file
                      try { unlinkSync(sessionUpdatePath); } catch {}
                      terminalRefs.current.delete(tab.id);
                      if (isActiveTab) setFocusArea("tree");
                      toast(isActiveTab ? "Claude Code exited" : `Claude Code exited (${tab.name})`);
                      return;
                    }
                  }
                } catch {}

                // Session was created, next time use --resume
                updateTab(index, { isTerminalOpen: false, isNewSession: false });
                terminalRefs.current.delete(tab.id);
                if (isActiveTab) {
                  setFocusArea("tree");
                }
                toast(isActiveTab ? "Claude Code exited" : `Claude Code exited (${tab.name})`);
              }}
            />
          </box>
        );
      })}
    </box>
  );
}

function RootComponent() {
  return (
    <DialogProvider>
      <Toaster position="bottom-right" />
      <RootLayout />
    </DialogProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
