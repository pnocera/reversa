import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import update from '../update.js';

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'reversa-update-test-'));
  const reversaDir = join(root, '.reversa');
  const configDir = join(reversaDir, '_config');
  return { root, reversaDir, configDir };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function slashPath(value) {
  return value.replace(/\\/g, '/');
}

test('update migrates existing discovery installs to include reversa-content-server once', async () => {
  const { root, reversaDir, configDir } = makeProject();
  const previousCwd = process.cwd();
  const previousFetch = globalThis.fetch;
  const inquirer = await import('inquirer');
  const previousPrompt = inquirer.default.prompt;

  try {
    await mkdir(configDir, { recursive: true });
    writeJson(join(reversaDir, 'state.json'), {
      version: '1.2.49',
      phase: null,
      agents: ['reversa', 'reversa-scout'],
      engines: ['codex'],
      created_files: [],
      cs_agent_enablement_dismissed: false,
    });
    writeFileSync(join(reversaDir, 'version'), '1.2.49', 'utf8');
    writeJson(join(configDir, 'files-manifest.json'), {});
    writeFileSync(join(reversaDir, 'config.user.toml'), '', 'utf8');
    writeFileSync(join(reversaDir, 'config.toml'), [
      '[agents]',
      'installed = [',
      '  "reversa",',
      '  "reversa-scout",',
      ']',
      '',
      '[engines]',
      'installed = [',
      '  "codex",',
      ']',
      '',
      '[analysis]',
      'answer_mode = "chat"',
      '',
    ].join('\n'), 'utf8');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ version: '1.2.49' }),
    });
    inquirer.default.prompt = async () => ({ confirm: true });
    process.chdir(root);

    await update([]);
    await update([]);

    const state = readJson(join(reversaDir, 'state.json'));
    assert.deepEqual(
      state.agents.filter(agent => agent === 'reversa-content-server'),
      ['reversa-content-server'],
    );
    assert.equal(state.cs_agent_enablement_dismissed, null);
    const createdFiles = state.created_files.map(slashPath);
    assert.ok(createdFiles.includes('.agents/skills/reversa-content-server'));

    const config = readFileSync(join(reversaDir, 'config.toml'), 'utf8');
    assert.equal(countMatches(config, /"reversa-content-server"/g), 1);
    assert.match(config, /\[integrations\.cs_agent\]/);
    assert.match(config, /enabled = false/);

    assert.ok(existsSync(join(root, '.agents', 'skills', 'reversa-content-server', 'SKILL.md')));
    assert.equal(existsSync(join(root, '.agents', 'skills', 'reversa-migrate')), false);

    const manifest = readJson(join(configDir, 'files-manifest.json'));
    const manifestKeys = Object.keys(manifest).map(slashPath);
    assert.ok(manifestKeys.includes('.agents/skills/reversa-content-server/SKILL.md'));
  } finally {
    process.chdir(previousCwd);
    globalThis.fetch = previousFetch;
    inquirer.default.prompt = previousPrompt;
    rmSync(root, { recursive: true, force: true });
  }
});

test('update backfills cs-agent defaults without injecting core skill for non-discovery installs', async () => {
  const { root, reversaDir, configDir } = makeProject();
  const previousCwd = process.cwd();
  const previousFetch = globalThis.fetch;
  const inquirer = await import('inquirer');
  const previousPrompt = inquirer.default.prompt;

  try {
    await mkdir(configDir, { recursive: true });
    writeJson(join(reversaDir, 'state.json'), {
      version: '1.2.49',
      phase: null,
      agents: ['reversa-scout'],
      engines: [],
      created_files: [],
      cs_agent_enablement_dismissed: true,
    });
    writeFileSync(join(reversaDir, 'version'), '1.2.49', 'utf8');
    writeJson(join(configDir, 'files-manifest.json'), {});
    writeFileSync(join(reversaDir, 'config.user.toml'), '', 'utf8');
    writeFileSync(join(reversaDir, 'config.toml'), [
      '[agents]',
      'installed = [',
      '  "reversa-scout",',
      ']',
      '',
      '[engines]',
      'installed = []',
      '',
      '[analysis]',
      'answer_mode = "chat"',
      '',
    ].join('\n'), 'utf8');

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ version: '1.2.49' }),
    });
    inquirer.default.prompt = async () => ({ confirm: true });
    process.chdir(root);

    await update([]);

    const state = readJson(join(reversaDir, 'state.json'));
    assert.deepEqual(state.agents, ['reversa-scout']);
    assert.equal(state.cs_agent_enablement_dismissed, null);

    const config = readFileSync(join(reversaDir, 'config.toml'), 'utf8');
    assert.equal(countMatches(config, /"reversa-content-server"/g), 0);
    assert.match(config, /\[integrations\.cs_agent\]/);
    assert.match(config, /enabled = false/);

    assert.equal(existsSync(join(root, '.agents', 'skills', 'reversa-content-server')), false);
  } finally {
    process.chdir(previousCwd);
    globalThis.fetch = previousFetch;
    inquirer.default.prompt = previousPrompt;
    rmSync(root, { recursive: true, force: true });
  }
});
