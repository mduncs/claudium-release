# /ship - Release Review (patio11-style)

Invoke with: `/ship` or `/ship --quick` or `/ship --lens <name>` or `/ship --full`

## What This Is

A release readiness review that thinks from the user's chair, not the codebase. Inspired by patio11's approach: what happens when a real human encounters this software at 11pm on their phone? What will support get tickets about? What does the user lose when it breaks?

This is NOT code review. This is "should we actually ship this to humans" review.

## Flags

- `/ship` — full review, scoped to changes (git diff against main/master)
- `/ship --full` — review entire app, not just changes
- `/ship --quick` — skip automated testing, review code/design only
- `/ship --test-only` — just run automated interaction tests, no review
- `/ship --lens <name>` — run a single lens (see lens list below)
- `/ship --release` — same as `/ship` but append deployment checklist

## Phase 1: Discovery

### Detect Project Type

```
package.json + (html|tsx|jsx)     → web app
Package.swift / .xcodeproj        → native macOS/iOS
Cargo.toml + src/main.rs          → CLI or native
go.mod                            → CLI or native
binary in .build/                 → native macOS
*.py + (flask|django|fastapi)     → web backend
electron / package.json + main    → electron app
```

### Scope Changes

Default: `git diff main...HEAD` (or master)

Identify:
- New files, modified files, deleted files
- New endpoints/routes
- Changed UI components
- Modified data models or schemas
- New dependencies

If `--full`: skip diff scoping, review everything.

## Phase 2: Automated Testing

**Skip if `--quick` flag.**

Read `~/.claude/references/headless-testing.md` for platform-specific tools.

### Web Apps
```bash
# start dev server in background
bun run dev &
DEV_PID=$!
sleep 3

# use Playwright MCP or manual scripts
# screenshot key flows
bunx playwright screenshot http://localhost:PORT /tmp/ship-review/landing.png
```

### Native GUI (macOS)
```bash
# save focus, launch, restore focus (no focus steal)
FRONT=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')
.build/debug/AppName &
APP_PID=$!
sleep 1
osascript -e "tell application \"$FRONT\" to activate"
sleep 2

# find window ID
WID=$(swift -e '
import Cocoa
let ws = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
for w in ws {
    if (w["kCGWindowOwnerName"] as? String ?? "").contains("AppName") {
        print(w["kCGWindowNumber"] as? Int ?? 0)
        break
    }
}
')

# screenshot just that window (works even if behind other windows)
screencapture -x -l $WID /tmp/ship-review/initial.png

# interact via AppleScript
osascript -e 'tell app "System Events" to tell process "AppName" to click button "Submit" of window 1'
sleep 1
screencapture -x -l $WID /tmp/ship-review/after-submit.png
```

### CLI
```bash
# capture normal usage
myapp --help > /tmp/ship-review/help.txt 2>&1
echo "Exit: $?" >> /tmp/ship-review/help.txt

# test main flow
echo "test input" | myapp > /tmp/ship-review/main-flow.txt 2>&1

# test error paths
myapp --bad-flag > /tmp/ship-review/error.txt 2>&1
```

### Evidence Directory
All evidence goes to `/tmp/ship-review/<project>-<YYYYMMDD-HHMMSS>/`

Create this at the start of the review.

## Phase 3: The Lenses

Apply EVERY lens to the changes. Each lens produces findings.

### 1. First Contact
> Can someone who's never seen this figure it out without docs?

- Screenshot the landing/initial state
- Read it as if you've never seen the app
- Is the primary action obvious?
- Can you tell what this software does in 5 seconds?
- Are there assumptions about user knowledge?

### 2. Error States
> What does the user SEE when things break?

- Trigger errors intentionally (bad input, network failure, missing data)
- Screenshot every error state
- Are error messages helpful or cryptic?
- Do they tell the user what to DO, not just what went wrong?
- Is there a dead end? (error with no recovery path)

### 3. Data Consequences
> Can users lose work? Is anything permanent without warning?

- What actions are destructive? (delete, overwrite, send)
- Is there confirmation before destructive actions?
- Is there undo?
- What happens if the app crashes mid-operation?
- Is data saved automatically or only on explicit save?

### 4. Edge Case Users
> Real humans with real weird situations

- Empty inputs, extremely long inputs, special characters, unicode, emoji
- Slow connection (what does loading look like?)
- Screen reader / accessibility (basic check)
- Weird timezone, locale, date format
- Stale session / expired auth
- Very small / very large screen

### 5. Adversarial Normal
> Not hackers. Confused, frustrated, rushing humans.

- Double-click submit
- Hit back button mid-flow
- Paste wrong thing into wrong field
- Open in two tabs simultaneously
- Refresh during operation
- Close and reopen during async operation

### 6. Copy Review
> Words matter. Every string the user sees is UX.

- Read every user-facing string in changed files
- Flag jargon, technical language, ambiguity
- Error messages: helpful or blame-the-user?
- Button labels: clear verb or vague noun?
- Confirmation dialogs: do they explain consequences?
- Empty states: helpful or just blank?

### 7. Support Burden
> What will generate tickets? What's undiscoverable?

- Features that exist but aren't findable
- Flows that work differently than user expects
- Settings that are confusing or have unclear defaults
- Things that look clickable but aren't (or vice versa)
- Missing feedback (did my action work? am I waiting?)

### 8. Recovery
> When (not if) this breaks in prod.

- Kill the app mid-operation. Restart. What's the state?
- Is there data corruption risk?
- Can a non-engineer recover from failure?
- What monitoring/alerting exists?
- What's the rollback plan?

### 9. The 2am Test
> Something broke. Who gets paged? Can they fix it?

- Are there logs? Are they useful?
- Can the issue be diagnosed without deploying new code?
- Is there a runbook or at least obvious error messages in logs?
- Feature flags to disable broken features without full rollback?

### 10. The Boring Stuff
> Auth, validation, rate limiting, the stuff that's "obviously fine" until it isn't.

- Input validation at system boundaries
- Auth/authz on new endpoints
- Rate limiting on public endpoints
- CSRF/XSS on new forms
- SQL injection on new queries
- File upload validation (if applicable)
- Dependency vulnerabilities (`bun audit` / `npm audit`)

## Phase 4: Verdict

### Severity Levels

```
BLOCK  - prevents release. user harm, data loss, security hole.
HOLD   - should fix before release. significant UX issue, confusing flow.
NOTE   - known tradeoff, acceptable risk. document and move on.
PASS   - lens found nothing concerning.
```

### Output Format

```markdown
# Ship Review: [project name]
## Date: YYYY-MM-DD
## Scope: [git diff main...HEAD | full app]
## Project type: [web | native macOS | CLI | etc]

---

## VERDICT: SHIP / HOLD / BLOCK

**Summary**: [1-2 sentences on overall readiness]

---

## Findings

### BLOCK (must fix)
- **[lens]**: [finding] — [evidence path or file:line]

### HOLD (should fix)
- **[lens]**: [finding] — [evidence path or file:line]

### NOTE (known tradeoff)
- **[lens]**: [finding] — [why it's acceptable]

### PASS
- [lens]: no issues found
- [lens]: no issues found

---

## Evidence
Directory: /tmp/ship-review/[project]-[timestamp]/
- landing.png — initial state screenshot
- error-*.png — error state screenshots
- flow-*.png — key flow screenshots
- test-output.txt — automated test results

---

## Support Prediction
> "Users will file tickets about: ..."

[top 3 likely support issues, ranked by probability]

---

## Recovery Plan
[what to do when it breaks, who to contact, how to rollback]

---

## Deployment Checklist (if --release)
- [ ] Feature flags configured
- [ ] Monitoring/alerting in place
- [ ] Rollback procedure documented
- [ ] Database migrations reversible
- [ ] Dependency updates reviewed
- [ ] Changelog updated
- [ ] Stakeholders notified
```

### Log Output
Save review to `~/.claude/logs/ship/YYYYMMDD-HHMMSS-<project>.md`

## Principles

**Think like support, not engineering.** A passing test suite means nothing if users can't figure out the feature.

**Evidence over opinion.** Every finding links to a screenshot, file reference, or test output.

**The user is tired, distracted, on their phone, and in a hurry.** Design your review around that person, not the careful power user who reads docs.

**"Technically correct" is not shipping.** If it works but confuses users, it's a bug.

**Be specific.** "UX could be better" is not a finding. "Submit button says 'Execute' which sounds scary for a save operation" is a finding.

## Cleanup

After review is complete and user has seen findings:
- Kill any background processes started during testing (use saved PIDs)
- Evidence directory stays in /tmp (auto-cleans on reboot)
- DO NOT kill browsers or dev tools (respect safety-guard)
