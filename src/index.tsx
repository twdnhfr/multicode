#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import {
  RouterProvider,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Memory history für Terminal-Umgebung (kein Browser)
const memoryHistory = createMemoryHistory({
  initialEntries: ["/"],
});

const router = createRouter({
  routeTree,
  history: memoryHistory,
});

// TypeScript: Router-Typen registrieren
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return <RouterProvider router={router} />;
}

const renderer = await createCliRenderer();
await router.load();
createRoot(renderer).render(<App />);
