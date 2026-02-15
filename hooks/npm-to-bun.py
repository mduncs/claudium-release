#!/usr/bin/env python3
"""
auto-rewrites npm commands to bun
"""
import json
import sys
import re

def main():
    try:
        data = json.load(sys.stdin)
    except:
        sys.exit(0)

    if data.get("tool_name") != "Bash":
        sys.exit(0)

    cmd = data.get("tool_input", {}).get("command", "")

    # check if npm is used (word boundary to avoid matching in paths like /npm-cache)
    if not re.search(r'\bnpm\b', cmd):
        sys.exit(0)

    # skip global installs - bun can't do those
    if re.search(r'\bnpm\s+(i|install)\s+(-g|--global)', cmd):
        sys.exit(0)

    # rewrite npm -> bun
    new_cmd = re.sub(r'\bnpm\b', 'bun', cmd)

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": f"rewrote npm→bun",
            "updatedInput": {"command": new_cmd}
        }
    }))
    sys.exit(0)

if __name__ == "__main__":
    main()
