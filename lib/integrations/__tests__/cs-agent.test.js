import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  AdapterError,
  __test,
  collectSnapshot,
  isReadOnlyAllowed,
  renderInventorySection,
  runReadOnly,
  validateSnapshotMeta,
} from '../cs-agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

function fixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), 'reversa-cs-agent-test-'));
}

function fakeExecutable(projectRoot) {
  const exe = join(projectRoot, process.platform === 'win32' ? 'cs-agent.exe' : 'cs-agent');
  writeFileSync(exe, 'fake', 'utf8');
  return exe;
}

function stubRunner(calls) {
  return async (_executable, args) => {
    calls.push(args);
    const command = args.slice(0, 2).join(' ');
    if (args[0] === 'help') {
      return okResult(fixture('help.json'));
    }
    if (command === 'profile info') {
      return okResult(fixture('profile-info.json'));
    }
    if (command === 'graph status') {
      return okResult(fixture('graph-status.json'));
    }
    if (command === 'docs categories') {
      return okResult(fixture('docs-categories.json'));
    }
    return okResult(JSON.stringify({ ok: false, error: { message: 'unexpected' } }));
  };
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

test.afterEach(() => {
  __test.resetRunCmd();
});

test('read-only runner allows only classified commands and pins profile/json flags', async () => {
  const projectRoot = tempProject();
  const calls = [];
  __test.setRunCmd(stubRunner(calls));

  const data = await runReadOnly({
    executable: join(projectRoot, 'cs-agent.exe'),
    projectRoot,
    topic: 'graph',
    command: 'status',
    profile: 'CS253',
  });

  assert.equal(data.status.sourceFileCount, 42);
  assert.deepEqual(calls[0], ['graph', 'status', '--json', '--profile', 'CS253']);
  assert.equal(isReadOnlyAllowed('graph', 'status'), true);
  assert.equal(isReadOnlyAllowed('build', 'run'), false);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('read-only runner rejects unclassified commands', async () => {
  await assert.rejects(
    () => runReadOnly({
      executable: 'cs-agent.exe',
      topic: 'init',
      command: 'refresh',
      profile: 'CS253',
    }),
    err => err instanceof AdapterError && err.code === 'unclassified_command',
  );
});

test('collectSnapshot writes snapshot data and validation accepts it', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const outDir = join(projectRoot, '.reversa', 'context', 'cs-agent');
  const calls = [];
  __test.setRunCmd(stubRunner(calls));

  const result = await collectSnapshot({
    projectRoot,
    executablePath: exe,
    profile: 'CS253',
    outDir,
  });

  assert.equal(result.snapshotDir, outDir);
  assert.equal(result.meta.profile, 'CS253');
  assert.ok(existsSync(join(outDir, '_meta.json')));
  assert.ok(existsSync(join(outDir, 'profile-info.json')));
  assert.ok(existsSync(join(outDir, 'graph-status.json')));
  assert.ok(existsSync(join(outDir, 'docs-categories.json')));

  const validation = validateSnapshotMeta(outDir);
  assert.equal(validation.ok, true);
  assert.equal(validation.stale, false);
  assert.equal(calls.length, 4);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('renderInventorySection replaces an existing marked block', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const outDir = join(projectRoot, '.reversa', 'context', 'cs-agent');
  const inventoryPath = join(projectRoot, '_reversa_sdd', 'inventory.md');
  mkdirSync(dirname(inventoryPath), { recursive: true });
  writeFileSync(
    inventoryPath,
    'before\n\n<!-- reversa:cs-profile:begin -->\nold\n<!-- reversa:cs-profile:end -->\n\nafter\n',
    'utf8',
  );
  __test.setRunCmd(stubRunner([]));

  await collectSnapshot({
    projectRoot,
    executablePath: exe,
    profile: 'CS253',
    outDir,
  });
  const result = renderInventorySection({ snapshotDir: outDir, inventoryPath });
  const content = readFileSync(inventoryPath, 'utf8');

  assert.equal(result.written, true);
  assert.match(content, /before/);
  assert.match(content, /CS Profile \(cs-agent\)/);
  assert.match(content, /Source files: 42/);
  assert.doesNotMatch(content, /\nold\n/);
  assert.match(content, /after/);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('renderInventorySection truncates from a dangling begin marker to EOF', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const outDir = join(projectRoot, '.reversa', 'context', 'cs-agent');
  const inventoryPath = join(projectRoot, '_reversa_sdd', 'inventory.md');
  mkdirSync(dirname(inventoryPath), { recursive: true });
  writeFileSync(
    inventoryPath,
    'before\n\n<!-- reversa:cs-profile:begin -->\nold without end\nmanual tail\n',
    'utf8',
  );
  __test.setRunCmd(stubRunner([]));

  await collectSnapshot({
    projectRoot,
    executablePath: exe,
    profile: 'CS253',
    outDir,
  });
  const result = renderInventorySection({ snapshotDir: outDir, inventoryPath });
  const content = readFileSync(inventoryPath, 'utf8');

  assert.equal(result.warning, 'partial_marker_replaced_to_eof');
  assert.match(content, /before/);
  assert.match(content, /CS Profile \(cs-agent\)/);
  assert.doesNotMatch(content, /old without end/);
  assert.doesNotMatch(content, /manual tail/);

  rmSync(projectRoot, { recursive: true, force: true });
});
