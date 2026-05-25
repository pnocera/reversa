import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Writer } from '../writer.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'reversa-writer-test-'));
}

function baseAnswers(csAgent) {
  return {
    project_name: 'sample',
    user_name: 'Neo',
    chat_language: 'en-us',
    doc_language: 'English',
    output_folder: '_reversa_sdd',
    answer_mode: 'chat',
    agents: ['reversa', 'reversa-scout'],
    engines: ['codex'],
    csAgent,
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function slashPath(value) {
  return value.replace(/\\/g, '/');
}

test('writer stores enabled cs-agent executable in config.user.toml and tracks context cache', () => {
  const root = tempDir();
  try {
    const writer = new Writer(root);
    writer.createReversaDir(baseAnswers({
      enabled: true,
      profile: 'CS253',
      executable: 'F:\\smoke\\CS253\\cs-agent.exe',
      dismissed: null,
    }), '1.2.49');

    const config = readFileSync(join(root, '.reversa', 'config.toml'), 'utf8');
    assert.match(config, /\[integrations\.cs_agent\]/);
    assert.match(config, /enabled = true/);
    assert.match(config, /profile = "CS253"/);
    assert.match(config, /executable = ""/);

    const userConfig = readFileSync(join(root, '.reversa', 'config.user.toml'), 'utf8');
    assert.match(userConfig, /\[integrations\.cs_agent\]/);
    assert.match(userConfig, /executable = "F:\\\\smoke\\\\CS253\\\\cs-agent\.exe"/);

    const state = readJson(join(root, '.reversa', 'state.json'));
    assert.equal(state.cs_agent_enablement_dismissed, null);

    assert.ok(existsSync(join(root, '.reversa', 'context', 'cs-agent')));
    assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /\.reversa\/context\/cs-agent\//);
    assert.ok(writer.createdFiles.map(slashPath).includes('.reversa/context/cs-agent'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writer records declined cs-agent fingerprint and still ignores context cache', () => {
  const root = tempDir();
  const dismissedFingerprint = {
    profile: 'CS253',
    ot_home: 'E:\\CS253',
    executable_path: 'F:\\smoke\\CS253\\cs-agent.exe',
    help_sha256: 'abc123',
    dismissed_at: '2026-05-25T00:00:00.000Z',
  };

  try {
    const writer = new Writer(root);
    writer.createReversaDir(baseAnswers({
      enabled: false,
      dismissedFingerprint,
      executable: 'F:\\smoke\\CS253\\cs-agent.exe',
      profile: 'CS253',
    }), '1.2.49');

    const state = readJson(join(root, '.reversa', 'state.json'));
    assert.deepEqual(state.cs_agent_enablement_dismissed, dismissedFingerprint);

    const config = readFileSync(join(root, '.reversa', 'config.toml'), 'utf8');
    assert.match(config, /enabled = false/);
    assert.match(config, /executable = ""/);

    const userConfig = readFileSync(join(root, '.reversa', 'config.user.toml'), 'utf8');
    assert.doesNotMatch(userConfig, /^\[integrations\.cs_agent\]$/m);

    assert.ok(existsSync(join(root, '.reversa', 'context', 'cs-agent')));
    assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /\.reversa\/context\/cs-agent\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
