#!/usr/bin/env python3
"""
safety guard - blocks the most destructive operations
runs on PreToolUse for Bash commands
"""
import json
import sys
import re

# patterns that should NEVER run
BLOCKED_PATTERNS = [
    # filesystem destruction
    (r"rm\s+(-[rf]+\s+)*[\"']?/[\"']?\s*$", "rm on root directory"),
    (r"rm\s+(-[rf]+\s+)*[\"']?~[\"']?\s*$", "rm on home directory"),
    (r"rm\s+-rf\s+/(?!tmp|var/tmp)", "rm -rf on system path"),
    (r">\s*/etc/", "overwriting /etc"),
    (r">\s*/usr/", "overwriting /usr"),
    (r">\s*/System/", "overwriting /System"),

    # git destruction on main
    (r"git\s+push\s+.*--force.*(?:main|master)", "force push to main/master"),
    (r"git\s+push\s+-f.*(?:main|master)", "force push to main/master"),
    (r"git\s+reset\s+--hard.*origin/(?:main|master)", "hard reset main/master"),

    # macos nuclear options
    (r"diskutil\s+eraseDisk", "erasing disk"),
    (r"dd\s+.*of=/dev/", "dd to raw device"),

    # port killing - THIS KILLS FIREFOX/BROWSERS. claude did this THREE TIMES.
    # the problem: lsof -ti:PORT returns ALL pids (server + browser clients)
    # the fix: add -sTCP:LISTEN to only get the server
    # safe pattern: kill $(lsof -ti:PORT -sTCP:LISTEN)
    (r"lsof\s+-ti[^-]*\|\s*xargs.*kill", "blind port kill - use: kill $(lsof -ti:PORT -sTCP:LISTEN)"),
    (r"kill\s+.*\$\(lsof\s+-ti(?!.*-sTCP:LISTEN)", "blind port kill - use: kill $(lsof -ti:PORT -sTCP:LISTEN)"),
    (r"kill\s+`lsof\s+-ti(?!.*-sTCP:LISTEN)", "blind port kill - use: kill $(lsof -ti:PORT -sTCP:LISTEN)"),
    (r"pkill\s+-f.*:\d+", "pkill by port - use: kill $(lsof -ti:PORT -sTCP:LISTEN)"),

    # BROWSER/DEV TOOL KILLING - ABSOLUTELY FORBIDDEN
    # claude killed web-ext which killed firefox. NEVER AGAIN.
    # block ALL variations of killing browsers/dev tools

    # pkill patterns (matches -f flag or direct name)
    (r"pkill\s+(-\w+\s+)*.*web-ext", "NEVER kill web-ext - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*firefox", "NEVER kill firefox - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*Firefox", "NEVER kill Firefox - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*chrome", "NEVER kill chrome - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*Chrome", "NEVER kill Chrome - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*safari", "NEVER kill safari - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*Safari", "NEVER kill Safari - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*electron", "NEVER kill electron apps - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*Electron", "NEVER kill Electron apps - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*brave", "NEVER kill brave - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*Brave", "NEVER kill Brave - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*arc", "NEVER kill arc - ask user to restart"),
    (r"pkill\s+(-\w+\s+)*.*Arc", "NEVER kill Arc - ask user to restart"),

    # killall patterns
    (r"killall\s+.*firefox", "NEVER kill firefox - ask user to restart"),
    (r"killall\s+.*Firefox", "NEVER kill Firefox - ask user to restart"),
    (r"killall\s+.*chrome", "NEVER kill chrome - ask user to restart"),
    (r"killall\s+.*Chrome", "NEVER kill Chrome - ask user to restart"),
    (r"killall\s+.*safari", "NEVER kill safari - ask user to restart"),
    (r"killall\s+.*Safari", "NEVER kill Safari - ask user to restart"),
    (r"killall\s+.*web-ext", "NEVER kill web-ext - ask user to restart"),
    (r"killall\s+.*Brave", "NEVER kill Brave - ask user to restart"),
    (r"killall\s+.*Arc", "NEVER kill Arc - ask user to restart"),

    # kill with process name in args
    (r"kill\s+.*web-ext", "NEVER kill web-ext - ask user to restart"),
    (r"kill\s+.*firefox", "NEVER kill firefox - ask user to restart"),
    (r"kill\s+.*chrome", "NEVER kill chrome - ask user to restart"),

    # pgrep piped to kill
    (r"pgrep.*\|\s*xargs\s+kill", "NEVER kill processes via pgrep pipe - ask user"),
    (r"pgrep.*\|\s*kill", "NEVER kill processes via pgrep pipe - ask user"),

    # osascript quit commands
    (r"osascript.*quit.*firefox", "NEVER quit Firefox via osascript - ask user"),
    (r"osascript.*quit.*chrome", "NEVER quit Chrome via osascript - ask user"),
    (r"osascript.*quit.*safari", "NEVER quit Safari via osascript - ask user"),

    # git clone - never clone repos without explicit user authorization
    (r"git\s+clone\s+", "NEVER git clone without explicit user authorization"),
    (r"gh\s+repo\s+clone\s+", "NEVER gh repo clone without explicit user authorization"),
]

def check_command(cmd):
    """returns (blocked, reason) tuple"""
    for pattern, reason in BLOCKED_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return True, reason
    return False, None

def main():
    try:
        input_data = json.load(sys.stdin)
    except:
        sys.exit(0)

    # only check Bash tool
    tool_name = input_data.get("tool_name", "")
    if tool_name != "Bash":
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    command = tool_input.get("command", "")

    blocked, reason = check_command(command)

    if blocked:
        result = {
            "decision": "block",
            "reason": f"🛑 BLOCKED: {reason}\ncommand: {command}\n\nif you really need this, run it manually outside claude."
        }
        print(json.dumps(result))
        sys.exit(2)

    sys.exit(0)

if __name__ == "__main__":
    main()
