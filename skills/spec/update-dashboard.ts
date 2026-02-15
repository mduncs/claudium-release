#!/usr/bin/env bun

/**
 * Update dashboard state from command line
 *
 * Usage:
 *   bun update-dashboard.ts init "Feature Name"
 *   bun update-dashboard.ts phase discovery|feature-tree|deep-dive|generate|qa|done
 *   bun update-dashboard.ts add-feature '{"id":"α","name":"Auth","core":"User login"}'
 *   bun update-dashboard.ts update-feature α '{"status":"refined"}'
 *   bun update-dashboard.ts qa '{"critical":["issue 1"],"moderate":[],"minor":[]}'
 */

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const STATE_FILE = join(homedir(), ".claude/skills/spec/.dashboard-state.json");

interface Feature {
  id: string;
  name: string;
  status: "drafting" | "refined" | "qa-passed";
  core: string;
  taste: string[];
  edges: string[];
}

interface DashboardState {
  specName: string;
  phase: string;
  features: Feature[];
  lastUpdate: string;
  qaFindings?: {
    critical: string[];
    moderate: string[];
    minor: string[];
  };
}

async function getState(): Promise<DashboardState> {
  try {
    const content = await readFile(STATE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      specName: "Untitled Spec",
      phase: "discovery",
      features: [],
      lastUpdate: new Date().toISOString(),
    };
  }
}

async function saveState(state: DashboardState): Promise<void> {
  state.lastUpdate = new Date().toISOString();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  console.log("Dashboard state updated");
}

const [, , command, ...args] = process.argv;

const state = await getState();

switch (command) {
  case "init": {
    const name = args[0] || "Untitled Spec";
    state.specName = name;
    state.phase = "discovery";
    state.features = [];
    state.qaFindings = undefined;
    await saveState(state);
    console.log(`Initialized spec: ${name}`);
    break;
  }

  case "phase": {
    const phase = args[0];
    if (!phase) {
      console.error("Usage: phase <discovery|feature-tree|deep-dive|generate|qa|done>");
      process.exit(1);
    }
    state.phase = phase;
    await saveState(state);
    console.log(`Phase set to: ${phase}`);
    break;
  }

  case "add-feature": {
    const featureJson = args[0];
    if (!featureJson) {
      console.error("Usage: add-feature '<json>'");
      process.exit(1);
    }
    const feature = JSON.parse(featureJson) as Partial<Feature>;
    state.features.push({
      id: feature.id || "?",
      name: feature.name || "Unnamed",
      status: feature.status || "drafting",
      core: feature.core || "",
      taste: feature.taste || [],
      edges: feature.edges || [],
    });
    await saveState(state);
    console.log(`Added feature: ${feature.id} - ${feature.name}`);
    break;
  }

  case "update-feature": {
    const id = args[0];
    const updates = JSON.parse(args[1] || "{}");
    const idx = state.features.findIndex((f) => f.id === id);
    if (idx === -1) {
      console.error(`Feature not found: ${id}`);
      process.exit(1);
    }
    state.features[idx] = { ...state.features[idx], ...updates };
    await saveState(state);
    console.log(`Updated feature: ${id}`);
    break;
  }

  case "qa": {
    const findings = JSON.parse(args[0] || "{}");
    state.qaFindings = {
      critical: findings.critical || [],
      moderate: findings.moderate || [],
      minor: findings.minor || [],
    };
    await saveState(state);
    console.log("QA findings updated");
    break;
  }

  case "show": {
    console.log(JSON.stringify(state, null, 2));
    break;
  }

  default:
    console.log(`
Usage:
  bun update-dashboard.ts init "Feature Name"
  bun update-dashboard.ts phase <phase>
  bun update-dashboard.ts add-feature '<json>'
  bun update-dashboard.ts update-feature <id> '<json>'
  bun update-dashboard.ts qa '<json>'
  bun update-dashboard.ts show
`);
}
