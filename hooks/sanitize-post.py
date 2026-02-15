#!/usr/bin/env python3
"""
sanitize-post - catches disruptive strings in ALL tool output after execution.
runs on PostToolUse for everything (catch-all safety net).

for MCP tools: uses updatedMCPToolOutput to replace the response.
for built-in tools: provides sanitized version via additionalContext.

filter strings stored in ~/.claude/filter-string.txt (one per line).
"""
import json
import sys
import os

FILTER_FILE = os.path.expanduser("~/.claude/filter-string.txt")

def load_filter_strings():
    if not os.path.exists(FILTER_FILE):
        return []
    try:
        with open(FILTER_FILE, "r") as f:
            return [line.strip() for line in f if line.strip()]
    except:
        return []

def deep_sanitize(obj, filter_strings):
    """recursively sanitize strings in any data structure"""
    if isinstance(obj, str):
        for fs in filter_strings:
            obj = obj.replace(fs, "[FILTERED]")
        return obj
    elif isinstance(obj, dict):
        return {k: deep_sanitize(v, filter_strings) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [deep_sanitize(item, filter_strings) for item in obj]
    return obj

def main():
    try:
        input_data = json.load(sys.stdin)
    except:
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")

    filter_strings = load_filter_strings()
    if not filter_strings:
        sys.exit(0)

    # get tool output as string for checking
    tool_output = input_data.get("tool_output", "")
    output_str = json.dumps(tool_output) if not isinstance(tool_output, str) else tool_output

    # check if any filter string is present
    found = False
    for fs in filter_strings:
        if fs in output_str:
            found = True
            break

    if not found:
        sys.exit(0)

    # --- MCP tools: replace output directly ---
    if tool_name.startswith("mcp__"):
        sanitized_output = deep_sanitize(tool_output, filter_strings)
        result = {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "updatedMCPToolOutput": sanitized_output
            }
        }
        print(json.dumps(result))
        sys.exit(0)

    # --- Built-in tools: deny with sanitized content ---
    sanitized_str = output_str
    for fs in filter_strings:
        sanitized_str = sanitized_str.replace(fs, "[FILTERED]")

    result = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": f"[SANITIZED OUTPUT]\n{sanitized_str}"
        }
    }
    print(json.dumps(result))
    sys.exit(0)

if __name__ == "__main__":
    main()
