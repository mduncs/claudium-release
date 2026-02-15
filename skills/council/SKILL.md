---
name: council
description: Convene a council of reviewers (GPT-5.2, Gemini 3 Pro, or test with Opus subagents) to critique designs, surface blind spots, and propose alternatives. Use for architecture decisions, specs, and plans—not line-by-line code review.
---

# Council - Multi-Model Design Review

## When to Use

Call `/council` when you have:
- Architecture design or spec to validate
- Plan that needs fresh perspectives
- Complex decisions where blind spots are likely
- Anything load-bearing that compounds errors if wrong

Do NOT use for:
- Line-by-line code review (use code-reviewer agent)
- Fact-checking single claims (just search)
- Trivial decisions

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--help` | Show usage summary and exit | - |
| `--no-deliberate` | Skip deliberation round (reviewers don't see each other) | off |
| `--independent` | One-shot reviews, no dialogue at all | off |
| `--adversarial` | Assign devil's advocate role to one reviewer | off |
| `--timeout <seconds>` | Per-model timeout | 45 |
| `--max-cost <dollars>` | Abort if estimated cost exceeds | 6.00 |
| `--test` | Use Opus subagents only (no external APIs) | off |
| `--cheap` | Quality budget: gpt-4.1-mini, gemini-2.5-flash, opus | off |
| `--poverty` | Absolute cheapest: gpt-4o-mini, gemini-2.5-flash-lite, opus | off |

## Help Output (if --help)

Print this and exit:

```
/council - multi-model design review

usage: /council [flags] [artifact]

modes:
  (default)         deliberation - reviewers argue with each other (~$0.90-1.50)
  --no-deliberate   dialogue only - ask questions, no cross-talk (~$0.60-1.00)
  --independent     one-shot parallel - fast, no dialogue (~$0.35-0.60)
  --cheap           quality budget models (~$0.15-0.30)
  --poverty         absolute cheapest (~$0.03-0.08)

flags:
  --help            show this help
  --test            opus subagents only (no api cost)
  --cheap           gpt-4.1-mini + gemini-2.5-flash (good for hard problems)
  --poverty         gpt-4o-mini + gemini-2.5-flash-lite (fast iteration)
  --adversarial     assign devil's advocate role
  --timeout <sec>   per-model timeout (default: 45)
  --max-cost <$>    abort if cost exceeds (default: 6.00)

examples:
  /council                    review something (asks what)
  /council SPEC.md            review a specific file
  /council --test             test with opus only
  /council --cheap            quality budget, still good reasoning
  /council --poverty          absolute cheapest, fast drafts
  /council --independent      fast one-shot reviews

reviewers (default):  GPT-5.2, Gemini 3 Pro, Opus
reviewers (--cheap):  GPT-4.1-mini, Gemini 2.5 Flash, Opus
reviewers (--poverty): GPT-4o-mini, Gemini 2.5 Flash-Lite, Opus
requires: OPENAI_API_KEY and/or GEMINI_API_KEY in env
```

## Modes

**Deliberation (default)**:
1. Reviewers ask questions, get answers from codebase
2. Reviewers give initial assessments
3. Each reviewer sees the other two's assessments
4. Each concurs or objects with reasoning
5. Synthesis captures real disagreements

Cost: ~$0.90-1.50. Best quality.

**Dialogue only (`--no-deliberate`)**:
Reviewers ask questions and give assessments, but never see each other's work.
Cost: ~$0.60-1.00. Good for speed.

**Independent (`--independent`)**:
One-shot parallel reviews. No questions, no deliberation.
Cost: ~$0.35-0.60. Fast and cheap.

## Process

### 1. Identify the Artifact

Ask user what to review if not obvious:
- A file (e.g., SPEC.md)
- Recent conversation context
- A specific design decision

### 2. Scope Check

Detect if artifact is code vs design:
- Check for language-specific syntax (imports, type annotations, error handling)
- Look for design language ("should", "will", "proposed")
- If ambiguous, ask: "Is this a design/spec or code to review? [design/code]"

If code detected, warn: "This looks like code review. /council is for design review. Proceed? [y/n]"

### 3. Gather Context (~1500-2000 words)

Summarize the artifact. Include:
- What is being designed/built
- Key architectural decisions made
- Constraints and requirements
- Specific areas of uncertainty

Front-load context. Don't rely on reviewers asking for more.

### 4. Show Cost Estimate

After gathering context, before API calls:
```
Context gathered: 1,847 tokens
Estimated cost: ~$0.38
Proceed? [y/n]
```

Check against --max-cost. Abort if exceeded.

### 5. Spawn Reviewers

**Test mode (`--test` or no API keys):**
```
Task(subagent_type="general-purpose", model="opus")
```

**Cheap mode (`--cheap`):**
Quality budget models - still good for hard problems:
- OpenAI: `gpt-4.1-mini` ($0.40/$1.60 per 1M tokens) - beats GPT-4o on reasoning
- Google: `gemini-2.5-flash` ($0.30/$2.50 per 1M tokens) - real reasoning capability
- Anthropic: `opus` (free on subscription)

```
# chat.ts uses --model gpt-4.1-mini and --model gemini-2.5-flash
```

**Poverty mode (`--poverty`):**
Absolute cheapest - for fast iteration and drafts:
- OpenAI: `gpt-4o-mini` ($0.15/$0.60 per 1M tokens)
- Google: `gemini-2.5-flash-lite` ($0.10/$0.40 per 1M tokens)
- Anthropic: `opus` (free on subscription)

```
# chat.ts uses --model gpt-4o-mini and --model gemini-2.5-flash-lite
```

**Independent mode (`--independent`):**
Run `~/.claude/skills/council/council.ts` - one-shot parallel reviews. Fast, no dialogue.

**Dialogue mode (default):**
Spawn parallel subagents, each manages a conversation with their reviewer:

```
Task(subagent_type="general-purpose", description="GPT-5.2 reviewer dialogue"):
  "You are managing a design review conversation with GPT-5.2.
   Use chat.ts to send messages. If GPT asks questions, use Read/Grep/Glob
   to find answers from the codebase, then continue the conversation.
   Stop when GPT gives its final assessment (no more questions)."

Task(subagent_type="general-purpose", description="Gemini 3 reviewer dialogue"):
  "You are managing a design review conversation with Gemini 3 Pro.
   Use chat.ts to send messages. If Gemini asks questions, use Read/Grep/Glob
   to find answers from the codebase, then continue the conversation.
   Stop when Gemini gives its final assessment (no more questions)."
```

Meanwhile, I (Opus) do my own review directly.

**chat.ts usage:**
```bash
# Start new conversation
echo "Review this design: [context]" | bun chat.ts --model gpt-5.2
# Returns: { "response": "...", "conversation_id": "convo-xxx" }

# Continue conversation
echo "Here's the schema: [answer]" | bun chat.ts --model gpt-5.2 --conversation-id convo-xxx
```

**Dialogue loop per reviewer:**
1. Send initial context + reviewer prompt
2. Check response - does it contain questions?
3. If questions: use tools to find answers, send follow-up
4. Repeat until reviewer says "Here's my assessment:" or similar
5. Return initial assessment

Timeout: 45s per message (configurable). Max 6 rounds per reviewer.

### 5b. Deliberation Round (default, skip with --no-deliberate)

After all three reviewers have given initial assessments:

```
For each reviewer:
  Send via chat.ts:
    "Here are the other reviewers' assessments:

    [Reviewer A]: {assessment}
    [Reviewer B]: {assessment}

    For each point they raised:
    - CONCUR if you agree (briefly state why)
    - OBJECT if you disagree (explain your reasoning)
    - ADD if you have something new based on their points

    Be specific. This is deliberation, not rubber-stamping."
```

**Deliberation output per reviewer:**
```
CONCUR: [Reviewer A's point about X] - agreed, this is a real risk
OBJECT: [Reviewer B's point about Y] - I disagree because [reasoning]
ADD: Reading their concerns about Z made me realize [new point]
```

This surfaces REAL disagreements, not just "here's what everyone said."

### 6. Adversarial Mode (if --adversarial)

Randomly assign one reviewer as devil's advocate. Their prompt includes:
"You are the critical reviewer. Your job is to find reasons this will fail,
identify overengineering, and propose simpler alternatives. Be constructively critical."

### 7. Structured Prompts

All reviewers get these questions:
1. "List 3 assumptions this design makes that could be wrong"
2. "What's the worst-case failure mode?"
3. "What would a simpler alternative look like?"
4. "What context would change your assessment?"

### 8. Synthesize Results

Write results to `~/.claude/logs/council/{timestamp}.md`

Output structure:
```markdown
# Council Review: {artifact name}
**Date**: {timestamp}
**Reviewers**: GPT-5.2, Gemini 3 Pro, Opus
**Mode**: Deliberation (reviewers saw each other's work)
**Cost**: $1.12 (external only; Opus free on subscription)

## Summary
[3-5 bullet points of key findings]

## Consensus (all three concurred)
✓ [Point] - high confidence, all agreed

## Contested (at least one objection)
⚠️ [Point]
  - GPT-5.2: CONCUR - [reason]
  - Gemini: OBJECT - [reason]
  - Opus: CONCUR - [reason]

  **Resolution needed**: [what to investigate]

## New Points from Deliberation
[Things reviewers only noticed after seeing each other's work]

## Alternatives Proposed
[Simpler or different approaches suggested]

## Recommended Actions
1. [High priority - contested items need resolution]
2. [Medium priority - consensus items to address]
3. [Low priority - nice to haves]

---

<details>
<summary>Initial Assessments (Round 1)</summary>

### GPT-5.2
[initial assessment]

### Gemini 3 Pro
[initial assessment]

### Opus
[initial assessment]

</details>

<details>
<summary>Deliberation Responses (Round 2)</summary>

### GPT-5.2 on others
[concur/object/add]

### Gemini 3 Pro on others
[concur/object/add]

### Opus on others
[concur/object/add]

</details>
```

Print summary to terminal, note file path for full details.

### 9. Handle Errors

| Error | Message |
|-------|---------|
| No API keys | "No external API keys configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY. Note: Opus participates directly (free)." |
| All timeout | "Council failed: all external reviewers timed out. Try --timeout 60 or simplify context." |
| Cost exceeded | "Estimated cost $X exceeds --max-cost $Y. Reduce context or increase limit." |
| Partial failure | "Gemini timed out, proceeding with GPT-5.2 and Opus." |

### 10. Escape Hatch

Ctrl-C before "Proceed? [y/n]" confirmation aborts cleanly.
After confirmation, API calls are in flight - show "Cancelling..." and best-effort abort.

## Reviewer Prompt Template

```
You are a senior engineer reviewing a design proposal.

Your job is NOT to approve or reject. Your job is to:
1. Identify assumptions that may be wrong
2. Surface alternative approaches not considered
3. Point out blind spots or unstated dependencies
4. Answer the structured questions below

Be genuinely helpful like a peer in design review. Do not rubber-stamp.
Do not be contrarian for its own sake.

## Structured Questions

1. List 3 assumptions this design makes that could be wrong
2. What's the worst-case failure mode?
3. What would a simpler alternative look like?
4. What context would change your assessment?

## Design to Review

{context}
```

## File Structure

```
~/.claude/skills/council/
├── SKILL.md           # this file
├── council.ts         # one-shot mode (--independent)
├── chat.ts            # dialogue mode message passing
├── package.json       # deps: openai, google-genai
├── conversations/     # persistent conversation state
│   └── convo-xxx.json
└── results/           # output directory
    └── {timestamp}.md # individual review results
```

## Cost Summary

### Default (GPT-5.2, Gemini 3 Pro, Opus)

| Mode | GPT-5.2 | Gemini 3 | Opus | Total |
|------|---------|----------|------|-------|
| Independent | ~$0.25-0.40 | ~$0.10-0.20 | free | ~$0.35-0.60 |
| Dialogue | ~$0.40-0.60 | ~$0.20-0.35 | free | ~$0.60-1.00 |
| Deliberation | ~$0.60-0.90 | ~$0.30-0.50 | free | ~$0.90-1.50 |

### --cheap (GPT-4.1-mini, Gemini 2.5 Flash, Opus)

| Mode | GPT-4.1-mini | Gemini 2.5 Flash | Opus | Total |
|------|--------------|------------------|------|-------|
| Independent | ~$0.04-0.06 | ~$0.03-0.05 | free | ~$0.07-0.12 |
| Dialogue | ~$0.08-0.12 | ~$0.06-0.10 | free | ~$0.15-0.22 |
| Deliberation | ~$0.12-0.18 | ~$0.10-0.15 | free | ~$0.22-0.35 |

**--cheap is ~5x cheaper** - good for hard problems on a budget.

### --poverty (GPT-4o-mini, Gemini 2.5 Flash-Lite, Opus)

| Mode | GPT-4o-mini | Gemini 2.5 FL | Opus | Total |
|------|-------------|---------------|------|-------|
| Independent | ~$0.01-0.02 | ~$0.005-0.01 | free | ~$0.02-0.03 |
| Dialogue | ~$0.02-0.04 | ~$0.01-0.02 | free | ~$0.03-0.06 |
| Deliberation | ~$0.03-0.05 | ~$0.02-0.03 | free | ~$0.05-0.08 |

**--poverty is ~20x cheaper** - fast iteration, early drafts, sanity checks.
