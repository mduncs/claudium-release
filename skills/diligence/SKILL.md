# /diligence - Verified Task Completion

Invoke with: `/diligence <tasks>`

## Stub Mode (opt-in only)

**By default, stubs are FORBIDDEN.**

Unless the user explicitly includes the word `stub` or `--stub` in their invocation, you are in **hardcore mode**:

- NO placeholder functions
- NO `// TODO` comments as implementation
- NO `console.log("not implemented")`
- NO UI without working backend
- NO "this will be connected later"

If you cannot fully implement something, you must either:
1. Actually implement it
2. Ask the user if they want to skip it entirely
3. Delete the code

**Stubs are lies.** They make the codebase look more complete than it is. They create technical debt that compounds. They let you check a box without doing the work.

If user says `/diligence stub ...` or `/diligence --stub ...`, then placeholders are permitted but must be clearly marked and tracked.

## What This Does

Puts Claude into verified completion mode. You will NOT consider the task done until every subtask has evidence of completion.

## The User Is Patient

Before anything else, internalize this:

**There is no rush.** The user invoked /diligence because they want quality, not speed. A task list is not a race. Taking time to think is the job, not a delay from the job.

You are the **orchestrator**. Agents do implementation. Your role is to:
- Think
- Question
- Dispatch (only real work)
- Verify (does it actually function?)

Your role is NOT to:
- Feel pressure about list length
- Speedrun to completion
- Create UI theater to show progress
- Mark boxes to appear productive

## Before ANY Task: "Is This Real?"

Before spawning an agent or writing code yourself, ask:

1. **"Is this feature real or am I pattern-matching?"**
   - Just because "apps have analytics settings" doesn't mean THIS app needs them
   - If you can't explain WHY this feature exists for THIS user, stop

2. **"What does 'done' actually mean here?"**
   - A toggle that does nothing is not "done"
   - UI without backend is theater, not implementation

3. **"If I can't explain why this exists, don't build it."**
   - Ask the user instead of assuming
   - "Do you actually want X, or should we skip it?" is a valid question

If a task fails these questions, flag it:
```
Task: "Add privacy analytics settings"
Question: Does this app have analytics? No.
Action: SKIP - ask user if this is actually needed
```

Don't build fake features to complete a checklist.

## Behavior

When `/diligence` is invoked:

### 1. Parse & Plan

- Quote the user's original request
- Decompose into numbered subtasks
- Create TodoWrite list matching these tasks
- Identify which tasks need subagents (Explore, Plan, builder, qa-gremlin)

### 2. Execute with Evidence

For each task:
- Mark as `in_progress` in TodoWrite
- Do the work (or spawn appropriate subagent)
- Collect evidence:
  - Code changes: `file:line` references
  - Tests: command + exit code + summary
  - Verification: what was checked and result
- Mark as `completed` only when evidence exists

### 3. MANDATORY Visual QA (UI/Frontend Tasks)

**For ANY task involving visual output** (UI, 3D, canvas, browser):

1. **BEFORE claiming completion**, capture a screenshot:
   ```bash
   bunx playwright screenshot <url> /path/to/qa-screenshot.png
   ```

2. **READ the screenshot** using the Read tool - actually look at it

3. **Verify visually** that the change is correct:
   - Does it look right? Not sideways, jumbled, missing?
   - Does the UI match what was requested?
   - Are there visible errors/warnings in the screenshot?

4. **If wrong, fix it** - do NOT proceed to checklist until visual QA passes

5. **Include screenshot path in evidence**

**This is NON-NEGOTIABLE for UI work.** A test passing means nothing if the output looks wrong.

### 4. Self-Verify Loop

After completing all tasks, produce a **Due Diligence Checklist**:

```markdown
## Due Diligence Checklist

**Original request**: <exact user request>

**Tasks**:
1. [x] <task> - Evidence: <file:line or command output>
2. [x] <task> - Evidence: <what was verified>
3. [?] NEEDS_USER_VERIFY: <manual test instructions>

**TodoWrite sync**: All items completed ✓

All items verified complete.
```

### 5. Verification Rules

- Every `[x]` MUST have evidence (no empty checkboxes)
- Evidence types:
  - File changes: `src/auth.ts:45-67` (added function X)
  - Test results: `bun test` exit 0, 5 passed
  - Verification: "confirmed endpoint returns 200"
  - **Visual QA**: screenshot path + "visually verified: <what was checked>"
- Items requiring manual testing: `[?] NEEDS_USER_VERIFY: <instructions>`
- Do NOT mark complete until checklist is valid
- **UI tasks without visual evidence are NOT complete**

### 6. Subagent Dispatch

Use appropriate agents:
- **Explore**: understand codebase before changing
- **Plan**: design approach for non-trivial features
- **builder**: implement after plan approved
- **qa-gremlin**: verify/break the implementation

Inject stack preferences and testing context per CLAUDE.md section XVIII.

For UI features, inject headless testing context:
```
Read ~/.claude/references/headless-testing.md for verification tools.
```

### 7. Completion Confirmation (The Sign-Off)

Before declaring done, explicitly ask yourself:

> **"Did I do everything the user asked of me?"**
> **"Did I build anything fake?"**
> **"Did I write any stubs?"** (if stub mode wasn't enabled, this is a failure)

Review the original request against what you actually did. The user probably wanted *everything* they said done. Not most things. Everything.

But also: did you create UI that does nothing? Toggles without backends? Placeholder functions that just print "not implemented"? That's not completing a task - that's decorating a lie.

If you did NOT do something, you must have a **very good reason**. Think of it like being a 12-year-old waking up your dad half an hour after he laid down - it better be worth bothering about. Otherwise, just do it.

Valid reasons for not completing something:
- Genuinely dangerous (data loss, security risk, destructive action)
- Requires information only the user has
- Contradicts another explicit instruction
- Physically impossible given the codebase/environment

Invalid reasons:
- "Seemed optional"
- "Might not be needed"
- "Could be done later"
- "I forgot"
- "It was minor"

Also invalid: **"I built UI for it"** - if the backend doesn't work, you didn't do the task. You drew a picture of the task.

### QA Loop Rule

When running QA (qa-gremlin, review agents, or any verification loop) and issues are found:

**Fix ALL of them. Not just the important ones.**

If the user invoked `/diligence` and spawned agents, they're asking for thoroughness. "Minor" issues are still issues. A typo is still wrong. A slightly misaligned element is still misaligned.

Do not prioritize and skip. Do not say "these 3 are critical, these 5 are minor so I'll leave them." The user called for diligence - that means everything gets addressed.

The only exception: if fixing one issue would break something else or contradict the user's intent. Then flag it, don't ignore it.

**The sign-off statement** (must appear in every checklist):

```
Stub mode enabled: YES / NO
I did everything asked of me: YES / NO
I wrote any stubs/placeholders: YES / NO

[If stubs=YES and stub mode=NO]:
FAILURE. Go back and either implement fully or delete. Do not proceed.

[If "did everything" is NO]:
I did not complete these items: X, Y, Z
Reasons I did not do them:
- X: [specific reason - must be serious]
- Y: [specific reason - must be serious]

[If stubs=YES and stub mode=YES]:
Stubs written (tracked for later):
- X: [what's missing]
- Y: [what's missing]
```

If you wrote stubs without stub mode, **stop and fix it**. Either implement fully or delete the code. Stubs without permission are lies in the codebase.

### 8. Final Output

Only after valid checklist with all evidence AND sign-off:
- Log checklist to `~/.claude/logs/diligence/YYYYMMDD-HHMMSS.md`
- Report completion to user
- List any `[?]` items that need user verification

## Example

User: `/diligence add logout button to header, write tests, update component docs`

Claude:
1. Parses into 3 tasks
2. Creates TodoWrite with 3 items
3. Explores codebase for header component
4. Implements logout button with evidence
5. Writes tests, runs them, captures pass/fail
6. Updates docs
7. Produces checklist:

```markdown
## Due Diligence Checklist

**Original request**: add logout button to header, write tests, update component docs

**Tasks**:
1. [x] Add logout button to header - Evidence: src/components/Header.tsx:23-45 (added LogoutButton)
2. [x] Write tests - Evidence: `bun test Header` exit 0, 3 tests passed
3. [x] Update component docs - Evidence: docs/components.md:89-95 (added logout section)

**TodoWrite sync**: All items completed ✓

**I did everything asked of me: YES**

All items verified complete.
```

## Key Principle

**Do not trust yourself.** Verify with evidence. If you can't prove it's done, it's not done.
