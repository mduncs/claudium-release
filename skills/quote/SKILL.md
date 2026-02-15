# /quote - Save Notable Prompts

Save the last human prompt as a quote worth remembering.

## Trigger
User runs `/quote` or `/quote <optional note>`

## Behavior

1. Extract the **last human message** from the conversation (the message immediately before `/quote`)

2. Gather metadata:
   - `timestamp`: ISO 8601 format
   - `pwd`: current working directory
   - `session_id`: from CLAUDE_SESSION_ID env var if available
   - `note`: optional user-provided note (argument to /quote)

3. Append to `~/.claude/logs/quotes.jsonl` (one JSON object per line):
   ```json
   {"timestamp":"...","pwd":"...","session_id":"...","note":"...","prompt":"the actual prompt text"}
   ```

4. Confirm by printing:
   ```
   quoted:
   > [first 200 chars of prompt, or full if shorter]

   saved to ~/.claude/logs/quotes.jsonl
   ```

## Example

User conversation:
```
Human: explain the difference between a monad and a burrito
Assistant: [response]
Human: /quote great analogy prompt
```

Output:
```
quoted:
> explain the difference between a monad and a burrito

saved to ~/.claude/logs/quotes.jsonl
```

## Notes
- Create the quotes file if it doesn't exist
- Use JSONL format for easy grep/jq queries
- Truncate display to 200 chars but save full prompt
