# /testing - Automated UI Testing Skill

Use this skill when you need to test GUI applications without bothering the user.

## Philosophy
don't ask the user to screenshot. don't steal their focus constantly. automate the poking.

## The Pattern

### 1. Launch the app without stealing focus
```bash
# save current focus, launch, restore focus
FRONT=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')
.build/debug/AppName &
APP_PID=$!
sleep 1
osascript -e "tell application \"$FRONT\" to activate"
sleep 2
```
the window still exists and is capturable — it just doesn't yank focus from terminal.

### 2. Get window ID (for targeted screenshots)
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
this lets you screenshot the app window even when it's behind other windows.

### 3. Use AppleScript to interact
```bash
osascript -e 'tell application "System Events" to tell process "AppName" to click button "Save" of window 1'
osascript -e 'tell application "System Events" to keystroke "n" using command down'
```
prefer `tell process` over `tell application` — avoids activating/focusing.

### 4. Take targeted silent screenshots
```bash
# screenshot JUST the app window (works even if behind other windows)
screencapture -x -l $WID /tmp/appname-test-$(date +%s).png

# -x = no sound, -l = specific window layer
```
the `-l <windowID>` flag is the key — captures a specific window regardless of z-order. combined with `-x` gives fully silent background screenshots.

### 5. Read the screenshot to verify
use the Read tool on the png - you're multimodal, you can see it.

### 6. Repeat as needed
loop through test cases, take screenshots at each step, verify visually.

### Full background testing combo
```bash
# launch without focus steal
FRONT=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')
.build/debug/MyApp &
APP_PID=$!
sleep 1
osascript -e "tell application \"$FRONT\" to activate"
sleep 2

# find window
WID=$(swift -e '
import Cocoa
let ws = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as? [[String: Any]] ?? []
for w in ws {
    if (w["kCGWindowOwnerName"] as? String ?? "").contains("MyApp") {
        print(w["kCGWindowNumber"] as? Int ?? 0)
        break
    }
}
')

# interact + capture (no focus stealing)
osascript -e 'tell app "System Events" to tell process "MyApp" to click button "Start" of window 1'
sleep 1
screencapture -x -l $WID /tmp/test-after-click.png

# cleanup when done
kill $APP_PID
```

## When to Use Subagents

for comprehensive testing, dispatch multiple qa-gremlin agents in parallel:
```
Task(qa-gremlin): "test feature X via applescript automation.
take screenshots to /tmp/appname-featureX-*.png.
verify results visually. report any issues."
```

## Platform-Specific Tools

| Platform | Automation Tool |
|----------|-----------------|
| macOS native | AppleScript/osascript, JXA |
| iOS | XCUITest |
| Web | TabFS + Playwright MCP |
| Browser extensions | TabFS (see below) |
| Electron | Playwright or AppleScript |

## Browser Testing with TabFS

**AppleScript clicking on browser windows is UNRELIABLE** - coordinate-based clicks miss because browser layout is dynamic. Use TabFS instead.

### Mount point
Set `TABFS_MOUNT` env var or use default: `~/tabfs/fs/mnt/`

### DOM inspection
```bash
# find tab (adjust TABFS_MOUNT to your installation)
ls "${TABFS_MOUNT:-$HOME/tabfs/fs/mnt}"/tabs/by-title/ | grep -i "page name"

# read DOM
cat tabs/by-id/[ID]/body.html | grep "element-class"

# read visible text
cat tabs/by-id/[ID]/text.txt
```

### Screenshot verification for browsers
```bash
# activate browser window first
osascript -e 'tell application "Firefox Developer Edition" to activate'
sleep 0.3
screencapture -x /tmp/browser-test.png
```
then use Read tool on the png to verify visually.

### Triggering actions
For browser extensions, you CANNOT execute arbitrary JS in the page context from TabFS (content scripts are isolated). Instead:
1. Add debug code to the extension that triggers on page load
2. Reload extension via web-ext (touch manifest.json)
3. Reload tab via TabFS: `echo reload > tabs/by-id/[ID]/control`
4. Screenshot to verify result

### What works vs doesn't

| ✓ Works | ✗ Doesn't work |
|---------|----------------|
| Reading DOM via body.html/text.txt | Executing JS in extension context |
| Reloading tabs | AppleScript coordinate clicks |
| Screenshot verification | Direct DOM manipulation |
| Triggering web-ext reload | Console capture for content scripts |

See `/tabfs-browser-access` skill for full TabFS reference.

## What NOT to Do
- don't ask "can you screenshot this?"
- don't relaunch app repeatedly stealing focus
- don't do the "what do you see?" back-and-forth
- don't wait for user confirmation at every step

## Accessibility Labels Matter
applescript ui scripting needs accessibility labels. if elements aren't findable:

1. **add them yourself** - don't just report "couldn't find element", fix it:
```swift
Button("Save") { ... }
    .accessibilityIdentifier("save-button")
    .accessibilityLabel("Save document")
```

2. for swiftui, common modifiers:
   - `.accessibilityIdentifier("unique-id")` - for automation targeting
   - `.accessibilityLabel("human readable")` - for voiceover
   - `.accessibilityHint("what happens")` - extra context

3. then re-run your test - the element should now be findable

if you can't modify the app code, note which elements need labels in your findings.

## Visual DOM Debugging (Browser Extensions)

when debugging element selection/insertion issues in browser extensions, inject bright colored styles to see what's being selected:

```javascript
// add to your content script temporarily
element.style.outline = '3px solid red';        // red = container
element.style.background = 'rgba(255,255,0,0.5)'; // yellow = target element
element.style.outline = '3px dashed blue';      // blue = search scope

// make inserted elements impossible to miss
btn.style.background = 'magenta';
btn.style.width = '30px';
btn.style.height = '30px';
btn.style.border = '3px solid cyan';
```

**color convention:**
| color | meaning |
|-------|---------|
| red solid outline | container/wrapper element |
| blue dashed outline | search scope (if different from container) |
| yellow background | target element (e.g., the link we're modifying) |
| green background | found element (e.g., display name link) |
| magenta + cyan border | inserted element (make it huge so you can't miss it) |

then screenshot and read the image - you'll immediately see:
- what elements are being selected
- where insertions end up
- if the wrong element is being targeted

this beats console.log for DOM issues because you SEE the relationships spatially.

**cleanup:** remove all debug styles before committing.

## Example Session
```
1. launch app in background
2. osascript: activate app, navigate to feature
3. screencapture -x /tmp/test-before.png
4. osascript: trigger the action being tested
5. screencapture -x /tmp/test-after.png
6. read both screenshots, compare, report findings
```

all without asking the user a single question.
