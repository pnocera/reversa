#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const DEFAULT_EXE = 'F:\\smoke\\CS253\\cs-agent.exe';
const DEFAULT_PROFILE = 'CS253';
const MARKER_BEGIN = '<!-- reversa:cs-profile:begin -->';
const MARKER_END = '<!-- reversa:cs-profile:end -->';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const reversaBin = join(repoRoot, 'bin', 'reversa.js');

if (process.env.RUN_CS_AGENT_TESTS !== '1') {
  console.log('Skipping live cs-agent integration test. Set RUN_CS_AGENT_TESTS=1 to run it.');
  process.exit(0);
}

const executablePath = process.env.CS_AGENT_EXE || DEFAULT_EXE;
const profile = process.env.CS_AGENT_PROFILE || DEFAULT_PROFILE;
const keepTmp = process.env.KEEP_CS_AGENT_TMP === '1';
const timeoutMs = process.env.CS_AGENT_TIMEOUT_MS || '300000';
const projectRoot = mkdtempSync(join(tmpdir(), 'reversa-cs-agent-live-'));
const snapshotDir = join(projectRoot, 'snapshot');
const inventoryPath = join(projectRoot, 'inventory.md');

function runReversa(args) {
  const result = spawnSync(process.execPath, [reversaBin, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
  });

  if (result.status !== 0) {
    throw new Error([
      `Command failed (${result.status}): node ${reversaBin} ${args.join(' ')}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join('\n'));
  }

  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new Error([
      `Command did not emit valid JSON: node ${reversaBin} ${args.join(' ')}`,
      err.message,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join('\n'));
  }
}

function assertOk(envelope, action) {
  if (envelope?.ok !== true || envelope?.action !== action) {
    throw new Error(`Unexpected ${action} envelope: ${JSON.stringify(envelope)}`);
  }
  return envelope.data || {};
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

async function main() {
  console.log(`Temporary directory: ${projectRoot}`);

  if (!existsSync(executablePath)) {
    throw new Error(`cs-agent executable not found: ${executablePath}`);
  }

  const probeData = assertOk(runReversa([
    'content-server', 'probe',
    '--json',
    '--executable', executablePath,
    '--project', projectRoot,
    '--timeout', timeoutMs,
  ]), 'probe');
  if (!probeData.executable) {
    throw new Error('Probe did not return an executable path.');
  }

  const detectData = assertOk(runReversa([
    'content-server', 'detect',
    '--json',
    '--executable', executablePath,
    '--project', projectRoot,
    '--timeout', timeoutMs,
  ]), 'detect');
  const profileNames = (detectData.profiles || []).map(item => item.name);
  if (!profileNames.includes(profile)) {
    throw new Error(`Detect did not include configured profile "${profile}". Profiles: ${profileNames.join(', ')}`);
  }

  assertOk(runReversa([
    'content-server', 'snapshot',
    '--json',
    '--profile', profile,
    '--executable', executablePath,
    '--out-dir', snapshotDir,
    '--project', projectRoot,
    '--timeout', timeoutMs,
  ]), 'snapshot');

  for (let i = 0; i < 2; i++) {
    assertOk(runReversa([
      'content-server', 'inventory',
      '--json',
      '--write',
      '--snapshot-dir', snapshotDir,
      '--inventory-path', inventoryPath,
      '--project', projectRoot,
      '--ttl-days', '7',
    ]), 'inventory');
  }

  const inventory = readFileSync(inventoryPath, 'utf8');
  const beginCount = count(inventory, MARKER_BEGIN);
  const endCount = count(inventory, MARKER_END);
  if (beginCount !== 1 || endCount !== 1) {
    throw new Error(`Expected exactly one inventory marker pair, got begin=${beginCount}, end=${endCount}`);
  }

  console.log(`Live cs-agent integration test passed for profile ${profile}.`);
  console.log(`Snapshot: ${snapshotDir}`);
  console.log(`Inventory: ${inventoryPath}`);

  if (!keepTmp) {
    rmSync(projectRoot, { recursive: true, force: true });
    console.log('Temporary directory removed.');
  } else {
    console.log(`Temporary directory kept: ${projectRoot}`);
  }
}

main().catch(err => {
  console.error(err.stack || err.message || String(err));
  console.error(`Temporary directory kept for inspection: ${projectRoot}`);
  process.exit(1);
});
