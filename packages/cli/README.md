# @dustinbyrne/kb

AI-orchestrated task board CLI. Create tasks, and let AI agents specify, execute, and deliver them — powered by [pi](https://github.com/badlogic/pi-mono).

## What it does

kb is a kanban-style task board where AI does the heavy lifting. Toss in a rough idea and the AI engine writes a full specification, resolves dependencies, executes the work in isolated git worktrees, and hands you the result to review and merge.

Tasks flow through five columns: **Triage → Todo → In Progress → In Review → Done**.

## Installation

```bash
npm install -g @dustinbyrne/kb
```

## Prerequisites

kb uses [pi](https://github.com/badlogic/pi-mono) agent sessions under the hood. You need:

1. **Install pi:** `npm install -g @mariozechner/pi-coding-agent`
2. **Authenticate:** Run `pi` and use `/login`, or set the `ANTHROPIC_API_KEY` environment variable

kb reuses your existing pi authentication — no separate setup needed.

## Usage

### Start the dashboard

Launch the web UI and AI engine:

```bash
kb dashboard
kb dashboard --port 8080
```

### Create a task

```bash
kb task create "Fix the login redirect bug"
kb task create "Update hero section" --attach screenshot.png --attach design.pdf
```

### Manage tasks

```bash
kb task list                        # List all tasks
kb task show KB-001                 # Show task details, steps, and log
kb task move KB-001 todo            # Move a task to a column
kb task merge KB-001                # Merge an in-review task and close it
kb task log KB-001 "Added context"  # Add a log entry
kb task pause KB-001                # Pause a task (stops automation)
kb task unpause KB-001              # Resume a paused task
kb task attach KB-001 ./error.log   # Attach a file to a task
```

### Typical workflow

```bash
# 1. Create a task — it lands in triage
kb task create "Add dark mode support"

# 2. Start the dashboard — AI specs the task and begins working
kb dashboard

# 3. Check progress
kb task list
kb task show KB-042

# 4. When it reaches "in-review", review the changes and merge
kb task merge KB-042
```

## Columns

| Column        | What happens                                    |
|---------------|-------------------------------------------------|
| **Triage**    | Raw idea. AI writes a full task specification.   |
| **Todo**      | Specified and ready. Scheduler waits for deps.   |
| **In Progress** | AI is executing the task in a git worktree.   |
| **In Review** | Work is done. Review the changes and merge.      |
| **Done**      | Merged and shipped.                              |

## How it works

- **Triage processor** — An AI agent reads your project, understands the codebase, and turns your rough idea into a detailed specification with steps, file scope, and acceptance criteria.
- **Scheduler** — Resolves dependency graphs and moves tasks to in-progress when ready. Independent tasks run in parallel.
- **Executor** — Creates an isolated git worktree, spawns an AI agent to implement the spec, and moves the task to in-review on completion.
- **You review** — Inspect the changes and merge with `kb task merge`, or toggle auto-merge in the dashboard.

## Standalone binary

Prebuilt standalone binaries are available that require no Node.js runtime. You can also build one yourself with [Bun](https://bun.sh/):

```bash
bun run build.ts
```

See the [GitHub repository](https://github.com/dustinbyrne/kb) for platform-specific binaries and build instructions.

## Full documentation

For architecture details, development setup, and contributor info, see the [project README](https://github.com/dustinbyrne/kb#readme).

## License

ISC
