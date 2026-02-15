#!/usr/bin/env python3
"""
subagent-notify hook - plays "job's done" only for long-running tasks (>10 min)
gets start time from subagent's transcript (first entry timestamp)
"""
import json
import os
import subprocess
import sys
import time
from datetime import datetime

JOBS_DONE_PATH = os.environ.get(
    "CLAUDE_JOBSDONE_SOUND",
    os.path.expanduser("~/.claude/sounds/jobsdone.mp3")
)
MIN_DURATION = 300  # 5 minutes
DEBUG_LOG = "/tmp/subagent-notify-debug.log"

def log(msg):
    with open(DEBUG_LOG, "a") as f:
        f.write(f"{time.strftime('%H:%M:%S')} {msg}\n")

def get_start_time(transcript_path):
    """get timestamp of first transcript entry"""
    try:
        with open(transcript_path) as f:
            first_line = f.readline()
            if first_line:
                entry = json.loads(first_line)
                ts = entry.get("timestamp")
                if ts:
                    return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except Exception as e:
        log(f"get_start_time error: {e}")
    return None

def main():
    log("hook called")
    try:
        input_data = json.load(sys.stdin)
        log(f"input keys: {list(input_data.keys())}")
    except Exception as e:
        log(f"json parse error: {e}")
        sys.exit(0)

    transcript_path = input_data.get("agent_transcript_path")
    log(f"agent_transcript_path: {transcript_path}")
    if not transcript_path:
        log("no transcript_path, exiting")
        sys.exit(0)

    start_time = get_start_time(transcript_path)
    log(f"start_time: {start_time}")
    if not start_time:
        log("no start_time, exiting")
        sys.exit(0)

    duration = time.time() - start_time
    log(f"duration: {duration:.1f}s (threshold: {MIN_DURATION}s)")

    if duration >= MIN_DURATION:
        log("playing sound!")
        subprocess.run(["afplay", JOBS_DONE_PATH], stderr=subprocess.DEVNULL)
    else:
        log("below threshold, no sound")

    sys.exit(0)

if __name__ == "__main__":
    main()
