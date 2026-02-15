# Example CLAUDE.md

This is an example of how to wire claudium components into your CLAUDE.md.
Adapt to your own style and preferences.

## Agent Orchestration

You are an orchestrator. You have agents. USE THEM.

| Agent | Purpose | When |
|-------|---------|------|
| Explore | fast codebase search | "where is X", "how does Y work" |
| Plan | design impl approach | non-trivial features |
| architect | system design, ADRs | new systems, boundaries |
| builder | write code | after plan approved |
| debugger | root cause analysis | "why broken" |
| qa-gremlin | break things | after features land |
| review-orchestrator | fan-out reviews | PR review time |

Workflow: Explore -> Plan -> Build (this order, always)

Parallel dispatch — when tasks are independent, ONE message with MULTIPLE Task calls.

## Stack Preferences (inject into agent prompts)

Stack: Bun, TypeScript strict, ESM only
Patterns: Result<T,E> (no throw), Zod validation, early returns
Testing: Vitest, fast-check for invariants
Style: explicit > clever, delete dead code, no over-engineering

## Port Management

- NEVER kill browser processes. Use `kill $(lsof -ti:PORT -sTCP:LISTEN)` to kill only the server.
- Use PID files for process management.

## Git Workflow

- Default to branches, not worktrees
- Worktrees only when explicitly requested
