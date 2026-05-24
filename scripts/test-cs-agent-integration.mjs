#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  collectSnapshot,
  renderInventorySection,
  validateSnapshotMeta,
} from '../lib/integrations/cs-agent.js';

const DEFAULT_EXE = 'F:\\smoke\\CS253\\cs-agent.exe';
const DEFAULT_PROFILE = 'CS253';

if (process.env.RUN_CS_AGENT_TESTS !== '1') {
  console.log('Skipping live cs-agent integration test. Set RUN_CS_AGENT_TESTS=1 to run it.');
  process.exit(0);
}

const executablePath = process.env.CS_AGENT_EXE || DEFAULT_EXE;
const profile = process.env.CS_AGENT_PROFILE || DEFAULT_PROFILE;
const keepTmp = process.env.KEEP_CS_AGENT_TMP === '1';
const projectRoot = mkdtempSync(join(tmpdir(), 'reversa-cs-agent-live-'));
const snapshotDir = join(projectRoot, '.reversa', 'context', 'cs-agent');
const inventoryPath = join(projectRoot, 'inventory.md');

async function main() {
  if (!existsSync(executablePath)) {
    throw new Error(`cs-agent executable not found: ${executablePath}`);
  }

  await collectSnapshot({
    projectRoot,
    executablePath,
    profile,
    outDir: snapshotDir,
    timeoutMs: Number.parseInt(process.env.CS_AGENT_TIMEOUT_MS || '300000', 10),
  });

  const validation = validateSnapshotMeta(snapshotDir);
  if (!validation.ok) {
    throw new Error(`snapshot validation failed: ${validation.problems.join(', ')}`);
  }

  renderInventorySection({ snapshotDir, inventoryPath });

  console.log(`Live cs-agent integration test passed for profile ${profile}.`);
  console.log(`Snapshot: ${snapshotDir}`);
  console.log(`Inventory: ${inventoryPath}`);

  if (!keepTmp) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err.stack || err.message || String(err));
  console.error(`Temporary directory kept for inspection: ${projectRoot}`);
  process.exit(1);
});
