import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { TextAttributes } from "@opentui/core";
import { configExists, loadConfig } from "../config";
import { homeState } from "../homeState";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const router = useRouter();
  const config = loadConfig();
  const [activeProject, setActiveProject] = useState(homeState.getActiveProject());
  const displayName = activeProject.name || "Multicode";
  const displayPath = activeProject.path;

  useEffect(() => {
    // Auto-redirect zu Setup wenn keine Config existiert
    if (!configExists()) {
      router.navigate({ to: "/setup" });
    }
  }, []);

  useEffect(() => {
    return homeState.subscribe(() => {
      setActiveProject(homeState.getActiveProject());
    });
  }, []);

  return (
    <box alignItems="center" justifyContent="center" flexGrow={1}>
      <box flexDirection="column" justifyContent="center" alignItems="center" gap={1}>
        <ascii-font font="tiny" text={displayName} />
        {displayPath ? (
          <text attributes={TextAttributes.DIM}>
            {displayPath}
          </text>
        ) : config?.repoDirectory ? (
          <text attributes={TextAttributes.DIM}>
            Repo folder: {config.repoDirectory}
          </text>
        ) : (
          <text attributes={TextAttributes.DIM}>
            No repo folder configured
          </text>
        )}
        <box height={1} />
        <text attributes={TextAttributes.DIM}>
          Ctrl+O Open repo | 'c' Claude Code | Ctrl+S Setup | Ctrl+Q Quit
        </text>
      </box>
    </box>
  );
}
