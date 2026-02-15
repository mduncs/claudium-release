---
name: tabfs-browser-access
description: Access browser tabs as filesystem. Use when doing web/extension development, debugging pages, checking console logs, or needing to inspect browser state. Provides routes for reading DOM, console output, page metadata, and controlling tabs.
---

# TabFS Browser Access

## Mount Point
Set `TABFS_MOUNT` env var or use default: `~/tabfs/fs/mnt/`

## Quick Check
```bash
ls "${TABFS_MOUNT:-$HOME/tabfs/fs/mnt}"/tabs/by-id/
```

## Reading Browser State

| route | what it gives |
|-------|---------------|
| `tabs/by-id/[ID]/title.txt` | page title |
| `tabs/by-id/[ID]/url.txt` | current URL |
| `tabs/by-id/[ID]/text.txt` | page body text |
| `tabs/by-id/[ID]/document.html` | full page HTML |
| `tabs/by-id/[ID]/meta.json` | page metadata |
| `tabs/by-id/[ID]/console.json` | captured console output |
| `tabs/by-id/[ID]/errors.json` | JavaScript errors |
| `tabs/by-id/[ID]/selection.txt` | selected text |

## Controlling Tabs

| action | command |
|--------|---------|
| navigate | `echo "URL" > tabs/by-id/[ID]/url.txt` |
| focus | `echo true > tabs/by-id/[ID]/active` |
| reload | `echo reload > tabs/by-id/[ID]/control` |
| close | `echo remove > tabs/by-id/[ID]/control` |
| new tab | `echo "URL" > tabs/create` |

## Executing JavaScript

```bash
# one-off expression
touch "tabs/by-id/[ID]/watches/document.title"
cat "tabs/by-id/[ID]/watches/document.title"

# run script file
echo "console.log('hi')" > tabs/by-id/[ID]/evals/test.js
```

## Console Capture

First read installs interceptor, subsequent reads return captured logs:
```bash
cat tabs/by-id/[ID]/console.json
# returns: [{"t":timestamp,"l":"log|error|warn","m":"message"},...]
```

## Finding Tabs

```bash
# all tabs
ls tabs/by-id/

# by title
ls tabs/by-title/ | grep -i "keyword"

# focused tab
cat tabs/last-focused/title.txt
```

## Limitations

- No script injection on about: pages or strict CSP sites
- Console capture only works AFTER first read
- Firefox only (no debugger API)
