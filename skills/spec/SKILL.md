---
name: spec
description: Build feature specifications iteratively with visual feedback, auto-suggested polish features, and triple QA. Outputs structured specs for meta-review pattern detection.
---

# /spec - Feature Specification Pipeline

> **!tokenburner** — iterative spec building with 6-reviewer QA gauntlet. expect high token usage.

Build specs through conversation, generate comprehensive markdown, run triple QA.

## Invocation

```
/spec                     # start fresh, ask what to spec
/spec [feature-name]      # start with feature name
/spec --resume            # continue last spec in progress
```

## Workflow Overview

```
Phase 1: Discovery → Phase 2: Feature Tree → Phase 3: Deep Dive
    → Phase 4: Generate Spec → Phase 5: Triple QA → Done
```

## Phase 1: Discovery

**Goal**: Understand what we're building

**Actions**:
1. If no feature name provided, ask: "What are we speccing today?"
2. Clarify with focused questions:
   - What problem does this solve?
   - Who uses it?
   - What's the scope boundary? (what's explicitly OUT)
   - Any hard constraints?
3. Summarize understanding, confirm before proceeding

**Output**: Mental model of the feature, stored in working memory

---

## Phase 2: Feature Tree

**Goal**: Break down into features with "taste" sub-features

**Actions**:
1. Identify 3-7 main features/components
2. For EACH feature, generate:
   - **Core**: The essential functionality
   - **Taste**: Polish details that show care (auto-suggested, see below)
   - **Edge Cases**: What could break or confuse

3. Start HTML dashboard: `bun ~/.claude/skills/spec/dashboard.ts`
4. Update dashboard with feature tree as you build it

**Taste Auto-Suggestions** (suggest these proactively):

| Category | Examples |
|----------|----------|
| Loading states | Skeleton loaders, progress indicators, optimistic updates |
| Error handling | Graceful degradation, helpful error messages, retry options |
| Accessibility | Keyboard navigation, screen reader support, focus management |
| Feedback | Success confirmations, undo options, state persistence |
| Performance | Lazy loading, caching, debouncing |
| Edge UX | Empty states, first-run experience, offline behavior |
| Polish | Animations, transitions, micro-interactions |

When suggesting taste features, frame as: "For [feature], I'd suggest these polish touches: [list]. Keep all / drop any?"

**Dashboard Update**:
Write to `~/.claude/skills/spec/.dashboard-state.json`:
```json
{
  "specName": "feature-name",
  "phase": "feature-tree",
  "features": [
    {
      "id": "α",
      "name": "Feature Name",
      "status": "drafting",
      "core": "...",
      "taste": ["...", "..."],
      "edges": ["...", "..."]
    }
  ],
  "lastUpdate": "ISO timestamp"
}
```

---

## Phase 3: Deep Dive

**Goal**: Refine each feature through targeted questions

**Actions**:
1. For each feature group, use AskUserQuestion:
   - Implementation preferences
   - Priority of taste features
   - Edge case handling decisions

2. Allow iteration:
   - User can say "expand α" to drill into a feature
   - User can say "drop β.taste[2]" to remove a taste feature
   - User can say "add edge case to γ" to extend

3. Update dashboard status as features are refined (drafting → refined)

**Question Patterns**:
```
Feature α: [Name]
Core: [description]

Taste suggestions:
1. [taste 1] - [why it matters]
2. [taste 2] - [why it matters]
3. [taste 3] - [why it matters]

Keep all? Or specify which to drop/modify.
```

---

## Phase 4: Generate Spec

**Goal**: Output comprehensive markdown specification

**Actions**:
1. Create `.claude/specs/` directory if needed
2. Generate spec file: `.claude/specs/{feature-name}.md`
3. Use template below with YAML frontmatter for meta-review
4. **Log invocation** for central sync (append to `~/.claude/logs/invocations.jsonl`):
   ```json
   {"timestamp":"ISO","skill":"spec","project":"$(pwd)","file":"{feature-name}.md"}
   ```

**Spec Template**:

```markdown
---
feature: {feature-name}
created: {ISO timestamp}
status: draft | reviewed | approved
complexity: low | medium | high
domain: {auto-detected or asked}
patterns:
  - {pattern tags for meta-review}
taste_count: {number of taste features included}
edge_count: {number of edge cases identified}
qa_pass: false
qa_reviewers: 6
qa_verdict: {ready to build / needs work / major rethink}
council_reviewed: false
council_cost: null
---

# {Feature Name} Specification

## Summary
{3-5 sentence overview}

## Goals
- Primary: {main goal}
- Success metrics: {how we know it works}

## Non-Goals (Explicit Scope Boundaries)
- {what this does NOT do}

---

## Feature Breakdown

### α. {Feature 1 Name}

**Core Requirement**
{What it must do}

**Taste (Polish Details)**
- {taste 1}: {brief description}
- {taste 2}: {brief description}

**Edge Cases**
- {edge 1}: {how to handle}
- {edge 2}: {how to handle}

**Implementation Notes**
{Any technical considerations}

---

### β. {Feature 2 Name}
...

---

## Technical Approach
{High-level implementation strategy}

## Dependencies
- {External services, libraries, etc.}

## Open Questions
- [ ] {Unresolved decision 1}
- [ ] {Unresolved decision 2}

---

## QA Gauntlet Findings

### 1. Corner Cases (qa-gremlin)
{Populated after QA}

### 2. Readability (ux-reviewer)
{Populated after QA}

### 3. Security (security-reviewer)
{Populated after QA}

### 4. Performance (perf-reviewer)
{Populated after QA}

### 5. Architecture (architect)
{Populated after QA}

### 6. Buildability (dev-reviewer)
{Populated after QA}
**Verdict**: {ready to build / needs work / major rethink}

### Consensus Issues
{Issues flagged by multiple reviewers}

### Debates
{Points where reviewers disagreed}

---

## Council Review (if run)

### GPT-5.2
{External perspective}

### Gemini 3 Pro
{External perspective}

### New Findings
{Things subagents missed}

### Reinforced
{Council agreed with subagents}

---

<details>
<summary>Revision History</summary>

| Date | Change | By |
|------|--------|-----|
| {date} | Initial draft | Claude |

</details>
```

---

## Phase 5: Serial QA Gauntlet

**Goal**: Stress-test the spec through 6 specialist reviewers, each building on previous findings

**Key Principle**: Reviewers run in SERIES, not parallel. Each sees all previous findings and can concur, challenge, or add new concerns. This creates a compounding review where later reviewers catch what earlier ones missed.

**The Gauntlet** (in order):

### Step 1: qa-gremlin (Corner Cases & Chaos)
```
Task(subagent_type="qa-gremlin", description="spec corner cases"):
  "Review this specification for corner cases, edge chaos, and failure modes.
   Focus on: race conditions, invalid inputs, state inconsistencies,
   real user behavior that breaks assumptions, malformed data, timeout scenarios.

   Spec: [full spec content]

   Output format:
   CRITICAL: [issues that would cause failures]
   MODERATE: [issues that would cause confusion]
   MINOR: [nice-to-handle edge cases]"
```

### Step 2: ux-reviewer (Clarity & Readability)
```
Task(subagent_type="ux-reviewer", description="spec readability"):
  "Review this specification for clarity and readability.
   Focus on: ambiguous language, missing context, unclear success criteria,
   sections that would confuse an implementer.

   Previous findings from qa-gremlin:
   [insert qa-gremlin output]

   Spec: [full spec content]

   Output format:
   UNCLEAR: [sections needing clarification]
   VERBOSE: [sections that could be tighter]
   MISSING: [context an implementer would need]
   CONCUR/CHALLENGE: [responses to previous reviewer]"
```

### Step 3: security-reviewer (Attack Vectors & Data Safety)
```
Task(subagent_type="security-reviewer", description="spec security"):
  "Review this specification for security concerns.
   Focus on: authentication gaps, authorization holes, data exposure,
   injection vectors, secrets handling, audit trail gaps.

   Previous findings:
   - qa-gremlin: [summary]
   - ux-reviewer: [summary]

   Spec: [full spec content]

   Output format:
   CRITICAL: [exploitable vulnerabilities]
   MODERATE: [defense-in-depth gaps]
   MINOR: [hardening suggestions]
   CONCUR/CHALLENGE: [responses to previous reviewers]"
```

### Step 4: perf-reviewer (Bottlenecks & Scale)
```
Task(subagent_type="perf-reviewer", description="spec performance"):
  "Review this specification for performance concerns.
   Focus on: N+1 queries, missing caching, unbounded operations,
   blocking calls, payload sizes, connection pooling.

   Previous findings:
   - qa-gremlin: [summary]
   - ux-reviewer: [summary]
   - security-reviewer: [summary]

   Spec: [full spec content]

   Output format:
   CRITICAL: [will not scale]
   MODERATE: [performance debt]
   MINOR: [optimization opportunities]
   CONCUR/CHALLENGE: [responses to previous reviewers]"
```

### Step 5: architect (System Boundaries & Contracts)
```
Task(subagent_type="architect", description="spec architecture"):
  "Review this specification for architectural soundness.
   Focus on: coupling, contracts, failure domains, migration paths,
   extensibility, integration points, state management.

   Previous findings:
   - qa-gremlin: [summary]
   - ux-reviewer: [summary]
   - security-reviewer: [summary]
   - perf-reviewer: [summary]

   Spec: [full spec content]

   Output format:
   STRUCTURAL: [architectural concerns]
   CONTRACTS: [missing or unclear interfaces]
   EVOLUTION: [future-proofing gaps]
   CONCUR/CHALLENGE: [responses to previous reviewers]"
```

### Step 6: dev-reviewer (Buildability & Practicality)
```
Task(subagent_type="dev-reviewer", description="spec practicality"):
  "Review this specification from a builder's perspective.
   Focus on: is this actually implementable? Missing details that would
   block development, unclear acceptance criteria, testing gaps.

   Previous findings:
   - qa-gremlin: [summary]
   - ux-reviewer: [summary]
   - security-reviewer: [summary]
   - perf-reviewer: [summary]
   - architect: [summary]

   Spec: [full spec content]

   Output format:
   BLOCKED: [can't build without this info]
   UNCLEAR: [would need to ask questions]
   TESTING: [how do we verify this works?]
   CONCUR/CHALLENGE: [responses to previous reviewers]
   FINAL_VERDICT: [ready to build / needs work / major rethink]"
```

### After All Subagents Complete

1. Collect all findings into spec's QA section
2. Update frontmatter: `qa_pass: true/false`, `qa_reviewers: 6`
3. Update dashboard status

**Present Summary to User**:
```
Serial QA Complete (6 reviewers).

Consensus (multiple reviewers flagged):
- [issue] (flagged by: gremlin, security, architect)

Critical Issues:
- [issue] - [reviewer]

Moderate Issues:
- [issue] - [reviewer]

Debates (reviewers disagreed):
- [topic]: gremlin says X, architect says Y

Ready to build? dev-reviewer says: [verdict]

Options:
1. Address issues now
2. Save spec as-is
3. Run council review (GPT-5.2 + Gemini 3 Pro) for external perspective
```

---

## Phase 6: Council Review (Optional)

**Trigger**: User selects option 3 after subagent QA, or runs `/spec --council`

**NOT test mode** - uses real external APIs (GPT-5.2, Gemini 3 Pro) for genuine outside perspectives.

**Actions**:
1. Ask user: "Run council review? This uses external APIs (~$0.90-1.50). [y/n]"
2. If yes, invoke `/council .claude/specs/{name}.md`
3. Council sees:
   - Full spec
   - Summary of subagent findings
   - Specific question: "Given these internal findings, what did we miss?"

**Council adds value by**:
- Different model architectures catch different blindspots
- External perspective not biased by codebase familiarity
- Cross-checks assumptions the Opus subagents share

**After Council**:
1. Append council findings to spec
2. Update frontmatter: `council_reviewed: true`, `council_cost: $X.XX`
3. Present final summary with all findings

```
Council Review Complete.

New findings (not caught by subagents):
- [issue] - GPT-5.2
- [issue] - Gemini 3

Reinforced concerns (council agreed with subagents):
- [issue]

Contested (council disagreed with subagents):
- [topic]: subagents said X, GPT-5.2 says Y

Spec updated. Ready to build?
```

---

## Dashboard Server

The dashboard runs at `http://localhost:8850` and shows:
- Feature tree with Greek letter IDs
- Status badges (drafting → refined → qa-passed)
- Mermaid diagrams for complex flows
- Click-to-copy feature IDs

Start: `bun ~/.claude/skills/spec/dashboard.ts`
Stop: Kill process on port 8850

---

## Meta-Review Support

Specs are designed for later pattern analysis:

**Frontmatter fields for querying**:
- `domain`: What area (auth, payments, UI, etc.)
- `patterns`: Tags like `crud`, `realtime`, `external-api`, `state-machine`
- `complexity`: Rough sizing
- `taste_count`: How much polish was included
- `edge_count`: How thorough on edge cases

**Run meta-review**:
```bash
# Find all specs
fd -e md . .claude/specs/

# Extract patterns across specs (future: dedicated tool)
rg "^patterns:" .claude/specs/ -A 5
```

---

## Resuming Work

If interrupted:
1. Dashboard state persists in `.dashboard-state.json`
2. Partial specs save to `.claude/specs/{name}.draft.md`
3. `/spec --resume` picks up where you left off

---

## Error Handling

| Situation | Action |
|-----------|--------|
| Dashboard port in use | Kill existing, restart |
| User abandons mid-spec | Save draft, note phase |
| QA agent timeout | Report partial results, continue |
| User wants to skip QA | Allow with warning, mark `qa_pass: skipped` |

---

## Integration Points

- **Council**: Run `/council .claude/specs/{name}.md` for architecture review
- **Feature-dev**: Use spec as input to `/feature-dev`
- **Builder agent**: Reference spec during implementation

---

## Example Session

```
> /spec user-notifications

Discovery: What problem does this solve?
User: Users miss important updates, want push + in-app

Feature Tree:
α. Push Notification System
β. In-App Notification Center
γ. User Preferences
δ. Notification Templates

[Dashboard updates with tree]

Deep Dive on α:
Core: Send push notifications via FCM/APNs
Taste suggestions:
1. Quiet hours - respect user's sleep
2. Notification grouping - don't spam
3. Rich notifications - images, actions
Keep all?

User: drop 3, add "delivery confirmation"

[Continues through each feature...]

[Generates spec, runs QA, presents findings]

Done. Spec saved to .claude/specs/user-notifications.md
QA: 2 critical, 3 moderate, 5 minor findings.
Address critical issues? [yes/no/later]
```
