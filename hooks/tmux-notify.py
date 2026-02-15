#!/usr/bin/env python3
"""
tmux-notify hook - speaks which session/window claude finished in
plays bass_rumble.wav first, then espeak says location
"""
import os
import subprocess
import sys
import time

RUMBLE_PATH = os.environ.get(
    "CLAUDE_NOTIFY_SOUND",
    os.path.expanduser("~/.claude/sounds/notify.wav")
)
RUMBLE_DURATION = 0.64
OVERLAP = 0.06

def get_tmux_info():
    """get window, pane, and whether this window is active"""
    try:
        # use TMUX_PANE to target the pane where claude is running
        # not the currently active pane
        pane_id = os.environ.get("TMUX_PANE", "")
        target = ["-t", pane_id] if pane_id else []

        window = subprocess.check_output(
            ["tmux", "display"] + target + ["-p", "#W"],
            stderr=subprocess.DEVNULL
        ).decode().strip()

        pane_index = subprocess.check_output(
            ["tmux", "display"] + target + ["-p", "#P"],
            stderr=subprocess.DEVNULL
        ).decode().strip()

        pane_title = subprocess.check_output(
            ["tmux", "display"] + target + ["-p", "#{pane_title}"],
            stderr=subprocess.DEVNULL
        ).decode().strip()

        # use title if set, otherwise index
        pane = pane_title if pane_title and pane_title != "" else f"pane {pane_index}"

        # check if this window is the active one
        window_active = subprocess.check_output(
            ["tmux", "display"] + target + ["-p", "#{window_active}"],
            stderr=subprocess.DEVNULL
        ).decode().strip()

        return window, pane, pane_index, window_active == "1"
    except:
        return None, None, None, False

def main():
    # play rumble (non-blocking)
    subprocess.Popen(["afplay", RUMBLE_PATH], stderr=subprocess.DEVNULL)
    time.sleep(RUMBLE_DURATION - OVERLAP)

    # only espeak if inside tmux
    if not os.environ.get("TMUX"):
        sys.exit(0)

    window, pane, pane_index, is_active_window = get_tmux_info()
    if not window:
        sys.exit(0)

    # if on different window, say window + pane
    # if on same window, say pane only
    if not is_active_window:
        text = f"{window} {pane}"
    else:
        text = pane

    # log what we're saying
    with open("/tmp/claude-alert.log", "a") as f:
        f.write(f"{text}\n")

    # espeak the location
    subprocess.run([
        "espeak",
        "-v", "en+m7",
        "-s", "88",
        "-p", "0",
        "-a", "75",
        text
    ], stderr=subprocess.DEVNULL)

    sys.exit(0)

if __name__ == "__main__":
    main()
