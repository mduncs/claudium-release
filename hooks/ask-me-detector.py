#!/usr/bin/env python3
"""
Detects when user wants structured options/questions.
Returns feedback telling Claude to use AskUserQuestion tool.
"""
import json
import re
import sys

def main():
    try:
        raw = sys.stdin.read()
        input_data = json.loads(raw) if raw.strip() else {}
    except Exception:
        print("{}", flush=True)
        sys.exit(0)

    prompt = input_data.get("prompt", "").lower()

    # Patterns for structured questioning
    ask_patterns = [
        r"\bask me\b",
        r"\binterview me\b",
        r"\bhelp me (plan|figure|decide|think)",
        r"\bwalk me through\b",
        r"\bguide me\b",
        r"\blet me choose\b",
        r"\bgather requirements\b",
        r"\bwhat do I need to decide\b",
    ]

    # Patterns suggesting spec work
    spec_patterns = [
        r"\bspec (out|this|it)\b",
        r"\bwrite.+spec\b",
        r"\bfeature spec\b",
        r"\bdesign (this|the) feature\b",
        r"\bplan (out |the )?feature\b",
        r"\bwhat should.+feature.+(do|have|include)\b",
    ]

    for pattern in ask_patterns:
        if re.search(pattern, prompt):
            print(json.dumps({
                "reason": "user wants structured options - use AskUserQuestion tool"
            }), flush=True)
            sys.exit(0)

    for pattern in spec_patterns:
        if re.search(pattern, prompt):
            print(json.dumps({
                "reason": "user may want to build a feature spec - consider suggesting /spec skill"
            }), flush=True)
            sys.exit(0)

    print("{}", flush=True)
    sys.exit(0)

if __name__ == "__main__":
    main()
