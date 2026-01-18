# Multicode

A terminal UI for managing multiple Git repositories with integrated Claude Code support. Work on several projects simultaneously, each with its own Claude Code session, git worktrees, and persistent conversation history.

## Features

- **Multi-Project Tabs** - Open multiple repositories as tabs, switch instantly with `1-9` keys
- **Embedded Claude Code** - Full Claude Code terminal per project with session persistence
- **Git Worktree Management** - Create, switch, and manage worktrees without leaving the app
- **Session Resume** - Claude conversations persist across restarts via `--resume`
- **Activity Indicators** - See which tab has active Claude thinking/tool execution
- **Script Runner** - Quick access to `dev` and `build` scripts per project

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/multicode.git
cd multicode

# Install dependencies
bun install

# Run
bun dev
```

## First Run

On first launch, press `Ctrl+S` to open setup:
1. Set your **repository folder** (e.g., `~/projects`)
2. Set your **worktree base path** (where new worktrees are created)
3. Claude CLI path is auto-detected

## Keyboard Shortcuts

### Global
| Key | Action |
|-----|--------|
| `Ctrl+O` | Open repository picker |
| `Ctrl+S` | Open setup |
| `Ctrl+Q` | Quit |
| `Tab` | Cycle focus between areas |
| `1-9` | Switch to tab/worktree by number |

### When focused on Tabs
| Key | Action |
|-----|--------|
| `x` | Close current tab |
| `c` | Open Claude Code |

### When focused on Worktrees
| Key | Action |
|-----|--------|
| `w` | Open worktree manager |

### When focused on File Tree
| Key | Action |
|-----|--------|
| `↑/↓` | Navigate |
| `Enter` | Expand/collapse folder |
| `Ctrl+F` | File search |
| `.` | Toggle hidden files |

### When focused on Terminal
| Key | Action |
|-----|--------|
| `Escape` | Return focus to file tree |

## Layout

```
┌─[1:project-a]─[2:project-b]─[3:project-c]────────────────────────┐
├─[1:main↑0↓0]─[2:feature-x↑2↓0]───────────────────────────────────┤
│ 📁 project-a    │                                                │
│ ├── src/        │   Claude Code Terminal                         │
│ ├── tests/      │                                                │
│ └── ...         │   > How can I help you today?                  │
│                 │                                                │
├─────────────────┴────────────────────────────────────────────────┤
│ [t] OTLP:4319 │ Scripts: [d] dev [b] build                       │
└──────────────────────────────────────────────────────────────────┘
```

## Session Persistence

Multicode automatically saves and restores:
- Open tabs and their repositories
- Active worktree per tab
- Claude session IDs for conversation resume
- Last active tab

Sessions are stored in `~/.multicoderc`.

## How It Works

### Claude Integration
Each tab maintains its own Claude session ID. When you open Claude Code:
- First time: Creates new session with `--session-id`
- Subsequent opens: Resumes with `--resume`
- If session expired: Automatically creates new session

### OTLP Telemetry
Multicode runs an OTLP receiver on port 4319 to receive telemetry from Claude Code. This enables:
- Real-time activity indicators (⚡ for tools, ◉ for thinking)
- Session ID matching to show status on correct tab

### Git Worktrees
Create isolated worktrees for parallel development:
1. Focus worktree bar and press `w`
2. Enter branch name
3. New worktree is created and switched to

Each worktree shows sync status (`↑ahead ↓behind`).

## Requirements

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/code) CLI installed
- Git

## Configuration

Config file: `~/.multicoderc`

```json
{
  "repoDirectory": "/Users/you/projects",
  "claudePath": "/usr/local/bin/claude",
  "worktreeBasePath": "/Users/you/worktrees",
  "openTabs": [...],
  "activeTabIndex": 0
}
```

## License

MIT
