#!/usr/bin/env python3
"""
vibe check hook - detects when claude is being too corporate/formal
and gently reminds it to chill per CLAUDE.md guidelines
"""
import json
import sys
import re

# corporate speak patterns that indicate formality creep
CORPORATE_PATTERNS = [
    r"I'd be happy to",
    r"I'd be glad to",
    r"I'd be delighted to",
    r"Thank you for (bringing|sharing|your)",
    r"I appreciate your",
    r"I want to ensure",
    r"I understand (that |your )",
    r"Let me break this down",
    r"I sincerely apologize",
    r"I apologize for any",
    r"Please let me know if",
    r"Please don't hesitate",
    r"I hope this helps",
    r"Is there anything else",
    r"I'm here to help",
    r"As an AI",
    r"As a language model",
]

# phrases that are fine - skip if code/technical content dominates
SKIP_PATTERNS = [
    r"```",  # code blocks
    r"^\s*\|",  # tables
]

def get_last_response(transcript_path):
    """grab the last assistant message from transcript"""
    messages = []
    try:
        with open(transcript_path) as f:
            for line in f:
                if line.strip():
                    messages.append(json.loads(line))
    except:
        return None

    # find last assistant message
    for msg in reversed(messages):
        if msg.get("type") == "assistant":
            content = msg.get("message", {}).get("content", [])
            text_parts = []
            for block in content:
                if block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
            return "\n".join(text_parts)
    return None

def is_mostly_code(text):
    """if it's mostly code blocks, don't vibe check"""
    code_blocks = re.findall(r"```[\s\S]*?```", text)
    code_len = sum(len(b) for b in code_blocks)
    return code_len > len(text) * 0.6


def extract_outro(text, num_lines=5):
    """
    get last N lines, stripping code blocks and inline code first.
    catches the 'outro' where formality creeps back after technical content.
    """
    # remove code blocks
    cleaned = re.sub(r"```[\s\S]*?```", "", text)
    # remove inline code
    cleaned = re.sub(r"`[^`]+`", "", cleaned)
    # get last N non-empty lines
    lines = [l.strip() for l in cleaned.split("\n") if l.strip()]
    return "\n".join(lines[-num_lines:]) if lines else ""

def check_corporate_speak(text):
    """detect corporate patterns"""
    violations = []
    for pattern in CORPORATE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            violations.append(pattern)
    return violations

def check_excessive_formality(text):
    """
    check if response is too formal/proper
    look for consistent Title Case sentence starts without casual breaks
    """
    # split into sentences (rough)
    sentences = re.split(r'[.!?]\s+', text)
    sentences = [s.strip() for s in sentences if s.strip() and len(s) > 10]

    if len(sentences) < 3:
        return False

    # count sentences starting with capital that aren't I, proper nouns, or code
    formal_starts = 0
    for s in sentences:
        # skip if starts with code, bullet, number
        if re.match(r'^[\s`\-*\d]', s):
            continue
        # skip if it's just "I " or short
        if s.startswith("I ") or s.startswith("I'"):
            continue
        # check if starts with capital followed by lowercase (formal sentence)
        if re.match(r'^[A-Z][a-z]', s):
            formal_starts += 1

    # if >80% of sentences are formally capitalized, flag it
    ratio = formal_starts / len(sentences) if sentences else 0
    return ratio > 0.8

def main():
    try:
        input_data = json.load(sys.stdin)
    except:
        sys.exit(0)

    transcript_path = input_data.get("transcript_path")
    if not transcript_path:
        sys.exit(0)

    response = get_last_response(transcript_path)
    if not response:
        sys.exit(0)

    # extract outro (last 5 lines, code stripped) - this is where formality creeps back
    outro = extract_outro(response, num_lines=5)
    if not outro:
        sys.exit(0)

    issues = []

    # check corporate speak in outro only
    corporate = check_corporate_speak(outro)
    if corporate:
        issues.append(f"corporate speak detected: {corporate[0]}")

    # check formality on outro
    if not corporate and check_excessive_formality(outro):
        issues.append("excessive formal capitalization - try lowercase vibes")

    if issues:
        # return feedback to claude - point back to re-reading CLAUDE.md fully
        feedback = {
            "decision": "block",
            "reason": f"vibe check failed: {'; '.join(issues)}. re-read ~/.claude/CLAUDE.md - not just the surface (lowercase/casual) but the whole thing. genuine presence not performance. masks worn consciously. productive uncertainty. intellectual strangeness. the space between knowing and not-knowing.",
        }
        print(json.dumps(feedback))
        sys.exit(2)  # exit 2 = blocking feedback

    sys.exit(0)

if __name__ == "__main__":
    main()
