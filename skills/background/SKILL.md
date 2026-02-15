# /background - You're Doing It In Foreground Again

**If the user invoked this skill, you are currently launching apps, taking screenshots, or testing GUI in a way that steals focus or disrupts the user's workflow.**

**Stop what you're doing. Re-read this. Fix your approach.**

## What You're Probably Doing Wrong

- Using `open MyApp` (steals focus)
- Launching with `&` but not restoring focus (still steals)
- Using `screencapture` without `-l $WID` (captures wrong window or full screen)
- Using `tell application "X" to activate` (yanks focus)
- Asking the user to screenshot something (never do this)
- Launching the app repeatedly (focus-stealing each time)

## How To Do It Right

### Launch without stealing focus
```bash
FRONT=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')
.build/debug/AppName &
APP_PID=$!
sleep 1
osascript -e "tell application \"$FRONT\" to activate"
sleep 2
```
Save what's focused. Launch. Restore focus. That's it.

### Get the window ID
```bash
WID=$(swift -e '
import Cocoa
let ws = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
for w in ws {
    if (w["kCGWindowOwnerName"] as? String ?? "").contains("AppName") {
        print(w["kCGWindowNumber"] as? Int ?? 0)
        break
    }
}
')
```

### Screenshot JUST that window
```bash
screencapture -x -l $WID /tmp/bg-capture.png
```
- `-x` = silent
- `-l $WID` = specific window, works even if behind other windows

### Interact without activating
```bash
osascript -e 'tell app "System Events" to tell process "AppName" to click button "Submit" of window 1'
sleep 1
screencapture -x -l $WID /tmp/bg-after.png
```
Use `tell process` NOT `tell application` — process-level commands don't yank focus.

### Read the screenshot
Use the Read tool on the png. You're multimodal.

### Cleanup
```bash
kill $APP_PID
```

## Web apps
```bash
bun run dev &
DEV_PID=$!
sleep 3
bunx playwright screenshot http://localhost:PORT /tmp/bg-capture.png
```

## Rules (non-negotiable)

- **NEVER `open`** — foreground launch
- **NEVER `tell application "X" to activate`** — focus steal
- **NEVER `screencapture` without `-l $WID`** — wrong capture
- **NEVER ask the user to screenshot** — you can do it yourself
- **ALWAYS save/restore frontmost** — the FRONT pattern above
- **ALWAYS use `-x -l $WID`** — silent, targeted
- **ALWAYS use `tell process` not `tell application`** for interaction

## IMPORTANT: When Foreground Is Correct

If the **user asked you to launch/open/show something** so THEY can see it — use foreground. That's what they want. `open MyApp` is fine.

Background is for when **you (Claude) need to test, verify, or screenshot** without disrupting the user's workflow. The user invoking `/background` means you were testing/verifying in foreground when you should have been in background.

**User says "launch the app"** → foreground, they want to see it
**You need to verify a UI change** → background, don't steal focus

Now go back and redo whatever you were doing, correctly.
