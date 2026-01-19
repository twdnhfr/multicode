# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Bun + React/OpenTUI app. Key areas: `src/routes/` (TanStack Router file routes), `src/components/` (TUI widgets), `src/config.ts` (persisted config in `~/.multicoderc`).
- `assets/` holds static images (e.g., `assets/app.png`).
- `pty-helper.mjs` is a Node helper for PTY handling.

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run dev`: generate routes and start the app in watch mode.
- `bun run start`: run the app once (no watch).
- `bun run generate-routes`: regenerate `src/routeTree.gen.ts`.
- `bun run typecheck`: TypeScript checks (`tsc --noEmit`).
- `bun run lint` / `bun run lint:fix`: ESLint checks and autofix.

## Coding Style & Naming Conventions
- TypeScript + React (`.ts`/`.tsx`) with ESLint (`eslint.config.js`).
- Follow existing naming: `PascalCase` for components, `camelCase` for functions/vars, `kebab-case` for file names in `assets/`.
- Keep OpenTUI constraints in mind: avoid nested `<text>` elements and emojis in dynamic content (see `CLAUDE.md`).

## Testing Guidelines
- No automated test framework is configured yet.
- If you add tests, place them under `src/` and document the runner in `package.json` scripts.

## Commit & Pull Request Guidelines
- Commit history uses short, imperative messages (e.g., `Update README.md`, `Improve tab persistence`) or version bumps (e.g., `0.0.2`). Follow that style.
- PRs should include a clear description, link relevant issues, and add a screenshot or TUI recording for UI changes.
- Run `bun run lint` and `bun run typecheck` before requesting review.

## Configuration & Runtime Notes
- User config lives at `~/.multicoderc` (paths, tabs, sessions).
- Route generation is required after adding new files in `src/routes/`.
