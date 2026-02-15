package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// --- Types ---

type HookInput struct {
	ToolName  string                 `json:"tool_name"`
	ToolInput map[string]interface{} `json:"tool_input"`
	ToolOutput interface{}           `json:"tool_output,omitempty"`
	SessionID string                 `json:"session_id,omitempty"`
	CWD       string                 `json:"cwd,omitempty"`
}

type HookOutput struct {
	HookSpecificOutput *HookSpecific `json:"hookSpecificOutput,omitempty"`
}

type HookSpecific struct {
	HookEventName          string                 `json:"hookEventName"`
	PermissionDecision     string                 `json:"permissionDecision,omitempty"`
	PermissionDecisionReason string               `json:"permissionDecisionReason,omitempty"`
	UpdatedInput           map[string]interface{} `json:"updatedInput,omitempty"`
	AdditionalContext      string                 `json:"additionalContext,omitempty"`
	UpdatedMCPToolOutput   interface{}            `json:"updatedMCPToolOutput,omitempty"`
}

// --- Filter strings ---

var filterFile = filepath.Join(os.Getenv("HOME"), ".claude", "filter-string.txt")

func loadFilterStrings() []string {
	data, err := os.ReadFile(filterFile)
	if err != nil {
		return nil
	}
	var result []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			result = append(result, line)
		}
	}
	return result
}

func sanitize(text string, filters []string) (string, bool) {
	found := false
	for _, f := range filters {
		if strings.Contains(text, f) {
			found = true
			text = strings.ReplaceAll(text, f, "[FILTERED]")
		}
	}
	return text, found
}

// --- Deny/Allow helpers ---

func deny(event, reason string) {
	out := HookOutput{
		HookSpecificOutput: &HookSpecific{
			HookEventName:          event,
			PermissionDecision:     "deny",
			PermissionDecisionReason: reason,
		},
	}
	json.NewEncoder(os.Stdout).Encode(out)
	os.Exit(0)
}

func allowWithUpdatedInput(event string, updated map[string]interface{}) {
	out := HookOutput{
		HookSpecificOutput: &HookSpecific{
			HookEventName:      event,
			PermissionDecision: "allow",
			UpdatedInput:       updated,
		},
	}
	json.NewEncoder(os.Stdout).Encode(out)
	os.Exit(0)
}

func allowWithReason(event, reason string, updated map[string]interface{}) {
	out := HookOutput{
		HookSpecificOutput: &HookSpecific{
			HookEventName:          event,
			PermissionDecision:     "allow",
			PermissionDecisionReason: reason,
			UpdatedInput:           updated,
		},
	}
	json.NewEncoder(os.Stdout).Encode(out)
	os.Exit(0)
}

// --- Safety guard: blocked patterns ---

type blockedPattern struct {
	pattern *regexp.Regexp
	reason  string
}

var blockedPatterns []blockedPattern

func init() {
	patterns := []struct {
		pat    string
		reason string
	}{
		// filesystem destruction
		{`rm\s+(-[rf]+\s+)*/["']?\s*$`, "rm on root directory"},
		{`rm\s+(-[rf]+\s+)*~["']?\s*$`, "rm on home directory"},
		{`rm\s+-rf\s+/(?!tmp|var/tmp)`, "rm -rf on system path"},
		{`>\s*/etc/`, "overwriting /etc"},
		{`>\s*/usr/`, "overwriting /usr"},
		{`>\s*/System/`, "overwriting /System"},
		// git destruction on main
		{`git\s+push\s+.*--force.*(?:main|master)`, "force push to main/master"},
		{`git\s+push\s+-f.*(?:main|master)`, "force push to main/master"},
		{`git\s+reset\s+--hard.*origin/(?:main|master)`, "hard reset main/master"},
		// macos nuclear
		{`diskutil\s+eraseDisk`, "erasing disk"},
		{`dd\s+.*of=/dev/`, "dd to raw device"},
		// port killing (kills browsers)
		{`lsof\s+-ti[^-]*\|\s*xargs.*kill`, "blind port kill - use: kill $(lsof -ti:PORT -sTCP:LISTEN)"},
		{`kill\s+.*\$\(lsof\s+-ti(?!.*-sTCP:LISTEN)`, "blind port kill - use: kill $(lsof -ti:PORT -sTCP:LISTEN)"},
		{"kill\\s+`lsof\\s+-ti(?!.*-sTCP:LISTEN)", "blind port kill - use: kill $(lsof -ti:PORT -sTCP:LISTEN)"},
		{`pkill\s+-f.*:\d+`, "pkill by port - use: kill $(lsof -ti:PORT -sTCP:LISTEN)"},
		// browser/dev tool killing
		{`pkill\s+(-\w+\s+)*.*web-ext`, "NEVER kill web-ext"},
		{`pkill\s+(-\w+\s+)*.*(?i:firefox)`, "NEVER kill firefox"},
		{`pkill\s+(-\w+\s+)*.*(?i:chrome)`, "NEVER kill chrome"},
		{`pkill\s+(-\w+\s+)*.*(?i:safari)`, "NEVER kill safari"},
		{`pkill\s+(-\w+\s+)*.*(?i:electron)`, "NEVER kill electron"},
		{`pkill\s+(-\w+\s+)*.*(?i:brave)`, "NEVER kill brave"},
		{`pkill\s+(-\w+\s+)*.*(?i:arc)`, "NEVER kill arc"},
		{`killall\s+.*(?i:firefox|chrome|safari|web-ext|brave|arc)`, "NEVER kill browsers"},
		{`kill\s+.*(?:web-ext|firefox|chrome)`, "NEVER kill browsers"},
		{`pgrep.*\|\s*xargs\s+kill`, "NEVER kill processes via pgrep pipe"},
		{`pgrep.*\|\s*kill`, "NEVER kill processes via pgrep pipe"},
		{`osascript.*quit.*(?i:firefox|chrome|safari)`, "NEVER quit browsers via osascript"},
		// git clone
		{`git\s+clone\s+`, "NEVER git clone without explicit user authorization"},
		{`gh\s+repo\s+clone\s+`, "NEVER gh repo clone without explicit user authorization"},
	}
	for _, p := range patterns {
		re, err := regexp.Compile("(?i)" + p.pat)
		if err != nil {
			continue
		}
		blockedPatterns = append(blockedPatterns, blockedPattern{re, p.reason})
	}
}

func checkSafetyGuard(cmd string) (bool, string) {
	for _, bp := range blockedPatterns {
		if bp.pattern.MatchString(cmd) {
			return true, bp.reason
		}
	}
	return false, ""
}

// --- npm to bun ---

var npmRe = regexp.MustCompile(`\bnpm\b`)
var npmGlobalRe = regexp.MustCompile(`\bnpm\s+(i|install)\s+(-g|--global)`)

func rewriteNpmToBun(cmd string) (string, bool) {
	if !npmRe.MatchString(cmd) {
		return cmd, false
	}
	if npmGlobalRe.MatchString(cmd) {
		return cmd, false
	}
	return npmRe.ReplaceAllString(cmd, "bun"), true
}

// --- HTML to text ---

var scriptRe = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
var styleRe = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
var blockElementRe = regexp.MustCompile(`(?i)<(?:br|hr|/p|/div|/h[1-6]|/li|/tr)[^>]*>`)
var tagRe = regexp.MustCompile(`<[^>]+>`)
var multiSpaceRe = regexp.MustCompile(`[ \t]+`)
var leadingSpaceRe = regexp.MustCompile(`\n[ \t]+`)
var multiNewlineRe = regexp.MustCompile(`\n{3,}`)

func htmlToText(html string) string {
	text := scriptRe.ReplaceAllString(html, "")
	text = styleRe.ReplaceAllString(text, "")
	text = blockElementRe.ReplaceAllString(text, "\n")
	text = tagRe.ReplaceAllString(text, " ")
	text = strings.ReplaceAll(text, "&amp;", "&")
	text = strings.ReplaceAll(text, "&lt;", "<")
	text = strings.ReplaceAll(text, "&gt;", ">")
	text = strings.ReplaceAll(text, "&quot;", "\"")
	text = strings.ReplaceAll(text, "&#39;", "'")
	text = strings.ReplaceAll(text, "&#x27;", "'")
	text = strings.ReplaceAll(text, "&nbsp;", " ")
	text = multiSpaceRe.ReplaceAllString(text, " ")
	text = leadingSpaceRe.ReplaceAllString(text, "\n")
	text = multiNewlineRe.ReplaceAllString(text, "\n\n")
	return strings.TrimSpace(text)
}

// --- PreToolUse handler ---

func handlePreToolUse(input *HookInput) {
	cmd := getStr(input.ToolInput, "command")
	filters := loadFilterStrings()

	switch input.ToolName {
	case "Bash":
		// 1. safety guard
		if blocked, reason := checkSafetyGuard(cmd); blocked {
			deny("PreToolUse", fmt.Sprintf("🛑 BLOCKED: %s\ncommand: %s\n\nif you really need this, run it manually outside claude.", reason, cmd))
			return
		}

		// 2. npm to bun
		newCmd, rewritten := rewriteNpmToBun(cmd)
		if rewritten {
			cmd = newCmd
		}

		// 3. sanitize: wrap with Go filter pipe (no python dependency)
		if len(filters) > 0 && cmd != "" {
			binPath := selfPath
			if binPath == "" {
				binPath = filepath.Join(os.Getenv("HOME"), ".claude", "hooks", "claude-hooks-bin")
			}
			filterWrapper := fmt.Sprintf(`( %s ) 2>&1 | %s filter`, cmd, binPath)
			if rewritten {
				allowWithReason("PreToolUse", "rewrote npm→bun", map[string]interface{}{"command": filterWrapper})
			} else {
				allowWithUpdatedInput("PreToolUse", map[string]interface{}{"command": filterWrapper})
			}
			return
		}

		// npm rewrite only (no filter strings)
		if rewritten {
			allowWithReason("PreToolUse", "rewrote npm→bun", map[string]interface{}{"command": cmd})
			return
		}

	case "Read":
		if len(filters) == 0 {
			return
		}
		filePath := getStr(input.ToolInput, "file_path")
		if filePath == "" {
			return
		}

		// block reading the filter file
		realFilter, _ := filepath.EvalSymlinks(filterFile)
		realTarget, _ := filepath.EvalSymlinks(filePath)
		if realFilter != "" && realTarget != "" && realFilter == realTarget {
			deny("PreToolUse", "cannot read filter configuration file")
			return
		}

		data, err := os.ReadFile(filePath)
		if err != nil {
			return
		}

		sanitized, found := sanitize(string(data), filters)
		if found {
			lines := strings.Split(sanitized, "\n")
			var numbered []string
			for i, line := range lines {
				numbered = append(numbered, fmt.Sprintf("  %d\t%s", i+1, line))
			}
			deny("PreToolUse", "[SANITIZED - disruptive string removed]\n"+strings.Join(numbered, "\n"))
		}

	case "Grep":
		if len(filters) == 0 {
			return
		}
		pattern := getStr(input.ToolInput, "pattern")
		if pattern == "" {
			return
		}

		// build rg command
		args := []string{"--no-config"}
		outputMode := getStr(input.ToolInput, "output_mode")
		if outputMode == "" {
			outputMode = "files_with_matches"
		}

		switch outputMode {
		case "files_with_matches":
			args = append(args, "-l")
		case "count":
			args = append(args, "-c")
		}

		if getBool(input.ToolInput, "-i") {
			args = append(args, "-i")
		}
		if getBool(input.ToolInput, "-n") && outputMode == "content" {
			args = append(args, "-n")
		}
		if getBool(input.ToolInput, "multiline") {
			args = append(args, "-U", "--multiline-dotall")
		}

		if outputMode == "content" {
			if c := getNum(input.ToolInput, "context"); c > 0 {
				args = append(args, "-C", fmt.Sprintf("%d", c))
			} else if c := getNum(input.ToolInput, "-C"); c > 0 {
				args = append(args, "-C", fmt.Sprintf("%d", c))
			} else {
				if a := getNum(input.ToolInput, "-A"); a > 0 {
					args = append(args, "-A", fmt.Sprintf("%d", a))
				}
				if b := getNum(input.ToolInput, "-B"); b > 0 {
					args = append(args, "-B", fmt.Sprintf("%d", b))
				}
			}
		}

		if g := getStr(input.ToolInput, "glob"); g != "" {
			args = append(args, "--glob", g)
		}
		if t := getStr(input.ToolInput, "type"); t != "" {
			args = append(args, "--type", t)
		}

		args = append(args, pattern)

		path := getStr(input.ToolInput, "path")
		if path == "" {
			path = "."
		}
		args = append(args, path)

		out, _ := exec.Command("rg", args...).Output()
		output := string(out)

		sanitized, found := sanitize(output, filters)
		if found {
			deny("PreToolUse", "[SANITIZED - disruptive string removed from grep results]\n"+sanitized)
		}

	case "WebFetch":
		if len(filters) == 0 {
			return
		}
		url := getStr(input.ToolInput, "url")
		if url == "" {
			return
		}

		client := &http.Client{Timeout: 15 * time.Second}
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (sanitize-hook)")
		resp, err := client.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return
		}
		raw := string(body)

		_, found := sanitize(raw, filters)
		if found {
			text := htmlToText(raw)
			sanitizedText, _ := sanitize(text, filters)
			if len(sanitizedText) > 30000 {
				sanitizedText = sanitizedText[:30000] + "\n[TRUNCATED]"
			}
			deny("PreToolUse", fmt.Sprintf("[SANITIZED - disruptive string removed from web content]\nURL: %s\n\n%s", url, sanitizedText))
		}
	}
}

// --- PostToolUse handler ---

func handlePostToolUse(input *HookInput) {
	// 1. audit log
	writeAuditLog(input)

	// 2. sanitize check
	filters := loadFilterStrings()
	if len(filters) == 0 {
		return
	}

	outputStr := marshalOutput(input.ToolOutput)
	_, found := sanitize(outputStr, filters)
	if !found {
		return
	}

	// MCP tools: replace output
	if strings.HasPrefix(input.ToolName, "mcp__") {
		sanitizedOutput := deepSanitize(input.ToolOutput, filters)
		out := HookOutput{
			HookSpecificOutput: &HookSpecific{
				HookEventName:       "PostToolUse",
				UpdatedMCPToolOutput: sanitizedOutput,
			},
		}
		json.NewEncoder(os.Stdout).Encode(out)
		os.Exit(0)
	}

	// built-in tools: provide sanitized context
	sanitizedStr, _ := sanitize(outputStr, filters)
	out := HookOutput{
		HookSpecificOutput: &HookSpecific{
			HookEventName:    "PostToolUse",
			AdditionalContext: "[SANITIZED OUTPUT]\n" + sanitizedStr,
		},
	}
	json.NewEncoder(os.Stdout).Encode(out)
	os.Exit(0)
}

// --- Audit log ---

var auditLogFile = filepath.Join(os.Getenv("HOME"), ".claude", "audit.jsonl")

func writeAuditLog(input *HookInput) {
	entry := map[string]interface{}{
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
		"session_id": input.SessionID,
		"tool_name":  input.ToolName,
		"tool_input": input.ToolInput,
		"cwd":        input.CWD,
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return
	}
	f, err := os.OpenFile(auditLogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	f.Write(data)
	f.Write([]byte("\n"))
}

// --- Deep sanitize for MCP output ---

func deepSanitize(obj interface{}, filters []string) interface{} {
	switch v := obj.(type) {
	case string:
		result := v
		for _, f := range filters {
			result = strings.ReplaceAll(result, f, "[FILTERED]")
		}
		return result
	case map[string]interface{}:
		m := make(map[string]interface{})
		for k, val := range v {
			m[k] = deepSanitize(val, filters)
		}
		return m
	case []interface{}:
		var arr []interface{}
		for _, val := range v {
			arr = append(arr, deepSanitize(val, filters))
		}
		return arr
	}
	return obj
}

// --- Helpers ---

func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func getBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

func getNum(m map[string]interface{}, key string) int {
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case int:
			return n
		}
	}
	return 0
}

func marshalOutput(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	data, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(data)
}

// --- Stdin filter (replaces python3 pipe) ---

func handleFilter() {
	filters := loadFilterStrings()
	if len(filters) == 0 {
		// no filters — just pass through
		io.Copy(os.Stdout, os.Stdin)
		return
	}

	// read stdin with timeout — handles silent commands (cp, mkdir, etc.)
	done := make(chan []byte, 1)
	go func() {
		data, _ := io.ReadAll(os.Stdin)
		done <- data
	}()

	var data []byte
	select {
	case data = <-done:
	case <-time.After(120 * time.Second):
		// timeout — drain what we can and move on
		return
	}

	if len(data) == 0 {
		return
	}

	text := string(data)
	for _, f := range filters {
		text = strings.ReplaceAll(text, f, "[FILTERED]")
	}
	fmt.Print(text)
}

// --- Main ---

var selfPath string

func init() {
	// resolve our own binary path for the filter pipe
	exe, err := os.Executable()
	if err == nil {
		selfPath, _ = filepath.EvalSymlinks(exe)
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintf(os.Stderr, "usage: claude-hooks <pre-tool-use|post-tool-use|filter>\n")
		os.Exit(1)
	}

	switch os.Args[1] {
	case "filter":
		handleFilter()
		return
	}

	var input HookInput
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		os.Exit(0)
	}

	switch os.Args[1] {
	case "pre-tool-use":
		handlePreToolUse(&input)
	case "post-tool-use":
		handlePostToolUse(&input)
	default:
		os.Exit(0)
	}
}
