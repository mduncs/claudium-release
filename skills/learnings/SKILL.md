# /learnings - Capture Solutions & Patterns

Invoke with: `/learnings` (reviews current session) or `/learnings search <query>`

## Purpose

Captures solutions, fixes, patterns, and gotchas discovered during work. Builds a searchable knowledge base over time for future reference.

## Modes

### Capture Mode (default): `/learnings`

Reviews the current session and prompts to document what was learned.

1. **Scan conversation** for:
   - Problems solved
   - Bugs fixed
   - Patterns discovered
   - Gotchas encountered
   - Configurations figured out

2. **Generate write-up** with metadata (see format below)

3. **Save** to `~/.claude/logs/learnings/YYYY/MM/YYYYMMDD-HHMMSS-<slug>.md`

### Search Mode: `/learnings search <query>`

Searches existing learnings for relevant past solutions.

```bash
# searches titles, tags, and content
rg -i "<query>" ~/.claude/logs/learnings/ -l
```

Returns summaries of matching learnings.

## Metadata Format

```markdown
---
date: 2025-01-21T21:45:00
project: /path/to/project-name
tags: [bug, auth, typescript]
confidence: high | medium | low
reusable: true | false
related: [YYYYMMDD-HHMMSS-other-learning]
---

# <Title: Short Description of What Was Learned>

## Problem

<What was broken, confusing, or needed>

- Symptoms observed
- Error messages (if any)
- What was tried that didn't work

## Root Cause

<Why it was happening>

## Solution

<What fixed it>

- Specific changes made
- File references with line numbers
- Commands run

## Code Examples

```<language>
// before (broken)
<code>

// after (fixed)
<code>
```

## Key Insight

<The generalizable takeaway - what to remember for next time>

## Prevention

<How to avoid this in future, if applicable>

## References

- Related docs, issues, or previous learnings
```

## Tag Taxonomy

Use consistent tags for searchability:

| Category | Tags |
|----------|------|
| Type | `bug`, `pattern`, `gotcha`, `config`, `performance`, `security` |
| Domain | `auth`, `api`, `ui`, `db`, `build`, `test`, `deploy` |
| Stack | `typescript`, `swift`, `python`, `bun`, `react`, `n8n` |
| Severity | `critical`, `annoying`, `minor` |

## Workflow

1. User invokes `/learnings` after solving something
2. Claude reviews the session
3. Claude drafts the learning document
4. User can edit/approve
5. Claude saves to learnings directory

## Example

User: `/learnings`

Claude reviews session, sees auth token refresh bug was fixed.

Output:

```markdown
---
date: 2025-01-21T21:45:00
project: /path/to/myapp
tags: [bug, auth, typescript, api]
confidence: high
reusable: true
---

# Auth Token Refresh Race Condition

## Problem

Login worked but users got logged out randomly after ~15 minutes.
- No errors in console
- Token was valid but requests failed
- Only happened when multiple tabs open

## Root Cause

Token refresh was firing in multiple tabs simultaneously. Each tab got a new token, invalidating the others. Classic race condition.

## Solution

Added tab-leader election using BroadcastChannel. Only leader tab refreshes token, others listen.

- `src/auth/tokenRefresh.ts:45-89` - added leader election
- `src/auth/broadcastChannel.ts` - new file for cross-tab communication

## Code Examples

```typescript
// before - every tab refreshes independently
setInterval(() => refreshToken(), TOKEN_REFRESH_INTERVAL);

// after - only leader refreshes
if (isLeaderTab()) {
  setInterval(() => {
    refreshToken();
    broadcastNewToken(token);
  }, TOKEN_REFRESH_INTERVAL);
} else {
  listenForTokenBroadcast((token) => setToken(token));
}
```

## Key Insight

Any client-side periodic operation needs tab coordination if state is shared. BroadcastChannel is the clean solution.

## Prevention

- Add "multi-tab behavior" to code review checklist for auth/session code
- Consider tab coordination upfront for any shared client state
```

## Future Improvements

Potential enhancements to consider:

1. **Auto-suggest**: At session end, detect if something was learned and prompt
2. **Linking**: Automatically link related learnings based on tags/content
3. **Consolidation**: Periodic review to merge similar learnings
4. **Integration**: Surface relevant learnings during `/diligence` tasks
5. **Export**: Generate searchable HTML/JSON index of all learnings
