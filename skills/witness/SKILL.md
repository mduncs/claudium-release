# /witness - Performance Flight Recorder

Analyze recent performance logs when the user experiences a hitch.

## Triggers

- `/witness` - analyze last 30s
- `/witness 2m` - analyze last 2 minutes
- `/witness appname` - specific app's logs
- `/witness --since 23:45` - since specific time
- User says "did you see that?", "what just happened?", "app hitched", etc.

## Log Location

```
~/.claude/perf/
├── {app-name}/
│   ├── current.jsonl     # live log (tail -f friendly)
│   ├── markers.jsonl     # user-triggered marks
│   └── YYYY-MM-DD.jsonl  # daily rolls
```

## Log Format (JSONL)

```jsonl
{"ts":1706140800123,"op":"render","dur_ms":12,"ok":true}
{"ts":1706140800135,"op":"api_call","dur_ms":234,"ok":true,"meta":{"url":"/users"}}
{"ts":1706140800370,"op":"db_query","dur_ms":890,"ok":false,"err":"timeout","meta":{"query":"SELECT..."}}
```

| Field | Type | Description |
|-------|------|-------------|
| `ts` | int | Unix timestamp in milliseconds |
| `op` | string | Operation name |
| `dur_ms` | int | Duration in milliseconds |
| `ok` | bool | Success or failure |
| `err` | string? | Error message if failed |
| `meta` | object? | Optional context |

## Behavior

### 1. Find Logs

```bash
ls ~/.claude/perf/*/current.jsonl
```

If multiple apps, ask which one or analyze all.

### 2. Parse Recent Events

Read last N lines based on timeframe:
- 30s default: ~100-500 lines typically
- 2m: ~500-2000 lines

```bash
# Get events from last 30 seconds
now_ms=$(date +%s%3N)
threshold=$((now_ms - 30000))
tail -500 ~/.claude/perf/appname/current.jsonl | jq -s "[.[] | select(.ts > $threshold)]"
```

### 3. Detect Anomalies

**Slow operations** (thresholds):
| Operation pattern | Warning | Critical |
|-------------------|---------|----------|
| `render*`, `paint*` | >50ms | >200ms |
| `db*`, `query*` | >100ms | >500ms |
| `api*`, `fetch*`, `http*` | >200ms | >1000ms |
| `gc`, `garbage*` | >30ms | >100ms |
| default | >100ms | >500ms |

**Gaps**: No events for >500ms suggests main thread blocked.

**Failures**: Any `ok: false` events.

**Spikes**: Operation took >5x its typical duration (if history available).

### 4. Report Format

```markdown
## Witness Report: {app-name}
**Timeframe**: last 30s (23:44:30 - 23:45:00)
**Events analyzed**: 47

### Anomalies Found

🔴 **CRITICAL** 23:44:52.305 `render` took **1847ms** (expected <50ms)
   └─ Likely cause: preceded by 890ms `db_query`

🟡 **WARNING** 23:44:51.370 `db_query` took **890ms** (expected <100ms)
   └─ meta: {query: "SELECT * FROM users WHERE..."}

🟡 **GAP** 23:44:45.000 - 23:44:46.200 (1.2s with no events)
   └─ Main thread likely blocked

### Timeline (last 10 events)

| Time | Operation | Duration | Status |
|------|-----------|----------|--------|
| 23:44:52.305 | render | 1847ms | 🔴 |
| 23:44:51.370 | db_query | 890ms | 🟡 |
| 23:44:51.260 | gc | 45ms | ✓ |
| ... | ... | ... | ... |

### Recommendation

The 1.8s render hitch was caused by a slow database query (890ms)
that blocked the main thread. Consider:
1. Add index on users table for this query pattern
2. Move query off main thread
3. Add pagination (query returned 1523 rows)
```

### 5. ASCII Flame Graph (if requested)

For `--flame` flag, generate simple ASCII:

```
[===== render (1847ms) =====]
  [== db_query (890ms) ==]
  [= parse (45ms) =]
[== api_call (234ms) ==]
[= gc (45ms) =]
```

Width proportional to duration. Nested if spans overlap.

## Proactive Detection

If user mentions:
- "slow", "laggy", "hitched", "froze", "hung"
- "what just happened"
- "did you see that"
- "performance issue"

Automatically check for recent perf logs and offer analysis:
"I see you have perf logs for [appname]. Want me to check what just happened?"

## No Logs Found

If no logs exist:
```
No performance logs found in ~/.claude/perf/

To start logging, add the witness library to your app:
  cp ~/.claude/skills/witness/witness.ts ./src/

Then wrap slow operations:
  import { span, spanAsync } from './witness';
  await spanAsync('db.query', () => db.find({}));

See ~/.claude/skills/witness/witness.ts for full API.
```

## Manual Markers

Users can trigger marks from their app:
```typescript
mark('user-clicked-save');
```

These appear in `markers.jsonl` and help correlate user actions with perf events.

When analyzing, cross-reference markers:
```
🏷️ MARKER 23:44:51.000 "user-clicked-save"
   └─ 305ms later: render hitch began
```
