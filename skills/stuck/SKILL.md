---
name: stuck
description: When you're stuck on a problem after multiple attempts. Captures problem state, attempts, user feedback, and creates resumable handoff for after /clear.
---

# /stuck - Debug Session Handoff

When you've tried multiple things and nothing's working. Creates a handoff doc so you can `/clear` and resume fresh without losing context.

## Invocation

```
/stuck              # full handoff
/stuck --quick      # just problem + attempts, no deep analysis
```

## What It Captures

### 1. The Problem
- What are we trying to do?
- What's the expected behavior?
- What's actually happening?
- Error messages, symptoms

### 2. Attempts Made (in order)
For each attempt:
```
Attempt N: [what we tried]
- Why: [reasoning for trying this]
- Result: [what happened]
- User feedback: [if user said "no that's worse" or "closer" etc]
```

### 3. Patterns Noticed
- What approaches have been ruled out
- What seemed promising but didn't work
- Any clues from partial successes

### 4. User Observations
- Direct quotes from user about behavior
- "it's slower now", "the error changed", "that fixed X but broke Y"

### 5. Next Steps to Try
- What hasn't been tried yet
- Hypotheses not yet tested

## Output

Writes to: `.claude/stuck/{timestamp}-{problem-slug}.md`

**Also log invocation** for central sync (append to `~/.claude/logs/invocations.jsonl`):
```json
{"timestamp":"ISO","skill":"stuck","project":"$(pwd)","file":"{timestamp}-{problem-slug}.md"}
```

```markdown
---
created: {ISO timestamp}
problem: {one-line summary}
attempts: {count}
status: stuck
---

# Stuck: {Problem Summary}

## Problem Statement
{detailed description}

## Attempts

### 1. {First thing tried}
**Why**: {reasoning}
**Result**: {what happened}
**User said**: "{feedback if any}"

### 2. {Second thing tried}
...

## Ruled Out
- {approach} - because {reason}

## User Observations
- "{direct quote}"
- "{direct quote}"

## Promising Leads
- {thing that showed partial progress}

## Not Yet Tried
- [ ] {idea 1}
- [ ] {idea 2}

## Resume Command
After `/clear`, paste:
\`\`\`
I was working on: {problem}
See handoff: .claude/stuck/{filename}
Key context: {2-3 sentence summary}
\`\`\`
```

## How to Use

1. Run `/stuck` when you're going in circles
2. I'll analyze the session and write the handoff
3. Copy the "Resume Command" block
4. Run `/clear`
5. Paste the resume block
6. We continue with fresh context but full history

## Mining the Session

To build the handoff, I:
1. Scan user messages for the original ask
2. Find my attempts (tool calls, code changes)
3. Look for user feedback patterns:
   - "no", "that's not it", "still broken" → failed attempt
   - "closer", "almost", "that helped" → partial success
   - "yes", "works", "perfect" → success (why are you running /stuck?)
4. Extract error messages and symptoms mentioned
5. Note any "I tried X before" context from user

## Example Session

```
user: /stuck

assistant: Let me analyze this session...

[Reads conversation history]
[Identifies problem: "CSS grid not aligning on mobile"]
[Finds 4 attempts: flexbox, media queries, container queries, grid-template-areas]
[Notes user feedback: "media queries helped but broke desktop"]

Writing handoff to .claude/stuck/2026-01-21-css-grid-mobile.md

---
# Stuck: CSS Grid Mobile Alignment

## Problem Statement
Grid items stack incorrectly on mobile viewport (<768px).
Expected: 2 columns on tablet, 1 on phone
Actual: Items overlap and overflow

## Attempts

### 1. Switch to Flexbox
**Why**: Simpler responsive model
**Result**: Lost grid alignment on desktop
**User said**: "no that breaks the desktop layout"

### 2. Add media queries
**Why**: Explicit breakpoint control
**Result**: Mobile works, desktop broke
**User said**: "media queries helped but broke desktop"

...

## Resume Command
After `/clear`, paste:
```
I was working on: CSS grid mobile alignment
See handoff: .claude/stuck/2026-01-21-css-grid-mobile.md
Key context: Tried flexbox (breaks desktop), media queries (breaks desktop), container queries (not supported). Grid-template-areas was closest but still has gap issues on iPhone SE.
```
```
