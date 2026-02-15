/**
 * witness.ts - Performance Flight Recorder
 *
 * Lightweight instrumentation that logs performance events to JSONL files.
 * Claude can analyze these logs when you say "did you see that?"
 *
 * Usage:
 *   import { span, spanAsync, mark, witness } from './witness';
 *
 *   // Wrap synchronous operations
 *   const result = span('parse_json', () => JSON.parse(data));
 *
 *   // Wrap async operations
 *   const users = await spanAsync('db.query', () => db.find({}));
 *
 *   // Add context
 *   await spanAsync('api.fetch', () => fetch(url), { url, method: 'GET' });
 *
 *   // Manual breadcrumb
 *   mark('user-clicked-save');
 *
 *   // Direct write for custom events
 *   witness.log('custom_event', 123, true, { foo: 'bar' });
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Configuration
const APP_NAME = process.env.WITNESS_APP || process.env.npm_package_name || 'default';
const PERF_DIR = process.env.WITNESS_DIR || join(homedir(), '.claude', 'perf', APP_NAME);
const LOG_FILE = join(PERF_DIR, 'current.jsonl');
const MARKER_FILE = join(PERF_DIR, 'markers.jsonl');

// Ensure directory exists
if (!existsSync(PERF_DIR)) {
  mkdirSync(PERF_DIR, { recursive: true });
}

interface PerfEvent {
  ts: number;
  op: string;
  dur_ms: number;
  ok: boolean;
  err?: string;
  meta?: Record<string, unknown>;
}

interface MarkerEvent {
  ts: number;
  mark: string;
  meta?: Record<string, unknown>;
}

/**
 * Write a performance event to the log
 */
function writeEvent(event: PerfEvent): void {
  try {
    appendFileSync(LOG_FILE, JSON.stringify(event) + '\n');
  } catch {
    // Silently fail - don't let perf logging break the app
  }
}

/**
 * Write a marker event
 */
function writeMarker(event: MarkerEvent): void {
  try {
    appendFileSync(MARKER_FILE, JSON.stringify(event) + '\n');
  } catch {
    // Silently fail
  }
}

/**
 * Wrap a synchronous function with performance logging
 */
export function span<T>(op: string, fn: () => T, meta?: Record<string, unknown>): T {
  const start = Date.now();
  try {
    const result = fn();
    writeEvent({ ts: start, op, dur_ms: Date.now() - start, ok: true, meta });
    return result;
  } catch (e) {
    writeEvent({
      ts: start,
      op,
      dur_ms: Date.now() - start,
      ok: false,
      err: e instanceof Error ? e.message : String(e),
      meta,
    });
    throw e;
  }
}

/**
 * Wrap an async function with performance logging
 */
export async function spanAsync<T>(
  op: string,
  fn: () => Promise<T>,
  meta?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    writeEvent({ ts: start, op, dur_ms: Date.now() - start, ok: true, meta });
    return result;
  } catch (e) {
    writeEvent({
      ts: start,
      op,
      dur_ms: Date.now() - start,
      ok: false,
      err: e instanceof Error ? e.message : String(e),
      meta,
    });
    throw e;
  }
}

/**
 * Log a manual marker/breadcrumb
 * Use for user actions or important events you want to correlate with perf data
 */
export function mark(label: string, meta?: Record<string, unknown>): void {
  writeMarker({ ts: Date.now(), mark: label, meta });
}

/**
 * Direct access to logging for custom events
 */
export const witness = {
  /**
   * Log a custom performance event
   */
  log(op: string, dur_ms: number, ok: boolean = true, meta?: Record<string, unknown>): void {
    writeEvent({ ts: Date.now() - dur_ms, op, dur_ms, ok, meta });
  },

  /**
   * Start a manual span, returns a function to end it
   */
  start(op: string, meta?: Record<string, unknown>): () => void {
    const start = Date.now();
    return () => {
      writeEvent({ ts: start, op, dur_ms: Date.now() - start, ok: true, meta });
    };
  },

  /**
   * Get the log directory path
   */
  dir: PERF_DIR,

  /**
   * Get the current log file path
   */
  logFile: LOG_FILE,

  /**
   * Rotate logs - call this daily or on app start
   * Moves current.jsonl to YYYY-MM-DD.jsonl
   */
  rotate(): void {
    if (!existsSync(LOG_FILE)) return;

    const date = new Date().toISOString().split('T')[0];
    const archiveFile = join(PERF_DIR, `${date}.jsonl`);

    try {
      const content = require('fs').readFileSync(LOG_FILE, 'utf-8');
      appendFileSync(archiveFile, content);
      writeFileSync(LOG_FILE, '');
    } catch {
      // Silently fail
    }
  },

  /**
   * Trim current log to last N lines (prevents unbounded growth)
   */
  trim(maxLines: number = 10000): void {
    if (!existsSync(LOG_FILE)) return;

    try {
      const content = require('fs').readFileSync(LOG_FILE, 'utf-8');
      const lines = content.trim().split('\n');
      if (lines.length > maxLines) {
        writeFileSync(LOG_FILE, lines.slice(-maxLines).join('\n') + '\n');
      }
    } catch {
      // Silently fail
    }
  },
};

// Auto-trim on import (keep last 10k events)
witness.trim();

export default witness;
