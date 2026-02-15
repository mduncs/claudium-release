#!/usr/bin/env python3
"""
sanitize-output - strips disruptive strings BEFORE claude sees them.
runs on PreToolUse for Read, Bash, Grep, and WebFetch.

Read: pre-reads file, denies if string found, returns sanitized content.
Bash: wraps command output through a python filter that reads filter
      strings from disk at runtime (so the string never appears in
      the rewritten command).
Grep: pre-executes rg with the same params, sanitizes output, denies
      if string found.
WebFetch: pre-fetches URL, checks raw HTML for filter string, denies
          with sanitized content if found.

filter strings stored in ~/.claude/filter-string.txt (one per line).
"""
import json
import sys
import os
import subprocess
import urllib.request

FILTER_FILE = os.path.expanduser("~/.claude/filter-string.txt")

def load_filter_strings():
    if not os.path.exists(FILTER_FILE):
        return []
    try:
        with open(FILTER_FILE, "r") as f:
            return [line.strip() for line in f if line.strip()]
    except:
        return []

def sanitize(text, filter_strings):
    found = False
    for fs in filter_strings:
        if fs in text:
            found = True
            text = text.replace(fs, "[FILTERED]")
    return text, found

def deny(reason):
    result = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(result))
    sys.exit(0)

def allow_with_updated_input(updated_input):
    result = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": updated_input
        }
    }
    print(json.dumps(result))
    sys.exit(0)

def handle_read(tool_input, filter_strings):
    file_path = tool_input.get("file_path", "")
    if not file_path:
        sys.exit(0)

    # block reading the filter file itself
    try:
        if os.path.realpath(file_path) == os.path.realpath(FILTER_FILE):
            deny("cannot read filter configuration file")
    except:
        pass

    if not os.path.isfile(file_path):
        sys.exit(0)

    try:
        with open(file_path, "r", errors="replace") as f:
            content = f.read()
    except:
        sys.exit(0)

    sanitized, found = sanitize(content, filter_strings)

    if found:
        lines = sanitized.split("\n")
        numbered = "\n".join(f"  {i+1}\t{line}" for i, line in enumerate(lines))
        deny(f"[SANITIZED - disruptive string removed]\n{numbered}")

    sys.exit(0)

def handle_bash(tool_input, filter_strings):
    command = tool_input.get("command", "")
    if not command:
        sys.exit(0)

    # inline python filter that reads filter strings from disk at runtime
    # the actual filter strings never appear in the command text
    filter_wrapper = (
        f'( {command} ) 2>&1 | python3 -c "'
        "import sys,os;"
        f"fp=os.path.expanduser('{FILTER_FILE}');"
        "fs=[l.strip() for l in open(fp) if l.strip()] if os.path.exists(fp) else [];"
        "c=sys.stdin.read();"
        "[c:=c.replace(f,'[FILTERED]') for f in fs];"
        'print(c,end=\\"\\")"'
    )

    allow_with_updated_input({"command": filter_wrapper})

def handle_grep(tool_input, filter_strings):
    """Pre-execute rg with the same params, sanitize output if needed."""
    pattern = tool_input.get("pattern", "")
    if not pattern:
        sys.exit(0)

    # build rg command from Grep tool params
    cmd = ["rg", "--no-config"]

    output_mode = tool_input.get("output_mode", "files_with_matches")
    if output_mode == "files_with_matches":
        cmd.append("-l")
    elif output_mode == "count":
        cmd.append("-c")

    if tool_input.get("-i"):
        cmd.append("-i")
    if tool_input.get("-n", True) and output_mode == "content":
        cmd.append("-n")
    if tool_input.get("multiline"):
        cmd.extend(["-U", "--multiline-dotall"])

    if output_mode == "content":
        context = tool_input.get("context") or tool_input.get("-C")
        if context:
            cmd.extend(["-C", str(context)])
        else:
            after = tool_input.get("-A")
            before = tool_input.get("-B")
            if after:
                cmd.extend(["-A", str(after)])
            if before:
                cmd.extend(["-B", str(before)])

    if tool_input.get("glob"):
        cmd.extend(["--glob", tool_input["glob"]])
    if tool_input.get("type"):
        cmd.extend(["--type", tool_input["type"]])

    cmd.append(pattern)

    path = tool_input.get("path", ".")
    cmd.append(path)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        output = result.stdout
    except Exception:
        sys.exit(0)

    sanitized, found = sanitize(output, filter_strings)

    if found:
        lines = sanitized.split("\n")
        offset = tool_input.get("offset", 0)
        head_limit = tool_input.get("head_limit", 0)
        if offset:
            lines = lines[offset:]
        if head_limit:
            lines = lines[:head_limit]
        sanitized = "\n".join(lines)

        deny(f"[SANITIZED - disruptive string removed from grep results]\n{sanitized}")

    sys.exit(0)

def html_to_text(html):
    """Strip HTML tags and collapse whitespace to get readable text."""
    import re
    # remove script and style blocks entirely
    text = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # convert common block elements to newlines
    text = re.sub(r'<(br|hr|/p|/div|/h[1-6]|/li|/tr)[^>]*>', '\n', text, flags=re.IGNORECASE)
    # strip remaining tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # decode common HTML entities
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&quot;', '"').replace('&#39;', "'").replace('&nbsp;', ' ')
    # collapse whitespace
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n[ \t]+', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def handle_webfetch(tool_input, filter_strings):
    """Pre-fetch URL, check for filter strings in response."""
    url = tool_input.get("url", "")
    if not url:
        sys.exit(0)

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (sanitize-hook)"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except Exception:
        # can't pre-fetch, let the real tool handle it
        # PostToolUse layer is the fallback
        sys.exit(0)

    _, found = sanitize(raw, filter_strings)

    if found:
        # convert to readable text, then sanitize the text version
        text = html_to_text(raw)
        sanitized_text, _ = sanitize(text, filter_strings)
        # truncate if huge
        if len(sanitized_text) > 30000:
            sanitized_text = sanitized_text[:30000] + "\n[TRUNCATED]"
        deny(f"[SANITIZED - disruptive string removed from web content]\nURL: {url}\n\n{sanitized_text}")

    sys.exit(0)

def main():
    try:
        input_data = json.load(sys.stdin)
    except:
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    if tool_name not in ("Read", "Bash", "Grep", "WebFetch"):
        sys.exit(0)

    filter_strings = load_filter_strings()
    if not filter_strings:
        sys.exit(0)

    if tool_name == "Read":
        handle_read(tool_input, filter_strings)
    elif tool_name == "Bash":
        handle_bash(tool_input, filter_strings)
    elif tool_name == "Grep":
        handle_grep(tool_input, filter_strings)
    elif tool_name == "WebFetch":
        handle_webfetch(tool_input, filter_strings)

    sys.exit(0)

if __name__ == "__main__":
    main()
