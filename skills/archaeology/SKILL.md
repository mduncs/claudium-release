---
name: archaeology
description: Mine the current session for patterns, repeated requests, successes, and unfinished business. Use mid-session to refocus or extract a spec from scattered conversation.
---

# /archaeology - Session Mining

Dig through conversation history to find what matters.

## When to Use

- Session has gone long and unfocused
- Need to extract a spec from scattered requests
- Want to see what you've asked for repeatedly (signal!)
- Mid-session "kick in the ass" to refocus
- Before ending a session, capture what was accomplished

## Invocation

```
/archaeology              # analyze CURRENT session only
/archaeology --requests   # just repeated requests
/archaeology --wins       # just successes
/archaeology --spec       # attempt to synthesize a spec
/archaeology --focus      # what should we be working on RIGHT NOW

# Multi-session mining
/archaeology --sessions   # mine ALL sessions for this project (last 7 days)
/archaeology --sessions 3 # mine last 3 sessions
/archaeology --all        # mine sessions across ALL projects (last 7 days)
```

## Session Storage

Sessions live at: `~/.claude/projects/{project-path}/*.jsonl`

Each session is a UUID `.jsonl` file. `/clear` creates a new session - old ones persist.

When mining multiple sessions:
1. Find `.jsonl` files modified in last N days
2. Parse each, extract user messages
3. Cross-reference patterns ACROSS sessions (even more signal!)
4. Note: recurring requests across sessions = DEFINITELY important

## What It Extracts

### 1. Repeated Requests (High Signal)
Things you asked for multiple times = important. Either:
- It wasn't done right the first time
- It's a core requirement that keeps coming up
- You keep circling back because it matters

**Detection**: Similar phrasing, same concepts, frustration indicators

### 2. Successes
What actually got completed and worked:
- Explicit confirmations ("perfect", "that works", "yes")
- Files written/edited that weren't reverted
- Commands that ran without errors
- Features that were tested and passed

### 3. Unfinished Business
Started but not completed:
- TODOs mentioned but not checked off
- "we'll do X later" statements
- Interrupted threads
- Questions asked but not answered

### 4. Emotional Markers
Session mood signals:
- Frustration indicators ("no", "that's wrong", "I said...")
- Excitement indicators ("perfect!", "love it", "yes!")
- Confusion indicators ("wait", "what?", "I don't understand")

### 5. Scope Drift
How far did we stray from original intent?
- Original request vs where we ended up
- Tangents taken (good or bad)
- Feature creep detected

---

## Process

### Step 1: Gather User Messages

Extract all user messages from session. For each message, note:
- Position in conversation (early/mid/late)
- Length (short = confirmation, long = new request)
- Sentiment (positive/negative/neutral)
- Contains question? Request? Confirmation?

### Step 2: Cluster by Topic

Group messages into topic clusters:
- Same keywords
- Same file references
- Same feature area
- Continuation of previous thread

### Step 3: Identify Patterns

**Repeated Requests** (asked 2+ times):
```
"[request summary]"
  - First asked: message #X
  - Asked again: message #Y (why? previous attempt failed/incomplete)
  - Asked again: message #Z
  - Status: resolved/unresolved
```

**Success Markers**:
```
"[what succeeded]"
  - Confirmed at: message #X
  - Evidence: [user confirmation or working code]
```

**Unfinished**:
```
"[incomplete item]"
  - Started at: message #X
  - Last mentioned: message #Y
  - Blocker: [what stopped progress]
```

### Step 4: Synthesize

If `--spec` flag, attempt to construct a spec from findings:

```markdown
# Spec: [inferred feature name]

## Core Requirements (from repeated requests)
- [thing asked for multiple times]
- [thing asked for multiple times]

## Confirmed Working
- [success 1]
- [success 2]

## Still Needed
- [unfinished 1]
- [unfinished 2]

## Out of Scope (tangents we took)
- [tangent that shouldn't be in spec]

## Emotional Hotspots
- [thing that caused frustration - needs attention]
```

---

## Output Format

**Always writes to**: `~/.claude/logs/archaeology/{timestamp}.md`

Every run creates a persistent markdown file. Terminal shows summary, file has full details.

### Default Output (terminal + file)
```
═══════════════════════════════════════════════════════
 ARCHAEOLOGY REPORT - Session Mining
═══════════════════════════════════════════════════════

📍 SESSION STATS
   Messages analyzed: 47 user messages
   Duration: ~2 hours
   Original intent: "build a planning tool"
   Current state: working on QA agents

🔁 REPEATED REQUESTS (high signal)
   1. "run tests" - asked 3x
      → First: msg #12, incomplete
      → Again: msg #24, still failing
      → Again: msg #38, finally passed ✓

   2. "add error handling" - asked 2x
      → First: msg #8, partially done
      → Again: msg #31, still pending ⚠️

✅ SUCCESSES
   - Dashboard server working (confirmed msg #28)
   - SKILL.md structure approved (msg #15)
   - QA gauntlet design accepted (msg #42)

⏳ UNFINISHED
   - Error handling for edge cases
   - Meta-review query tool mentioned but not built
   - "we'll add council later" - not done

😤 FRICTION POINTS
   - msg #19: "no that's wrong" - file path issue
   - msg #33: "I said..." - misunderstood requirement

🎯 SUGGESTED FOCUS
   Based on patterns, you should focus on:
   1. [unfinished item with most repeats]
   2. [friction point that needs resolution]
   3. [original intent if we've drifted]

═══════════════════════════════════════════════════════
```

### --focus Output (Quick)
```
🎯 RIGHT NOW YOU SHOULD:
   1. Finish: [most repeated unfinished request]
   2. Fix: [most recent friction point]
   3. Test: [thing marked done but not verified]
```

### --spec Output
Generates a draft spec in `.claude/specs/archaeology-{timestamp}.md`

---

## Implementation Notes

**How to access current session**:
- Claude has access to full conversation context in memory
- Iterate through user messages only (assistant messages are our output)
- Use position-aware analysis (early messages = original intent)

**How to access past sessions** (--sessions, --all):
```bash
# Find sessions for current project (last 7 days)
PROJECT_PATH=$(pwd | sed 's/\//-/g' | sed 's/^-//')
fd -e jsonl --changed-within 7d . ~/.claude/projects/"$PROJECT_PATH"/

# Read a session file (JSONL format)
cat ~/.claude/projects/.../{uuid}.jsonl | jq -s '.'
```

**JSONL structure** (each line is a JSON object):
```json
{"type":"file-history-snapshot", ...}
{"type":"user","userType":"external","message":"the user message text", "timestamp":...}
{"type":"assistant","message":[{"type":"text","text":"response"}, {"type":"tool_use",...}]}
{"type":"user","message":[{"type":"tool_result","content":"..."}]}
```

Extract user messages (text only, skip tool results):
```bash
cat session.jsonl | jq -r '
  select(.type=="user" and .userType=="external") |
  if (.message | type) == "string" then .message
  elif (.message | type) == "array" then
    (.message[] | select(.type != "tool_result") | .content // .text // empty)
  else empty end
' | head -50
```

**Fields of interest**:
- `.type` = "user" | "assistant" | "file-history-snapshot"
- `.userType` = "external" (real user input)
- `.message` = string OR array of content blocks
- `.timestamp` = ISO timestamp

**Clustering heuristics**:
- Same nouns/verbs = same topic
- Within 5 messages = continuation
- After "actually" or "wait" = topic shift
- After long assistant response = new thread likely

**Frustration detection**:
- "no" at start of message
- "I said" / "I already" / "again"
- Short negative responses after long assistant output
- ALL CAPS
- "?" after our explanation (confusion)

**Success detection**:
- "perfect" / "great" / "yes" / "love it"
- "that works" / "looks good"
- Moving on to next topic without circling back
- Asking for commit/save/deploy (implies done)

---

## Example Session

```
> /archaeology

Analyzing 34 user messages...

🔁 REPEATED REQUESTS
   "make the tests pass" - 4x (!!!)
   "add loading states" - 2x

✅ SUCCESSES
   - Auth flow working
   - Database schema approved

⏳ UNFINISHED
   - Tests still failing (msg #31 was last attempt)
   - Loading states mentioned but not added

🎯 FOCUS: Fix the tests. You've asked 4 times.
```

```
> /archaeology --spec

Synthesizing spec from conversation...

Written to: .claude/specs/archaeology-2024-01-22T04:30:00.md

Preview:
# Auth Flow Specification (extracted from session)

## Core Requirements
- User login with email/password (asked 3x)
- Session persistence (asked 2x)
- Logout functionality (confirmed working)

## Still Needed
- Password reset flow (mentioned msg #12, not started)
- Rate limiting (mentioned msg #8, not implemented)
```

---

## Integration

- Run before `/spec` to extract requirements from messy session
- Run before ending session to capture what's undone
- Run when frustrated to see what's actually been asked for
- Pairs with TodoWrite to create action items from findings
