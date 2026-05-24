import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendTomlStringArrayValue } from '../reversa-config.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'reversa-config-test-'));
}

test('appendTomlStringArrayValue rejects inline arrays', () => {
  const dir = tempDir();
  const filePath = join(dir, 'config.toml');
  writeFileSync(filePath, '[agents]\ninstalled = ["reversa"]\n', 'utf8');

  assert.throws(
    () => appendTomlStringArrayValue(filePath, 'agents', 'installed', 'reversa-content-server'),
    /Inline arrays are not supported/,
  );

  rmSync(dir, { recursive: true, force: true });
});

