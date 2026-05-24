import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { __test } from '../../integrations/cs-agent.js';
import {
  detect,
  inventory,
  snapshot,
} from '../content-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'integrations', '__tests__', 'fixtures');

function fixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), 'reversa-content-server-test-'));
}

function fakeExecutable(projectRoot) {
  const exe = join(projectRoot, process.platform === 'win32' ? 'cs-agent.exe' : 'cs-agent');
  writeFileSync(exe, 'fake', 'utf8');
  return exe;
}

function okResult(stdout) {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    timedOut: false,
    durationMs: 1,
  };
}

function stubRunner(calls) {
  return async (_executable, args) => {
    calls.push(args);
    const command = args.slice(0, 2).join(' ');
    if (args[0] === 'help') return okResult(fixture('help.json'));
    if (command === 'profile info') return okResult(fixture('profile-info.json'));
    if (command === 'graph status') return okResult(fixture('graph-status.json'));
    if (command === 'docs categories') return okResult(fixture('docs-categories.json'));
    return okResult(JSON.stringify({ ok: false, error: { message: 'unexpected' } }));
  };
}

test.afterEach(() => {
  __test.resetRunCmd();
});

test('detect returns profiles and executable trust', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const calls = [];
  __test.setRunCmd(stubRunner(calls));

  const envelope = await detect({
    project: projectRoot,
    executable: exe,
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.action, 'detect');
  assert.equal(envelope.data.active, 'CS253');
  assert.equal(envelope.data.executableTrust.path, exe);
  assert.deepEqual(calls.map(args => args.slice(0, 2).join(' ')), ['help --json', 'profile info']);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('snapshot can run in explicit test mode without enabled config', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const outDir = join(projectRoot, 'snapshot');
  __test.setRunCmd(stubRunner([]));

  const envelope = await snapshot({
    project: projectRoot,
    executable: exe,
    profile: 'CS253',
    out_dir: outDir,
  });

  assert.equal(envelope.ok, true);
  assert.equal(envelope.action, 'snapshot');
  assert.equal(envelope.data.snapshotDir, outDir);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('inventory writes a marked block from an explicit snapshot directory', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const outDir = join(projectRoot, 'snapshot');
  const inventoryPath = join(projectRoot, 'inventory.md');
  __test.setRunCmd(stubRunner([]));

  await snapshot({
    project: projectRoot,
    executable: exe,
    profile: 'CS253',
    out_dir: outDir,
  });

  const envelope = await inventory({
    project: projectRoot,
    snapshot_dir: outDir,
    inventory_path: inventoryPath,
  });

  assert.equal(envelope.ok, true);
  assert.match(readFileSync(inventoryPath, 'utf8'), /CS Profile \(cs-agent\)/);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('snapshot requires enabled config unless explicit flags are present', async () => {
  const projectRoot = tempProject();
  await assert.rejects(
    () => snapshot({ project: projectRoot, profile: 'CS253' }),
    err => err.code === 'cs_agent_not_enabled',
  );
  rmSync(projectRoot, { recursive: true, force: true });
});
