#!/usr/bin/env bun
/**
 * Demo: Generate some test perf events
 * Run with: bun ~/.claude/skills/witness/demo.ts
 */

import { span, spanAsync, mark, witness } from './witness';

console.log(`Writing to: ${witness.dir}`);

// Simulate various operations
async function demo() {
  mark('demo-started');

  // Fast operation
  span('parse_config', () => {
    const x = JSON.parse('{"foo": "bar"}');
    return x;
  });

  // Simulate slow DB query
  await spanAsync('db.query', async () => {
    await Bun.sleep(Math.random() * 200 + 50); // 50-250ms
  }, { query: 'SELECT * FROM users', table: 'users' });

  // Simulate API call
  await spanAsync('api.fetch', async () => {
    await Bun.sleep(Math.random() * 100 + 20); // 20-120ms
  }, { url: '/api/users', method: 'GET' });

  // Simulate render
  span('render', () => {
    // Busy work
    let sum = 0;
    for (let i = 0; i < 1000000; i++) sum += i;
    return sum;
  }, { component: 'UserList' });

  // Occasional slow operation (simulated hitch)
  if (Math.random() > 0.7) {
    console.log('Simulating a hitch...');
    await spanAsync('db.heavy_query', async () => {
      await Bun.sleep(800 + Math.random() * 400); // 800-1200ms
    }, { query: 'SELECT * FROM logs JOIN...', rows: 15000 });
  }

  // Failure example
  try {
    span('parse_bad_json', () => {
      JSON.parse('not valid json');
    });
  } catch {
    // Expected
  }

  mark('demo-finished');
  console.log('Done! Check the logs with: tail ~/.claude/perf/default/current.jsonl');
}

// Run a few iterations
for (let i = 0; i < 5; i++) {
  await demo();
  await Bun.sleep(500);
}
