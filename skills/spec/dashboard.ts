#!/usr/bin/env bun

/**
 * Spec Dashboard Server
 *
 * Serves a live-updating HTML dashboard showing the feature tree
 * as specs are built through /spec conversations.
 *
 * Port: 8850
 * State file: ~/.claude/skills/spec/.dashboard-state.json
 */

import { watch } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const PORT = 8850;
const SKILL_DIR = join(homedir(), ".claude/skills/spec");
const STATE_FILE = join(SKILL_DIR, ".dashboard-state.json");

interface Feature {
  id: string; // Greek letter: α, β, γ, δ, ε, ζ, η, θ
  name: string;
  status: "drafting" | "refined" | "qa-passed";
  core: string;
  taste: string[];
  edges: string[];
}

interface DashboardState {
  specName: string;
  phase: "discovery" | "feature-tree" | "deep-dive" | "generate" | "qa" | "done";
  features: Feature[];
  lastUpdate: string;
  qaFindings?: {
    critical: string[];
    moderate: string[];
    minor: string[];
  };
}

const GREEK = ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ"];

const DEFAULT_STATE: DashboardState = {
  specName: "No spec in progress",
  phase: "discovery",
  features: [],
  lastUpdate: new Date().toISOString(),
};

async function getState(): Promise<DashboardState> {
  try {
    const content = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return DEFAULT_STATE;
  }
}

function renderHTML(state: DashboardState): string {
  const phaseColors: Record<string, string> = {
    discovery: "#f59e0b",
    "feature-tree": "#3b82f6",
    "deep-dive": "#8b5cf6",
    generate: "#10b981",
    qa: "#ef4444",
    done: "#22c55e",
  };

  const statusColors: Record<string, string> = {
    drafting: "#f59e0b",
    refined: "#3b82f6",
    "qa-passed": "#22c55e",
  };

  const featuresHTML = state.features.length === 0
    ? `<div class="empty">No features yet. Start speccing!</div>`
    : state.features.map(f => `
      <div class="feature" data-status="${f.status}">
        <div class="feature-header">
          <span class="feature-id" onclick="copyToClipboard('${f.id}')" title="Click to copy">${f.id}</span>
          <span class="feature-name">${escapeHtml(f.name)}</span>
          <span class="status-badge" style="background: ${statusColors[f.status]}">${f.status}</span>
        </div>
        <div class="feature-body">
          <div class="section">
            <div class="section-label">Core</div>
            <div class="section-content">${escapeHtml(f.core)}</div>
          </div>
          ${f.taste.length > 0 ? `
          <div class="section">
            <div class="section-label">Taste</div>
            <ul class="taste-list">
              ${f.taste.map((t, i) => `<li><code>${f.id}.taste[${i}]</code> ${escapeHtml(t)}</li>`).join("")}
            </ul>
          </div>
          ` : ""}
          ${f.edges.length > 0 ? `
          <div class="section">
            <div class="section-label">Edge Cases</div>
            <ul class="edge-list">
              ${f.edges.map((e, i) => `<li><code>${f.id}.edge[${i}]</code> ${escapeHtml(e)}</li>`).join("")}
            </ul>
          </div>
          ` : ""}
        </div>
      </div>
    `).join("");

  const qaHTML = state.qaFindings ? `
    <div class="qa-section">
      <h2>QA Findings</h2>
      ${state.qaFindings.critical.length > 0 ? `
        <div class="qa-group critical">
          <div class="qa-label">Critical</div>
          <ul>${state.qaFindings.critical.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      ${state.qaFindings.moderate.length > 0 ? `
        <div class="qa-group moderate">
          <div class="qa-label">Moderate</div>
          <ul>${state.qaFindings.moderate.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
        </div>
      ` : ""}
      ${state.qaFindings.minor.length > 0 ? `
        <div class="qa-group minor">
          <div class="qa-label">Minor</div>
          <ul>${state.qaFindings.minor.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
        </div>
      ` : ""}
    </div>
  ` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spec: ${escapeHtml(state.specName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f0f0f;
      color: #e5e5e5;
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }

    header {
      border-bottom: 1px solid #333;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .phase-indicator {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.875rem;
      background: ${phaseColors[state.phase]}22;
      color: ${phaseColors[state.phase]};
      border: 1px solid ${phaseColors[state.phase]}44;
    }

    .phase-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${phaseColors[state.phase]};
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .last-update {
      color: #666;
      font-size: 0.75rem;
      margin-top: 8px;
    }

    .features {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .feature {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      overflow: hidden;
    }

    .feature[data-status="qa-passed"] {
      border-color: #22c55e44;
    }

    .feature-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #222;
      border-bottom: 1px solid #333;
    }

    .feature-id {
      font-family: "SF Mono", Monaco, monospace;
      font-size: 1.25rem;
      color: #3b82f6;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .feature-id:hover {
      background: #3b82f622;
    }

    .feature-name {
      flex: 1;
      font-weight: 500;
    }

    .status-badge {
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 4px;
      color: #fff;
      text-transform: uppercase;
    }

    .feature-body {
      padding: 16px;
    }

    .section {
      margin-bottom: 12px;
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 4px;
      letter-spacing: 0.05em;
    }

    .section-content {
      color: #ccc;
      line-height: 1.5;
    }

    .taste-list, .edge-list {
      list-style: none;
      color: #aaa;
    }

    .taste-list li, .edge-list li {
      padding: 4px 0;
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .taste-list code, .edge-list code {
      font-family: "SF Mono", Monaco, monospace;
      font-size: 0.75rem;
      background: #333;
      padding: 2px 6px;
      border-radius: 4px;
      color: #888;
      flex-shrink: 0;
    }

    .empty {
      text-align: center;
      padding: 48px;
      color: #666;
      font-style: italic;
    }

    .qa-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #333;
    }

    .qa-section h2 {
      font-size: 1rem;
      margin-bottom: 16px;
    }

    .qa-group {
      margin-bottom: 16px;
      padding: 12px;
      border-radius: 8px;
    }

    .qa-group.critical { background: #ef444422; border: 1px solid #ef444444; }
    .qa-group.moderate { background: #f59e0b22; border: 1px solid #f59e0b44; }
    .qa-group.minor { background: #3b82f622; border: 1px solid #3b82f644; }

    .qa-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .qa-group.critical .qa-label { color: #ef4444; }
    .qa-group.moderate .qa-label { color: #f59e0b; }
    .qa-group.minor .qa-label { color: #3b82f6; }

    .qa-group ul {
      list-style: disc;
      margin-left: 20px;
      color: #ccc;
    }

    .qa-group li {
      padding: 2px 0;
    }

    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.875rem;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }

    .toast.show {
      opacity: 1;
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(state.specName)}</h1>
    <span class="phase-indicator">
      <span class="phase-dot"></span>
      Phase: ${state.phase}
    </span>
    <div class="last-update">Last update: ${new Date(state.lastUpdate).toLocaleTimeString()}</div>
  </header>

  <div class="features">
    ${featuresHTML}
  </div>

  ${qaHTML}

  <div class="toast" id="toast">Copied!</div>

  <script>
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text);
      const toast = document.getElementById('toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1500);
    }

    // Auto-refresh every 2 seconds
    setTimeout(() => location.reload(), 2000);
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Ensure state file exists
await mkdir(SKILL_DIR, { recursive: true });
try {
  await readFile(STATE_FILE);
} catch {
  await writeFile(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
}

console.log(`Spec Dashboard starting on http://localhost:${PORT}`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // API: Get state
    if (url.pathname === "/api/state") {
      const state = await getState();
      return new Response(JSON.stringify(state), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // API: Update state (POST)
    if (url.pathname === "/api/state" && req.method === "POST") {
      const body = await req.json();
      await writeFile(STATE_FILE, JSON.stringify(body, null, 2));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // HTML dashboard
    const state = await getState();
    return new Response(renderHTML(state), {
      headers: { "Content-Type": "text/html" },
    });
  },
});

console.log(`Dashboard ready at http://localhost:${PORT}`);
console.log(`State file: ${STATE_FILE}`);
