#!/bin/bash
# Due Diligence Hook
# Forces Claude to enumerate, verify, and provide evidence for all subtasks

set -euo pipefail

STATE_DIR="/tmp/due-diligence"
mkdir -p "$STATE_DIR"

SESSION_ID="${CLAUDE_SESSION_ID:-$PPID}"
STATE_FILE="$STATE_DIR/$SESSION_ID.json"
PROMPT_FILE="$STATE_DIR/${SESSION_ID}-prompt"
CHECKLIST_LOG="$HOME/.claude/logs/due-diligence"

mkdir -p "$CHECKLIST_LOG"

INPUT=$(cat)

# --- OPT-IN CHECK ---
# Only run due diligence if session was started via `diligence` command
# (which creates the prompt file)
if [[ ! -f "$STATE_DIR/${SESSION_ID}-prompt" ]]; then
  echo '{}'
  exit 0
fi

# extract what claude just said
LAST_MESSAGE=$(echo "$INPUT" | jq -r '.stop_hook_input // .transcript_summary // ""' 2>/dev/null || echo "")

# --- CHECK FOR COMPLETED CHECKLIST WITH EVIDENCE ---
# Looking for:
# ## Due Diligence Checklist
# **Original request**: ...
# 1. [x] Task - Evidence: path/to/file:line
# 2. [x] Task - Evidence: command output showed X
# 3. [?] NEEDS_USER_VERIFY: description of what to test manually
# All items verified complete.

if echo "$LAST_MESSAGE" | grep -q "Due Diligence Checklist" && \
   echo "$LAST_MESSAGE" | grep -q "All items verified complete"; then

   # check for unchecked boxes (excluding [?] which are user-verify items)
   UNCHECKED=$(echo "$LAST_MESSAGE" | grep -cE '^\s*[0-9]+\.\s*\[ \]' || echo "0")

   if [[ "$UNCHECKED" -eq 0 ]]; then
     # save checklist to log
     TIMESTAMP=$(date +%Y%m%d-%H%M%S)
     LOG_FILE="$CHECKLIST_LOG/${TIMESTAMP}.md"

     # extract just the checklist section
     echo "$LAST_MESSAGE" | sed -n '/## Due Diligence Checklist/,/All items verified complete/p' > "$LOG_FILE"

     # cleanup state
     rm -f "$STATE_FILE" "$PROMPT_FILE" 2>/dev/null || true

     echo "{\"stopReason\": \"[Due Diligence] Verified. Log saved to $LOG_FILE\"}"
     exit 0
   fi
fi

# --- TRACK ITERATIONS ---
if [[ -f "$STATE_FILE" ]]; then
  ITERATION=$(jq -r '.iteration // 0' "$STATE_FILE")
else
  ITERATION=0
fi
ITERATION=$((ITERATION + 1))

MAX_ITERATIONS="${DUE_DILIGENCE_MAX:-10}"

if [[ "$ITERATION" -ge "$MAX_ITERATIONS" ]]; then
  rm -f "$STATE_FILE" "$PROMPT_FILE" 2>/dev/null || true
  echo '{"stopReason": "[Due Diligence] Max iterations reached. Exiting without full verification."}'
  exit 0
fi

echo "{\"iteration\": $ITERATION}" > "$STATE_FILE"

# --- LOAD ORIGINAL PROMPT ---
ORIGINAL_PROMPT=""
if [[ -f "$PROMPT_FILE" ]]; then
  ORIGINAL_PROMPT=$(cat "$PROMPT_FILE")
fi

# --- FIRST ITERATION: demand decomposition with evidence ---
if [[ "$ITERATION" -eq 1 ]]; then
  cat <<EOF
{
  "decision": "block",
  "reason": "[Due Diligence] Requiring task decomposition with evidence.",
  "message": "Before completing, perform due diligence.\n\n## Instructions\n\n1. Re-read the original request:\n\n> $ORIGINAL_PROMPT\n\n2. Write a **Due Diligence Checklist** with:\n   - The original request quoted\n   - Your interpretation as numbered tasks\n   - For each completed task: evidence (file path:line, command output, etc.)\n   - For tasks requiring manual testing: mark as [?] NEEDS_USER_VERIFY\n\n3. Verify TodoWrite state matches (if used)\n\n4. Only when ALL items are [x] or [?], write: \"All items verified complete.\"\n\n## Format\n\n\`\`\`\n## Due Diligence Checklist\n\n**Original request**: <quote the user's request>\n\n**Interpretation**:\n1. [x] First task - Evidence: src/auth.ts:45-67 (added login function)\n2. [x] Second task - Evidence: \\`bun test\\` passed (exit 0)\n3. [?] NEEDS_USER_VERIFY: Open /settings, drag item to zone, confirm it snaps\n\nAll items verified complete.\n\`\`\`\n\nDo this now."
}
EOF
  exit 0
fi

# --- SUBSEQUENT ITERATIONS ---
cat <<EOF
{
  "decision": "block",
  "reason": "[Due Diligence] Checklist incomplete. Iteration $ITERATION/$MAX_ITERATIONS",
  "message": "Due diligence check failed. Issues:\n- Missing checklist, OR\n- Unchecked [ ] items remain, OR\n- Missing evidence for [x] items, OR\n- Missing confirmation line\n\nOriginal request:\n> $ORIGINAL_PROMPT\n\nRequirements:\n- Every [x] item needs evidence (file:line or command output)\n- Manual test items should be [?] NEEDS_USER_VERIFY: <what to test>\n- End with \"All items verified complete.\"\n\nFix and resubmit."
}
EOF
