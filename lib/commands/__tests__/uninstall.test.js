import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import uninstall from '../uninstall.js';

test('uninstall removes the cs-agent context cache with .reversa', async () => {
  const root = mkdtempSync(join(tmpdir(), 'reversa-uninstall-test-'));
  const previousCwd = process.cwd();
  const inquirer = await import('inquirer');
  const previousPrompt = inquirer.default.prompt;

  try {
    mkdirSync(join(root, '.reversa', 'context', 'cs-agent'), { recursive: true });
    writeFileSync(join(root, '.reversa', 'context', 'cs-agent', '_meta.json'), '{}', 'utf8');
    writeFileSync(join(root, '.reversa', 'state.json'), JSON.stringify({
      version: '1.2.49',
      output_folder: '_reversa_sdd',
      created_files: [],
    }, null, 2), 'utf8');

    inquirer.default.prompt = async (questions) => {
      if (questions[0].name === 'confirmed') return { confirmed: 'remove' };
      return { removeOutput: false };
    };
    process.chdir(root);

    await uninstall([]);

    assert.equal(existsSync(join(root, '.reversa', 'context', 'cs-agent')), false);
    assert.equal(existsSync(join(root, '.reversa')), false);
  } finally {
    process.chdir(previousCwd);
    inquirer.default.prompt = previousPrompt;
    rmSync(root, { recursive: true, force: true });
  }
});
