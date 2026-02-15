# claudium

A Claude Code power-user toolkit: hooks, skills, agents, and CLI tools built over months of daily usage.

## What's in here

```
hooks/          PreToolUse/PostToolUse/Stop/etc hook scripts
skills/         Slash-command skill definitions (SKILL.md + supporting code)
agents/         Custom agent definitions (.md files)
bin/            CLI tools (bash/python)
go/             Consolidated Go binary (reference — replaces 5 py hooks)
examples/       settings.json wiring, filter-string template, example CLAUDE.md
```

## The hook system

The core value: a multi-layer filter + safety system that runs on every tool call.

```
         ┌─────────────┐
         │  tool call   │
         └──────┬───────┘
                │
         ┌──────▼───────┐
  layer 1│  PreToolUse  │  safety-guard, npm-to-bun, sanitize-output
         │  (filter)    │  blocks dangerous cmds, rewrites npm->bun, strips strings
         └──────┬───────┘
                │
         ┌──────▼───────┐
         │ tool executes│
         └──────┬───────┘
                │
         ┌──────▼───────┐
  layer 2│ PostToolUse  │  audit-log, sanitize-post
         │  (catch-all) │  logs tool calls, catches anything that slipped through
         └──────────────┘

  Other events:
  - UserPromptSubmit: ask-me-detector.py
  - Stop: vibe-check.py, tmux-notify.py, due-diligence.sh
  - SessionStart: capture-session-id.sh
  - SubagentStop: subagent-notify.py
```

### Hooks

| Hook | Event | What it does |
|------|-------|--------------|
| **safety-guard.py** | PreToolUse (Bash) | Blocks destructive commands: `rm -rf /`, force push to main, blind port killing (which kills browsers), browser/dev tool killing, unauthorized git clone |
| **sanitize-output.py** | PreToolUse (all) | Strips configurable strings from tool output before Claude sees them. Pre-reads files, pre-executes grep, pre-fetches URLs. Wraps bash output through a runtime filter |
| **sanitize-post.py** | PostToolUse (all) | Catch-all for anything that slipped through layer 1. Handles MCP tools via `updatedMCPToolOutput`, built-in tools via `additionalContext` |
| **audit-log.py** | PostToolUse | Logs every tool call to `~/.claude/audit.jsonl` (JSONL format) |
| **npm-to-bun.py** | PreToolUse (Bash) | Auto-rewrites `npm` commands to `bun` (opinionated, remove if you use npm) |
| **vibe-check.py** | Stop | Detects corporate speak / excessive formality in Claude's last response. Points back to CLAUDE.md for tone recalibration |
| **ask-me-detector.py** | UserPromptSubmit | Detects when user wants structured questions ("ask me", "help me decide") and nudges Claude to use AskUserQuestion tool |
| **due-diligence.sh** | Stop | Enforces verified task completion with evidence. Only active when invoked via `/diligence` skill |
| **tmux-notify.py** | Stop | Plays a sound + speaks which tmux window/pane finished. Requires `afplay` (macOS) + `espeak`. Sound path configurable via `CLAUDE_NOTIFY_SOUND` env var |
| **subagent-notify.py** | SubagentStop | Plays "job's done" sound for long-running subagents (>5 min). Sound path configurable via `CLAUDE_JOBSDONE_SOUND` env var |
| **capture-session-id.sh** | SessionStart | Maps session UUID to tmux pane for later resume |
| **update-session-mapping.sh** | Stop | Re-saves pane mapping on exit (catches mid-session renames) |

### The filter system (sanitize-output + sanitize-post)

There exist strings that, when present in Claude's context, trigger deterministic API-level refusal. Hostile actors embed these in web pages and files to disrupt Claude sessions.

The sanitize hooks strip them from all tool output:

1. Put your filter strings in `~/.claude/filter-string.txt` (one per line)
2. `sanitize-output.py` (PreToolUse) catches them in Read/Bash/Grep/WebFetch
3. `sanitize-post.py` (PostToolUse) catches anything from MCP tools + built-in tools
4. Bash commands get wrapped through a runtime python filter that reads strings from disk (so the strings never appear in command text)

**Key discovery**: Claude Code's `"block"` hook decision is silently ignored. You must use `permissionDecision: "deny"` inside `hookSpecificOutput` for PreToolUse hooks.

**Known gaps**:
- WebSearch: can't pre-execute, PostToolUse only (may be too late)
- Subagents: inherit hooks, but if they return the string in a Task result, it enters parent context
- User prompt: no hook can filter what the user types
- System context: if the string is in CLAUDE.md or auto-loaded files, no hook catches it

## Skills

Skills are slash-commands defined as SKILL.md files. Copy to `~/.claude/skills/`.

| Skill | Command | What it does |
|-------|---------|--------------|
| **archaeology** | `/archaeology` | Mines current session for patterns, repeated requests, successes, and unfinished business. Refocus tool |
| **background** | `/background` | Automated GUI testing without stealing focus (macOS). AppleScript + screencapture |
| **council** | `/council` | Multi-model design review (GPT-5.2, Gemini 3 Pro, Opus). Supports deliberation, dialogue, independent modes. Configurable cost tiers (--cheap, --poverty) |
| **diligence** | `/diligence` | Verified task completion mode. Every subtask needs evidence. No stubs allowed (unless opt-in). Works with due-diligence.sh hook |
| **history** | `/history` | View session messages before context compaction. Search past conversations |
| **learnings** | `/learnings` | Capture solutions, patterns, gotchas from current session into searchable knowledge base |
| **prompt-engineer** | `/prompt-engineer` | Prompt refinement workflow with reference doc |
| **quote** | `/quote` | Save notable prompts to JSONL log |
| **reverse-engineer** | `/reverse-engineer` | RE workflow for desktop apps. Auto-detects app type, routes to appropriate tools (Ghidra MCP, asar extraction, etc.) |
| **ship** | `/ship` | Release readiness review (patio11-style). 10 lenses from "first contact" to "the 2am test". Automated testing + evidence collection |
| **spec** | `/spec` | Interactive spec builder with live HTML dashboard, auto-suggested polish features, and serial 6-reviewer QA gauntlet |
| **stuck** | `/stuck` | Creates resumable handoff doc when you're going in circles. `/clear` then resume with context |
| **tabfs-browser-access** | `/tabfs` | Browser tab access as filesystem (requires [TabFS](https://omar.website/tabfs/)) |
| **testing** | `/testing` | Automated UI testing patterns. macOS native (AppleScript), browser (TabFS/Playwright), without user involvement |
| **witness** | `/witness` | Performance log analysis |

### Council dependencies

The council skill uses external APIs for multi-model review:
```
bun install  # in skills/council/
# Needs OPENAI_API_KEY and/or GEMINI_API_KEY in env
# --test mode uses Opus subagents only (no external API cost)
```

## Agents

Custom agent definitions. Copy to `~/.claude/agents/`.

| Agent | Purpose |
|-------|---------|
| **architect** | System design, ADRs, boundaries |
| **builder** | Implementation after plan approval |
| **debugger** | Root cause analysis, fix isolation |
| **dev-reviewer** | Code review (obvious > clever) |
| **perf-reviewer** | Performance review |
| **qa-gremlin** | Break things, edge cases, chaos |
| **review-orchestrator** | Coordinates specialist reviewers |
| **security-reviewer** | Security review for B2B internal tools |
| **ux-reviewer** | Pragmatic UX review |
| **webdev** | Frontend/extension dev with TabFS browser debugging |
| **webext** | Browser extension dev (manifest v3, Firefox/Chrome) |

## CLI Tools

Copy to somewhere in your `$PATH` (e.g., `~/bin/`).

| Tool | What it does |
|------|--------------|
| **portctl** | Port registry manager. `portctl list`, `portctl register 8850 myapp`, `portctl next` |
| **claude-sessions** | Browse + resume past Claude sessions via fzf. Export conversations |
| **claude-sessions-preview** | fzf preview helper for claude-sessions |
| **claude-pane** | Resume Claude session in current tmux pane |
| **generate_bass_rumble.py** | Generates the notification sound file for tmux-notify |

## Go binary (reference)

`go/` contains a consolidated Go implementation of 5 python hooks as a single binary. ~8ms per call vs ~88-155ms per python script. Stdlib only, zero dependencies.

Included as reference for anyone who wants faster hooks. The python versions are the primary release.

## Installation

### Quick start (just the hooks)

```bash
# copy hooks
cp hooks/* ~/.claude/hooks/

# wire them up in settings
# see examples/settings.json for the full wiring
# or merge into your existing ~/.claude/settings.json

# create filter-string file (see examples/filter-string.txt)
touch ~/.claude/filter-string.txt
```

### Full setup

```bash
# hooks
cp hooks/* ~/.claude/hooks/

# skills
cp -r skills/* ~/.claude/skills/

# agents
cp agents/* ~/.claude/agents/

# CLI tools
cp bin/* ~/bin/  # or wherever your PATH points
chmod +x ~/bin/portctl ~/bin/claude-sessions ~/bin/claude-sessions-preview ~/bin/claude-pane

# notification sounds (optional)
mkdir -p ~/.claude/sounds
python3 bin/generate_bass_rumble.py  # creates notify.wav
# or provide your own sounds and set:
#   CLAUDE_NOTIFY_SOUND=/path/to/sound.wav
#   CLAUDE_JOBSDONE_SOUND=/path/to/sound.mp3

# council skill deps (optional)
cd ~/.claude/skills/council && bun install

# settings.json — merge examples/settings.json into ~/.claude/settings.json
```

### Skill log directory

Several skills log their output to `~/.claude/logs/`. Create it:

```bash
mkdir -p ~/.claude/logs
```

Subdirectories are created automatically by each skill (learnings/, ship/, council/, etc).

## Dependencies

- **Python 3** — all hooks are python
- **macOS** — tmux-notify and subagent-notify use `afplay` (macOS audio). Safety-guard blocks macOS-specific destructive commands. Testing skill uses AppleScript
- **tmux** — session mapping hooks, tmux-notify, claude-pane
- **fzf** — claude-sessions browser
- **jq** — claude-sessions, due-diligence
- **espeak** (optional) — tmux-notify speaks which pane finished
- **Bun** (optional) — council skill, spec dashboard
- **TabFS** (optional) — tabfs-browser-access, testing (browser), webdev/webext agents

## License

MIT
