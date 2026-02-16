---
name: reverse-engineer
description: Reverse engineer any desktop application. Auto-detects app type (native binary, Electron, Qt, Java), routes to appropriate analysis tools (Ghidra, asar extraction, symbol tables), and produces multi-layer documentation from high-level architecture through implementation-ready feature recipes.
---

# /reverse-engineer - Application Reverse Engineering Pipeline

> **!tokenburner** — deep multi-layer analysis with tool calls at every depth. expect high token usage.

Comprehensive RE pipeline that adapts to what it finds. Takes a path to an app, figures out what it's made of, and produces documentation at every useful depth.

## Invocation

```
/reverse-engineer /Applications/Eagle.app              # full pipeline
/reverse-engineer /Applications/PureRef.app --recon     # just identify what we're dealing with
/reverse-engineer /Applications/Obsidian.app --feature "vim mode"  # target a specific feature
/reverse-engineer ~/code/ghidra/ghidra-eagle --resume   # continue from existing project
/reverse-engineer /Applications/Foo.app --recipe-only   # skip to feature recipe generation
```

## Output Location

All output goes to: `~/code/ghidra/ghidra-{appname}/`

```
ghidra-{appname}/
  README.md                    # series index (like PureRef's README)
  00-guide.md                  # "I want X" -> read this part (like PureRef's guide)
  01-recon.md                  # what is this app made of
  02-architecture.md           # high-level structure, frameworks, object graph
  03-feature-audit.md          # every user-visible feature documented
  04-capability-map.md         # features -> implementation -> integration surface (Eagle-style)
  05-feature-recipes.md        # self-contained reimplementation specs (Eagle-style)
  06-patterns.md               # transferable architectural patterns (PureRef-style)
  07+                          # deep dives per feature area (numbered, like PureRef series)
  extracted/                   # extracted assets, schemas, configs
  {appname}.gpr                # Ghidra project (if native binary)
```

---

## Phase 1: RECON (always runs first)

**Goal**: identify what we're dealing with before choosing tools

**Actions**:

### 1a. App Bundle Inspection (macOS .app)

```bash
# what kind of binary?
file "/Applications/{App}.app/Contents/MacOS/{binary}"

# linked libraries (native apps)
otool -L "/Applications/{App}.app/Contents/MacOS/{binary}"

# bundle info
cat "/Applications/{App}.app/Contents/Info.plist"

# frameworks used
ls "/Applications/{App}.app/Contents/Frameworks/"

# resources
ls "/Applications/{App}.app/Contents/Resources/"
```

### 1b. App Type Detection

Check these in order:

| Signal | App Type | Analysis Pipeline |
|--------|----------|-------------------|
| `Electron Framework.framework` in Frameworks/ | **Electron** | asar extraction -> JS analysis |
| `QtCore.framework` or `libQt*.dylib` | **Qt/C++** | symbols + Ghidra |
| `libjvm.dylib` or `.jar` files | **Java/JVM** | JAR extraction + decompile |
| `.NET` frameworks, `mono` | **Mono/.NET** | IL decompile |
| `libswiftCore.dylib` + no Electron | **Swift native** | Ghidra + swift-demangle |
| Pure Mach-O, ObjC runtime | **ObjC native** | Ghidra + class-dump |
| `Python` framework or `.pyc` | **Python** | uncompyle + source |
| `Chromium Embedded Framework` | **CEF (not Electron)** | hybrid - binary + web assets |

### 1c. Size & Complexity Assessment

```bash
# binary size (correlates with complexity)
du -sh "/Applications/{App}.app/"

# symbol count (native apps)
nm "/Applications/{App}.app/Contents/MacOS/{binary}" 2>/dev/null | wc -l

# string count
strings "/Applications/{App}.app/Contents/MacOS/{binary}" | wc -l
```

### 1d. Recon Output

Write `01-recon.md`:

```markdown
# {App Name} - Recon Report

## Identity
- **Bundle ID**: {from Info.plist}
- **Version**: {from Info.plist}
- **Binary**: {file output - arch, format}
- **Size**: {total app bundle size}

## App Type: {Electron | Qt/C++ | Swift | ObjC | Java | ...}
- **Detection signal**: {what gave it away}
- **Framework**: {specific framework + version if detectable}
- **Languages**: {detected languages}

## Analysis Pipeline
- [ ] {tool 1} - {what it'll give us}
- [ ] {tool 2} - {what it'll give us}
- [ ] Ghidra project: {yes/no, why}

## Quick Findings
- **Linked libraries**: {notable ones}
- **Frameworks**: {list}
- **Interesting strings**: {notable patterns found}
- **File formats**: {any custom file formats detected}
- **Network**: {any URLs, ports, API endpoints found in strings}
- **Storage**: {SQLite, CoreData, plist, JSON, custom}
```

Present recon to user. Ask: "continue with full pipeline, or target specific features?"

---

## Phase 2: SURFACE EXTRACTION (varies by app type)

### Path A: Electron Apps

```bash
# extract asar
npx asar extract "/Applications/{App}.app/Contents/Resources/app.asar" /tmp/{app}-extracted

# file inventory
fd -t f . /tmp/{app}-extracted | wc -l
fd -e js -e ts -e json -e html -e css . /tmp/{app}-extracted | head -50

# check for V8 compiled bytecode (.jsc files)
fd -e jsc . /tmp/{app}-extracted

# check for webpack/bundled code
fd -g "*.bundle.js" -g "*.min.js" -g "app.js" . /tmp/{app}-extracted

# check for source maps
fd -e map . /tmp/{app}-extracted

# look for API servers, IPC channels
rg -l "ipcRenderer\|ipcMain\|createServer\|express\|fastify" /tmp/{app}-extracted --type js

# look for REST endpoints
rg "app\.(get|post|put|delete)\s*\(" /tmp/{app}-extracted --type js

# check for workers
fd -g "*worker*" . /tmp/{app}-extracted
```

**If V8 bytecode (.jsc)**:
- Note as opaque - can't read source
- Focus on: string extraction, API probing, IPC channel enumeration
- Use Electron MCP if app is running

**If readable JS**:
- Beautify if minified: `npx prettier --write {file}`
- Line-pin class/function locations (Obsidian-style)
- Map module structure

**Electron MCP** (if available and app is running):
```
# attach to running process
mcp__electron-mcp__list_processes
mcp__electron-mcp__attach_to_process

# extract capabilities
mcp__electron-mcp__detect_capabilities

# evaluate JS in context
mcp__electron-mcp__eval_js
```

### Path B: Native Binaries (Mach-O)

```bash
# exported symbols (C++: pipe through c++filt)
nm "/Applications/{App}.app/Contents/MacOS/{binary}" | c++filt > /tmp/{app}-symbols.txt

# just names, sorted
nm "/Applications/{App}.app/Contents/MacOS/{binary}" | c++filt | awk '{print $NF}' | sort -u > /tmp/{app}-names.txt

# class names (ObjC)
nm "/Applications/{App}.app/Contents/MacOS/{binary}" | grep "OBJC_CLASS" | awk -F'_OBJC_CLASS_\$_' '{print $2}' | sort -u

# Swift types
nm "/Applications/{App}.app/Contents/MacOS/{binary}" | swift-demangle 2>/dev/null | grep "type metadata" | head -50

# interesting strings (filter noise)
strings "/Applications/{App}.app/Contents/MacOS/{binary}" | grep -E "(http|sqlite|\.db|\.json|Error|Warning|TODO|FIXME|api/|/v[0-9])" | sort -u

# file format signatures
strings "/Applications/{App}.app/Contents/MacOS/{binary}" | grep -iE "\.(pur|eagle|obsidian|sqlite|db)" | sort -u

# check for SQLite databases
fd -e db -e sqlite -e sqlite3 . ~/Library/Application\ Support/{App}/ 2>/dev/null
fd -e db -e sqlite . ~/Library/Preferences/ 2>/dev/null | grep -i {app}
```

**Ghidra** (via GhidraMCP):
- Create/open project at `~/code/ghidra/ghidra-{appname}/`
- Import binary
- Run auto-analysis
- Use function search, xrefs, decompilation for targeted investigation

### Path C: Java/JVM

```bash
# find JARs
fd -e jar . "/Applications/{App}.app/"

# list classes in JAR
jar tf {file}.jar | grep "\.class$" | head -50

# decompile (if cfr or procyon available)
java -jar cfr.jar {file}.jar --outputdir /tmp/{app}-decompiled
```

### Surface Output

Write extracted data to `extracted/` directory:
- `symbols.txt` - demangled symbol names
- `strings-interesting.txt` - filtered strings
- `api-endpoints.txt` - any HTTP/REST endpoints
- `ipc-channels.txt` - IPC channels (Electron)
- `class-list.txt` - class/type names
- `schemas/` - any SQLite schemas, JSON schemas found

---

## Phase 3: ARCHITECTURE MAP

**Goal**: high-level understanding of how the app is structured

Using the surface extraction data, map:

### 3a. Component Graph

Identify major components/modules/frameworks:
- What are the main classes/modules?
- What talks to what?
- Where is state stored?
- What are the threading/process boundaries?

### 3b. Data Model

- What persistent storage exists? (SQLite, CoreData, JSON, plist, custom)
- What's the schema?
- What are the key entities and relationships?

### 3c. Integration Surface

Map all external-facing interfaces:
- REST APIs (with endpoints, methods, params)
- IPC channels (Electron)
- URL schemes / deep links
- File format specifications
- Plugin/extension APIs
- CLI arguments

### Architecture Output

Write `02-architecture.md`:

```markdown
# {App Name} - Architecture

## Overview
- **Framework**: {framework + version}
- **Languages**: {languages}
- **Rendering**: {AppKit/UIKit/Qt/HTML/Canvas/...}
- **Storage**: {what and where}
- **Threading**: {model}

## Component Graph
{ASCII or mermaid diagram showing major components}

## Key Classes/Modules
| Component | Location | Purpose |
|-----------|----------|---------|
| ... | ... | ... |

## Data Model
{Schema tables, entity relationships}

## Integration Surface
{APIs, IPC, URL schemes, file formats}

## Dependencies
{Notable libraries, frameworks, services}
```

---

## Phase 4: FEATURE AUDIT

**Goal**: document every user-visible feature, what it does, where it lives

Walk the app's UI systematically:
1. Menu bar (every menu item)
2. Toolbar / chrome
3. Sidebar / navigation
4. Main content area
5. Panels / inspectors
6. Preferences / settings
7. Context menus
8. Keyboard shortcuts
9. Drag & drop behaviors
10. File operations (open, save, export)

For each feature area, produce a section like the Resonance docs:

```markdown
## {Feature Area} (e.g., "Sidebar Navigation")

### User-Visible Behavior
{What the user sees and can do}

### Implementation
| Component | Location | Purpose |
|-----------|----------|---------|
| ... | {address or file:line} | ... |

### Data Flow
{How data moves through this feature}

### State
{What state this feature owns, how it persists}

### Edge Cases
{Interesting behaviors discovered}
```

### Feature Audit Output

Write `03-feature-audit.md` with all feature areas documented.

For large apps, split into per-area files (like Resonance's `sidebar-navigation.md`, `toolbar-transport.md`, etc.)

---

## Phase 5: CAPABILITY MAP (Eagle-style)

**Goal**: cross-reference features with their implementation and integration surface

Write `04-capability-map.md`:

```markdown
# {App} Capability Map: Features -> Implementation -> Integration

| # | Feature | Source/Symbol | Key Implementation | Integration Surface | Storage |
|---|---------|--------------|-------------------|---------------------|---------|
| 1 | ... | {file or symbol} | {how it works} | {API/IPC/FS/UI-only} | {where data lives} |
```

Group by functional area (Browse, Organize, Search, Import/Export, etc.)

Include reverse indexes:
- API endpoint -> features that use it
- IPC channel -> features that use it
- Storage location -> features that use it
- Keyboard shortcut -> implementation entry point

---

## Phase 6: FEATURE RECIPES (Eagle-style)

**Goal**: self-contained reimplementation specs for each feature

Write `05-feature-recipes.md`:

```markdown
# {App} Feature Specifications

Portable, self-contained implementation specs for every {App} feature.
Each spec is detailed enough to reimplement from scratch.

## {N}. {Feature Name}

### What It Does
{User-visible behavior, 2-3 sentences}

### Data Model
{What state/structures this feature owns}

### Algorithm / Logic
{Step-by-step how it works internally}
{Include actual constants, formulas, thresholds found via RE}

### Interaction Contract
- **Inputs**: {user actions, API calls, events}
- **Outputs**: {state changes, visual feedback, side effects}
- **Edge cases**: {what could break, boundary conditions}

### Integration Points
{How this feature connects to others}

### Implementation Notes
{What you'd change, stack-specific choices, dependencies}
```

---

## Phase 7: PATTERN EXTRACTION (PureRef-style)

**Goal**: abstract reusable architectural patterns from the app

Write `06-patterns.md`:

```markdown
# Patterns to Reuse

Architectural patterns from {App} you can implement yourself, in any language.

## Pattern {N}: {Name}

**The problem**: {what problem this pattern solves}

**The pattern**:
{Pseudocode / structure diagram showing the pattern}

**Why it works**: {explanation}

**Implementation notes**:
{Language-agnostic guidance, key constants, gotchas}

**Framework equivalents**:
| {App}'s Stack | Web/Electron | Swift/AppKit | Rust |
|--------------|-------------|-------------|------|
| {original} | {equivalent} | {equivalent} | {equivalent} |
```

---

## Phase 8: DEEP DIVES (on request)

When the user targets a specific feature with `--feature`, or asks to go deeper:

Produce numbered deep-dive docs (07+) in the style of PureRef's series:

```markdown
# Part {N}: {Feature Area} Deep Dive

## From Static Analysis
{What symbols/strings/code reading tells us}

## From Ghidra / Decompilation
{Exact algorithms, constants, control flow}
{Include decompiled pseudocode for key functions}

## From Runtime Observation
{If applicable: memory layout, thread behavior, file I/O}

## Reimplementation Guide
{Concrete steps to rebuild this feature}
```

---

## Phase 0: GUIDE (generated last, placed first)

After all phases complete, generate `00-guide.md`:

```markdown
# {App} Architecture Guide - What's Where

Use this to find the right section when you're building something similar.

## "I want to build {feature description}"

**Read: [Part N - {title}](N-title.md)**

{2-3 sentence summary of what you'll learn}

Then read: **[Part M - {deeper title}](M-deeper.md)** for exact implementation.
```

And `README.md` as series index with status checklist.

---

## Parallel Execution Strategy

Phases are partially parallelizable:

```
Phase 1 (Recon) ────> user approval
                          |
              +-----------+-----------+
              |                       |
        Phase 2 (Surface)      Phase 4 (Feature Audit)
        Phase 3 (Architecture)    [manual observation]
              |                       |
              +-----------+-----------+
                          |
              +-----------+-----------+
              |           |           |
        Phase 5       Phase 6     Phase 7
        (Capability)  (Recipes)   (Patterns)
              |
        Phase 8 (Deep Dives) - on demand
              |
        Phase 0 (Guide) - generated last
```

Use Task agents in parallel where independent:
- Explore agents for codebase/symbol search
- Builder agents for generating docs (inject RE context)
- Multiple deep dives can run in parallel

---

## Tool Selection by App Type

| App Type | Primary Tools | Ghidra? | Electron MCP? |
|----------|--------------|---------|---------------|
| Electron | asar, rg, node --inspect | No* | Yes |
| Qt/C++ | nm, c++filt, strings, otool | **Yes** | No |
| Swift native | nm, swift-demangle, strings | **Yes** | No |
| ObjC native | nm, class-dump, strings | **Yes** | No |
| Java | jar, cfr/procyon | No | No |
| Python | uncompyle6, dis | No | No |
| Tauri | asar (frontend) + Ghidra (Rust backend) | **Yes** | Partial** |
| Flutter/Dart | Ghidra + snapshot analysis | **Yes** | No |
| Rust native | nm, Ghidra (limited demangling) | **Yes** | No |
| Go native | nm, go tool objdump, Ghidra | **Yes** | No |
| JUCE (audio) | nm, c++filt, Ghidra | **Yes** | No |
| Unity | IL2CPP→Ghidra or Mono→IL decompile | **Depends** | No |
| GTK/GNOME | nm, GObject introspection | **Yes** | No |
| wxWidgets | nm, c++filt | **Yes** | No |

*Electron apps may have native addons (.node files) that benefit from Ghidra
**Tauri uses a webview, not Electron - CDP may work if remote debugging is enabled

### Adding New Stacks

The detection table WILL hit something not listed here. When it does:

1. **Identify the signal** - what in the bundle identifies this stack?
   - Framework names in `Contents/Frameworks/`
   - Linked libraries from `otool -L`
   - Strings like version identifiers, framework names
   - File extensions in Resources/
2. **Determine the analysis pipeline** - what tools can crack it open?
   - Is there readable source? (asar, .py, .rb, .lua)
   - Is there bytecode with known decompilers? (.class, .pyc, IL)
   - Is it compiled native code? (Ghidra)
   - Is it a hybrid? (Tauri = web frontend + Rust binary)
3. **Add to the table** - detection signal + tools + Ghidra yes/no
4. **Document in recon** - note the unknown stack, what you tried, what worked

The output format stays the same regardless of stack. Architecture docs, feature recipes, and patterns are language-agnostic.

---

## Resume Support

If `--resume` with existing project directory:
1. Read README.md for status
2. Skip completed phases
3. Continue from last incomplete phase
4. New deep dives append to series

---

## Ghidra MCP Integration

When Ghidra analysis is needed (native binaries):

```
# Check connection
mcp__ghidra__check_connection

# Get program info
mcp__ghidra__get_current_program_info

# Search for functions by name pattern
mcp__ghidra__search_functions_by_name

# Decompile a specific function
mcp__ghidra__decompile_function

# Get cross-references
mcp__ghidra__get_xrefs_to / get_xrefs_from

# List classes (ObjC/C++)
mcp__ghidra__list_classes

# List strings
mcp__ghidra__list_strings

# Search for specific patterns
mcp__ghidra__search_functions_enhanced
```

For each decompiled function, document:
- Address
- Decompiled pseudocode (cleaned up)
- What it does in plain English
- Key constants/thresholds
- Cross-references (who calls this, what does this call)

---

## Depth Gradient (Analysis Levels)

Analysis goes as deep as needed. Each level builds on the previous. Not every app needs every level - stop when you have enough to reimplement.

### Level 0: RECON (passive, non-invasive)

What is this thing?

```bash
file {binary}                    # binary type, architecture
otool -L {binary}                # linked libraries
codesign -dvvv {app}             # signing info, entitlements, team ID
plutil -p Info.plist             # bundle metadata
ls Contents/Frameworks/          # framework detection
du -sh {app}                     # size assessment
```

**You always do this.** Takes 30 seconds, tells you which path to take.

### Level 1: STATIC SURFACE (read-only extraction)

What's inside, from the outside?

```bash
# symbols & names
nm {binary} | c++filt            # exported symbols (C++)
nm {binary} | swift-demangle     # Swift type metadata
nm {binary} | grep OBJC_CLASS    # ObjC class names
class-dump {binary}              # ObjC headers (if available)

# strings (filtered for signal)
strings {binary} | rg "(http|sqlite|api/|Error|\.db|NSWindow|UIKit)"

# electron/web
npx asar extract app.asar       # extract Electron source
npx prettier --write {file}      # beautify minified JS

# resources
fd -e sqlite -e db -e json -e plist . ~/Library/Application\ Support/{App}/
plutil -convert json -o - {plist}
```

### Level 2: STATIC DEEP (decompilation)

What does the code actually do?

```bash
# Ghidra (via MCP)
mcp__ghidra__decompile_function      # C/C++/ObjC/Swift → pseudocode
mcp__ghidra__search_functions_by_name # find functions by pattern
mcp__ghidra__get_xrefs_to           # who calls this?
mcp__ghidra__list_classes            # class hierarchy

# Java
java -jar cfr.jar {file}.jar        # Java bytecode → source

# JS (line-pinned analysis, Obsidian-style)
# beautify → find class/function definitions → map line numbers
rg "class \w+" app.pretty.js -n     # find class definitions
rg "function \w+" app.pretty.js -n  # find function definitions
```

### Level 3: FILE FORMAT ANALYSIS (data at rest)

What's in the files?

```bash
# SQLite (most apps use it somewhere)
sqlite3 {db} ".schema"              # full schema
sqlite3 {db} ".tables"              # table list
sqlite3 {db} "SELECT * FROM {table} LIMIT 5"  # sample data

# binary formats
xxd {file} | head -50               # hex dump header
xxd -s {offset} -l {len} {file}     # specific region

# plists (macOS preferences)
defaults read {bundle.id}           # live preferences
plutil -p ~/Library/Preferences/{bundle.id}.plist

# custom formats (look for magic bytes, structure)
file {datafile}                     # sometimes identifies format
xxd {file} | head -5                # magic bytes
```

### Level 4: RUNTIME OBSERVATION (passive, app is running)

What does it do when running? **Does not modify the app's behavior.**

```bash
# memory layout
vmmap {pid}                          # virtual memory map (regions, sizes, protection)
vmmap --summary {pid}                # memory category totals
heap {pid}                           # heap allocations by class/size
heap {pid} -s                        # sorted by size (find biggest allocations)
leaks {pid}                          # leak detection
footprint {pid}                      # memory categorized by type (compressed, dirty, swapped)
malloc_history {pid} {address}       # allocation history for specific pointer

# thread architecture
sample {pid} 5                       # 5-second stack trace sample (shows all threads)
sample {pid} 1 -f {output}           # save to file for analysis
spindump {pid}                       # hang/spin analysis

# file I/O
lsof -p {pid}                        # all open files, sockets, pipes
fs_usage -f filesys {pid}            # live filesystem activity (reads, writes, stats)
fs_usage -f network {pid}            # live network filesystem activity

# system calls
sc_usage {pid}                       # syscall statistics (counts, time spent)
# dtruss {pid}                       # syscall tracing (requires SIP disabled or entitled)

# network
nettop -p {pid}                      # live network connections + bandwidth
lsof -i -p {pid}                     # network sockets only

# logging
log stream --predicate 'process == "{appname}"' --level debug  # unified log stream
log show --predicate 'process == "{appname}"' --last 5m        # recent logs

# macOS specific
notifyutil -w {notification}         # watch Darwin notifications
mdls {file}                          # Spotlight metadata for app's files
xattr -l {file}                      # extended attributes
```

**Key insight from PureRef Part 12**: `vmmap --summary` + `footprint` together tell you WHERE memory goes. For PureRef, 72% was pixel data. This kind of finding drives architecture decisions.

### Level 5: RUNTIME INSTRUMENTATION (active probing, modifies behavior)

What happens when I poke it?

```bash
# lldb (debugger)
lldb -p {pid}                        # attach to running process
(lldb) bt                            # backtrace current thread
(lldb) bt all                        # backtrace ALL threads
(lldb) image list                    # loaded libraries
(lldb) breakpoint set -n {function}  # break on function
(lldb) register read                 # CPU registers
(lldb) memory read {address}         # read memory
(lldb) po {expression}               # evaluate ObjC/Swift expression

# Frida (dynamic instrumentation - if installed)
frida -p {pid} -l script.js          # inject JS into process
frida-trace -p {pid} -m "*[NSWindow *]"  # trace ObjC method calls
frida-trace -p {pid} -i "malloc"     # trace C function calls

# DYLD injection (when SIP allows or on entitled binaries)
DYLD_INSERT_LIBRARIES=hook.dylib {binary}  # load custom dylib at startup

# Electron/CEF remote debugging
{binary} --remote-debugging-port=9222     # enable Chrome DevTools Protocol
# then connect via CDP client or chrome://inspect

# Electron MCP (if available)
mcp__electron-mcp__eval_js               # evaluate JS in renderer
mcp__electron-mcp__hook_function         # hook and monitor function calls
mcp__electron-mcp__capture_action_trace  # trace user actions

# Xcode Instruments (via CLI)
xctrace record --template 'Time Profiler' --attach {pid} --output {trace}
xctrace record --template 'Allocations' --attach {pid} --output {trace}
xctrace record --template 'System Trace' --attach {pid} --output {trace}
xctrace record --template 'Network' --attach {pid} --output {trace}
open {trace}.trace                       # open in Instruments.app
```

**SIP note**: many instrumentation tools require System Integrity Protection disabled or specific entitlements. If a tool fails with permission errors, note it and fall back to Level 4 passive observation.

### Level 6: NETWORK & PROTOCOL ANALYSIS

What does it talk to and how?

```bash
# HTTPS interception (requires trust setup)
mitmproxy --mode local:{pid}          # intercept app's HTTPS traffic
mitmdump -w traffic.flow              # save for later analysis
# Charles Proxy also works (GUI, easier cert trust)

# raw packet capture
tcpdump -i any -p "host {server}" -w capture.pcap
# open in Wireshark for protocol analysis

# DNS
sudo tcpdump -i any port 53 and "host {server}"  # DNS queries

# API endpoint discovery from traffic
mitmdump --set flow_detail=2 | rg ">>|<<"  # request/response pairs
```

### Level 7: UI & ACCESSIBILITY INSPECTION

What does the user see and how is it structured?

```bash
# Accessibility tree (shows UI element hierarchy)
# Accessibility Inspector.app (Xcode developer tools)

# AppleScript UI enumeration
osascript -e 'tell application "System Events" to tell process "{App}" to entire contents'
osascript -e 'tell application "System Events" to tell process "{App}" to get every UI element of window 1'

# screenshot documentation
screencapture -x /tmp/{app}-screenshot.png     # silent screenshot
screencapture -l{windowid} /tmp/{app}-window.png  # specific window

# window info
osascript -e 'tell app "{App}" to get bounds of window 1'
```

### Depth Decision Matrix

| Question | Minimum Level Needed |
|----------|---------------------|
| What framework/language is this? | Level 0 |
| What are the main components? | Level 1 |
| How does feature X work exactly? | Level 2 (Ghidra/source) |
| What's the database schema? | Level 3 |
| How much memory does it use and why? | Level 4 |
| What happens at this exact breakpoint? | Level 5 |
| What API calls does it make to its server? | Level 6 |
| How is the UI element tree structured? | Level 7 |

### Depth in Documentation

Every finding must note its source depth:

```markdown
## MIP Algorithm
**Source: Level 2 (Ghidra decompilation) + Level 4 (runtime verification)**

Scale factor: `pow(0.4, level) * 1.5`  ← exact, from decompiled code
MIP levels: 10                          ← exact, from decompiled constant
Cache format: QDataStream v21 header    ← exact, from Level 3 file analysis
Cache size: 494 MB for 87 images        ← observed, from Level 4 (lsof + du)
```

---

## Quality Standards

Every output doc must be:

1. **Self-contained** - readable without context from other docs
2. **Accurate** - verified against actual binary/source, not speculated
3. **Actionable** - enough detail to reimplement, not just describe
4. **Honest** - mark confidence levels:
   - "Exact" = from decompilation/source
   - "High confidence" = from symbols + string context
   - "Inferred" = from behavior observation
   - "Speculative" = educated guess, needs verification

Never fabricate addresses, function names, or implementation details.
If you can't determine something, say so.

---

## Example Session

```
> /reverse-engineer /Applications/Figma.app

Phase 1: Recon...

# Figma.app - Recon Report
- Bundle ID: com.figma.Desktop
- Binary: Mach-O 64-bit arm64
- App Type: **Electron** (Electron Framework.framework detected)
- Size: 340MB
- Notable: Custom GPU renderer (not standard Electron rendering)
- Storage: IndexedDB + local cache at ~/Library/Application Support/Figma

Analysis pipeline:
- [x] asar extraction
- [ ] JS source analysis (bundled, will need beautifying)
- [ ] IPC channel enumeration
- [ ] API endpoint mapping
- [ ] Ghidra for native GPU renderer module

Continue with full pipeline, or target specific features?

> the canvas rendering, how do they do GPU-accelerated 2D in electron

Phase 8: Deep Dive → canvas rendering...
[spawns Explore + Ghidra agents targeting the native renderer module]
```
