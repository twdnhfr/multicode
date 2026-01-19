type Listener = () => void;

interface ActiveProject {
  name: string | null;
  path: string | null;
}

let activeProject: ActiveProject = { name: null, path: null };
const listeners: Set<Listener> = new Set();

export const homeState = {
  getActiveProject: (): ActiveProject => activeProject,
  setActiveProject: (name: string | null, path: string | null) => {
    if (activeProject.name === name && activeProject.path === path) return;
    activeProject = { name, path };
    listeners.forEach((l) => l());
  },
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
