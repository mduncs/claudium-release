# /history - View Session History Before Compaction

Retrieve messages from the current session that may have been lost to context compaction.

## Trigger

- `/history` - show last 10 human messages with my responses
- `/history 20` - show last 20 exchanges
- `/history search <term>` - search session for keyword
- User says "what did we talk about earlier", "what was that thing", "before compaction"

## Session Location

Sessions stored at:
```
~/.claude/projects/{project-path-escaped}/{session-id}.jsonl
```

Project path escapes `/` as `-`, e.g.:
`/Users/you/code/myproject` → `-Users-you-code-myproject`

## Behavior

### 1. Find Current Session

```bash
# Get session ID from env or find most recent
SESSION_ID="${CLAUDE_SESSION_ID:-$(ls -t ~/.claude/projects/*/  | head -1 | xargs basename .jsonl)}"

# Find project dir (current cwd escaped)
PROJECT_DIR=$(echo "$PWD" | sed 's|/|-|g' | sed 's/^-//')
SESSION_FILE="$HOME/.claude/projects/-$PROJECT_DIR/$SESSION_ID.jsonl"
```

### 2. Parse Messages

Extract human prompts and assistant responses:

```bash
jq -s '
  [.[] | select(.type == "user" or .type == "assistant")]
  | .[-20:]  # last 20 messages
  | .[]
  | {
      type,
      timestamp,
      content: (
        if .message.content then
          [.message.content[] | select(.type == "text") | .text] | join("")
        else
          null
        end
      )
    }
  | select(.content != null and .content != "")
' "$SESSION_FILE"
```

### 3. Output Format

```markdown
## Session History: {session-id}
**Project**: {cwd}
**Messages shown**: last 10 exchanges

---

### [12:34:05] Human
can you fix the bug in auth.ts

### [12:34:45] Assistant
I found the issue - the token validation was checking...
[truncated to 500 chars if long]

### [12:35:20] Human
also add tests

### [12:36:10] Assistant
Added tests in auth.test.ts covering...

---

*Full session: ~/.claude/projects/.../{session-id}.jsonl*
```

### 4. Search Mode

For `/history search <term>`:

```bash
jq -s '
  [.[] | select(.type == "user" or .type == "assistant")]
  | [.[] | select(
      .message.content[]? | select(.type == "text") | .text
      | test("SEARCH_TERM"; "i")
    )]
' "$SESSION_FILE"
```

Show matching messages with context (1 before, 1 after).

### 5. Handle Edge Cases

| Case | Response |
|------|----------|
| No session file | "No session file found for current project. Are you in the right directory?" |
| Session ID not found | "Session {id} not found. Available sessions: {list recent 5}" |
| Empty/new session | "This session has no history yet." |
| Very long messages | Truncate to 500 chars with "[...truncated]" |

## Use Cases

1. **After compaction**: "What did we decide about the API design?"
2. **Resume context**: "What files did we edit earlier?"
3. **Find lost info**: `/history search database` - find discussion about databases
4. **Debug**: See exact sequence of tool calls and responses

## Notes

- This reads the raw session file, not the compacted context
- Tool calls and results are included if relevant
- Thinking blocks are excluded (internal)
- Binary/image content shown as "[image]" placeholder
