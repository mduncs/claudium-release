#!/usr/bin/env python3
"""
audit log - logs all tool calls for compliance/debugging
runs on PostToolUse
"""
import json
import sys
import os
from datetime import datetime

LOG_FILE = os.path.expanduser("~/.claude/audit.jsonl")

def main():
    try:
        input_data = json.load(sys.stdin)
    except:
        sys.exit(0)

    # extract relevant info
    entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "session_id": input_data.get("session_id", "unknown"),
        "tool_name": input_data.get("tool_name", "unknown"),
        "tool_input": input_data.get("tool_input", {}),
        "cwd": input_data.get("cwd", "unknown"),
    }

    # append to log file
    try:
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except:
        pass  # silent fail - don't break claude over logging

    sys.exit(0)

if __name__ == "__main__":
    main()
