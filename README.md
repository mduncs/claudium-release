# claudium

a claude code power-user toolkit. hooks, skills, and CLI tools.

## hooks/

safety + filtering layer that runs on every tool call.

| hook | what it does |
|------|-------------|
| safety-guard.py | blocks destructive bash commands (rm -rf, force push, browser killing) |
| sanitize-output.py | strips configurable strings from tool output before claude sees them |
| sanitize-post.py | catch-all post-execution filter for MCP + built-in tools |
| audit-log.py | logs every tool call to ~/.claude/audit.jsonl |
| npm-to-bun.py | rewrites npm commands to bun |
| vibe-check.py | detects corporate speak, nudges tone recalibration |
| ask-me-detector.py | detects when user wants structured questions |
| due-diligence.sh | enforces verified task completion with evidence |
| tmux-notify.py | sound + speech notification when claude finishes (macOS) |
| subagent-notify.py | sound for long-running subagent completion |
| capture-session-id.sh | maps session UUID to tmux pane |
| update-session-mapping.sh | re-saves pane mapping on exit |

the sanitize hooks read filter strings from `~/.claude/filter-string.txt`. see `examples/filter-string.txt` for details.

**note**: claude code's `"block"` hook decision is silently ignored. use `permissionDecision: "deny"` inside `hookSpecificOutput`.

## skills/

slash-command definitions. copy to `~/.claude/skills/`.

| skill | what it does |
|-------|-------------|
| archaeology | mines session for patterns, repeated requests, unfinished business |
| background | automated GUI testing without stealing focus (macOS) |
| council | multi-model design review (GPT-5.2, Gemini 3 Pro, Opus) `!tokenburner` |
| diligence | verified task completion — every subtask needs evidence `!tokenburner` |
| history | view session messages lost to context compaction |
| learnings | capture solutions and patterns into searchable knowledge base |
| prompt-engineer | prompt refinement workflow |
| quote | save notable prompts to JSONL log |
| reverse-engineer | RE workflow for desktop apps (Ghidra MCP, asar, etc.) `!tokenburner` |
| ship | release readiness review — 10 lenses, patio11-style `!tokenburner` |
| spec | interactive spec builder with dashboard and 6-reviewer QA gauntlet `!tokenburner` |
| stuck | resumable handoff doc for when you're going in circles |
| tabfs-browser-access | browser tabs as filesystem (requires TabFS) |
| testing | automated UI testing patterns (AppleScript, TabFS, Playwright) |
| witness | performance log analysis |

## bin/

CLI tools. copy to `$PATH`.

| tool | what it does |
|------|-------------|
| portctl | port registry manager |
| claude-sessions | browse + resume past sessions via fzf |
| claude-sessions-preview | fzf preview helper |
| claude-pane | resume session in current tmux pane |

## go/

consolidated Go binary replacing 5 python hooks. ~8ms vs ~88-155ms per call. stdlib only. included as reference — python is primary.

## examples/

| file | what it is |
|------|-----------|
| settings.json | hook wiring for ~/.claude/settings.json |
| filter-string.txt | annotated template for sanitize hooks |
| CLAUDE.md | starter CLAUDE.md showing agent orchestration patterns |

## install

```bash
cp hooks/* ~/.claude/hooks/
cp -r skills/* ~/.claude/skills/
cp bin/* ~/bin/ && chmod +x ~/bin/portctl ~/bin/claude-sessions ~/bin/claude-sessions-preview ~/bin/claude-pane
mkdir -p ~/.claude/logs
touch ~/.claude/filter-string.txt
# merge examples/settings.json into ~/.claude/settings.json
```

## deps

python 3, macOS (afplay, AppleScript), tmux, fzf, jq. optional: bun (council, spec), espeak (tmux-notify), TabFS.

## license

MIT
