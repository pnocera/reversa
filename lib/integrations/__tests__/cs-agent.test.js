import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  AdapterError,
  __test,
  collectSnapshot,
  detectProfile,
  isReadOnlyAllowed,
  probe,
  renderInventorySection,
  resolveExecutable,
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
  delete process.env.CS_AGENT_EXE;
  delete process.env.CS_AGENT_EXECUTABLE;
  delete process.env.CSWORKS_ROOT;
  __test.resetRunCmd();
});

test('resolveExecutable honors configured aliases and ignores CSWORKS_ROOT', () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  process.env.CSWORKS_ROOT = join(projectRoot, 'unused-root');

  const resolved = resolveExecutable({ configured: exe });

  assert.equal(resolved.path, exe);
  assert.equal(resolved.source, 'config');

  rmSync(projectRoot, { recursive: true, force: true });
});

test('resolveExecutable accepts CS_AGENT_EXE when no explicit path is provided', () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  process.env.CS_AGENT_EXE = exe;

  const resolved = resolveExecutable();

  assert.equal(resolved.path, exe);
  assert.equal(resolved.source, 'env:CS_AGENT_EXE');

  rmSync(projectRoot, { recursive: true, force: true });
});

test('probe accepts a direct executable path and rejects multiple JSON envelopes', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  __test.setRunCmd(async () => okResult(fixture('help.json')));

  const result = await probe(exe);

  assert.equal(result.executable, exe);
  assert.match(result.helpSignatureSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.help_signature_sha256, result.helpSignatureSha256);
  assert.equal(result.executableTrust.helpSignatureSha256, result.helpSignatureSha256);
  assert.ok(result.executableTrust.mtime_iso);

  __test.setRunCmd(async () => okResult('{"ok":true,"data":{}}\n{"ok":true,"data":{}}'));
  await assert.rejects(
    () => probe({ executablePath: exe, force: true }),
    err => err instanceof AdapterError && err.code === 'multi_envelope',
  );

  rmSync(projectRoot, { recursive: true, force: true });
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

test('read-only runner rejects empty profile before spawning', async () => {
  const calls = [];
  __test.setRunCmd(async (_executable, args) => {
    calls.push(args);
    return okResult(fixture('profile-info.json'));
  });

  await assert.rejects(
    () => runReadOnly('profile', 'info', {
      executable: 'cs-agent.exe',
      profile: '',
    }),
    err => err instanceof AdapterError && err.code === 'profile_required',
  );
  assert.equal(calls.length, 0);
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

test('detectProfile is the profile-less registry aggregation path', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const calls = [];
  __test.setRunCmd(async (_executable, args) => {
    calls.push(args);
    if (args[0] === 'profile' && args[1] === 'info' && !args.includes('--profile')) {
      return okResult(JSON.stringify({
        ok: true,
        profile: 'CS253',
        data: {
          active: 'CS253',
          profile: { name: 'CS253', ot_home: 'E:\\CS253', workdir: 'E:\\CS253_workdir' },
          registry: [{ name: 'CS253' }, { name: 'OTHER' }],
        },
      }));
    }
    if (args.includes('OTHER')) {
      return okResult(JSON.stringify({
        ok: true,
        profile: 'OTHER',
        data: {
          profile: { name: 'OTHER', ot_home: 'E:\\OTHER', workdir: 'E:\\OTHER_workdir' },
          path_checks: [{ exists: true }],
        },
      }));
    }
    return okResult(JSON.stringify({ ok: false, error: { message: 'unexpected' } }));
  });

  const result = await detectProfile({ executablePath: exe });

  assert.equal(result.active, 'CS253');
  assert.deepEqual(result.profiles.map(profile => profile.name), ['CS253', 'OTHER']);
  assert.deepEqual(calls[0], ['profile', 'info', '--json']);
  assert.deepEqual(calls[1], ['profile', 'info', '--json', '--profile', 'OTHER']);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('read-only runner rejects profile mismatch', async () => {
  __test.setRunCmd(async () => okResult(JSON.stringify({
    ok: true,
    profile: 'OTHER',
    data: {},
  })));

  await assert.rejects(
    () => runReadOnly('graph', 'status', {
      executable: 'cs-agent.exe',
      profile: 'CS253',
    }),
    err => err instanceof AdapterError
      && err.code === 'profile_mismatch'
      && err.details.expected === 'CS253'
      && err.details.actual === 'OTHER',
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
  assert.equal(result.meta.collected_at, result.meta.created_at);
  assert.equal(result.meta.snapshot_ttl_days, 7);
  assert.equal(result.meta.snapshot_files.profile_info, 'profile-info.json');
  assert.ok(result.meta.executable_trust.mtime_iso);
  assert.ok(result.meta.executable_trust.sizeBytes);
  assert.ok(existsSync(join(outDir, '_meta.json')));
  assert.ok(existsSync(join(outDir, 'profile-info.json')));
  assert.ok(existsSync(join(outDir, 'graph-status.json')));
  assert.ok(existsSync(join(outDir, 'docs-categories.json')));

  const validation = validateSnapshotMeta(join(outDir, '_meta.json'));
  assert.equal(validation.ok, true);
  assert.equal(validation.stale, false);
  assert.equal(calls.length, 4);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('collectSnapshot refuses partial snapshots and leaves no commit marker', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const outDir = join(projectRoot, '.reversa', 'context', 'cs-agent');
  __test.setRunCmd(async (_executable, args) => {
    const command = args.slice(0, 2).join(' ');
    if (args[0] === 'help') return okResult(fixture('help.json'));
    if (command === 'profile info') return okResult(fixture('profile-info.json'));
    if (command === 'graph status') {
      return {
        stdout: '',
        stderr: 'graph failed',
        exitCode: 1,
        timedOut: false,
        durationMs: 1,
      };
    }
    return okResult(fixture('docs-categories.json'));
  });

  await assert.rejects(
    () => collectSnapshot({
      projectRoot,
      executablePath: exe,
      profile: 'CS253',
      outDir,
    }),
    err => err instanceof AdapterError
      && err.code === 'snapshot_partial'
      && err.details.successes.includes('profile-info'),
  );
  assert.equal(existsSync(join(outDir, '_meta.json')), false);
  assert.equal(existsSync(join(outDir, 'profile-info.json')), false);

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
  assert.equal(result.action, 'replaced');
  assert.match(content, /before/);
  assert.match(content, /CS Profile \(cs-agent\)/);
  assert.match(content, /Source files: 42/);
  assert.doesNotMatch(content, /\nold\n/);
  assert.match(content, /after/);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('renderInventorySection can print a stale snapshot block without writing inventory', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const outDir = join(projectRoot, '.reversa', 'context', 'cs-agent');
  const inventoryPath = join(projectRoot, '_reversa_sdd', 'inventory.md');
  __test.setRunCmd(stubRunner([]));

  await collectSnapshot({
    projectRoot,
    executablePath: exe,
    profile: 'CS253',
    outDir,
    snapshotTtlDays: 1,
  });
  const metaPath = join(outDir, '_meta.json');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  meta.created_at = '2000-01-01T00:00:00.000Z';
  meta.collected_at = meta.created_at;
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  const result = renderInventorySection({
    snapshotDir: outDir,
    inventoryPath,
    mode: 'print',
  });

  assert.equal(result.written, false);
  assert.equal(result.action, 'printed');
  assert.equal(result.validation.stale, true);
  assert.match(result.block, /snapshot is older than the configured freshness window/);
  assert.equal(existsSync(inventoryPath), false);

  rmSync(projectRoot, { recursive: true, force: true });
});

test('renderInventorySection creates the inventory parent directory', async () => {
  const projectRoot = tempProject();
  const exe = fakeExecutable(projectRoot);
  const outDir = join(projectRoot, '.reversa', 'context', 'cs-agent');
  const inventoryPath = join(projectRoot, '_reversa_sdd', 'nested', 'inventory.md');
  __test.setRunCmd(stubRunner([]));

  await collectSnapshot({
    projectRoot,
    executablePath: exe,
    profile: 'CS253',
    outDir,
  });
  const result = renderInventorySection({ snapshotDir: outDir, inventoryPath });

  assert.equal(result.written, true);
  assert.ok(existsSync(inventoryPath));
  assert.match(readFileSync(inventoryPath, 'utf8'), /CS Profile \(cs-agent\)/);

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

test('audit log rotates before append would exceed the limit', async () => {
  const projectRoot = tempProject();
  const logDir = join(projectRoot, '.reversa', 'context', 'cs-agent');
  const logPath = join(logDir, 'adapter.log');
  mkdirSync(logDir, { recursive: true });
  writeFileSync(logPath, `${'x'.repeat(120)}\n`.repeat(45_000), 'utf8');
  __test.setRunCmd(stubRunner([]));

  await runReadOnly('profile', 'info', {
    executable: join(projectRoot, 'cs-agent.exe'),
    projectRoot,
    profile: 'CS253',
  });

  assert.ok(statSync(logPath).size < 5 * 1024 * 1024);
  assert.match(readFileSync(logPath, 'utf8'), /profile=CS253/);

  rmSync(projectRoot, { recursive: true, force: true });
});
