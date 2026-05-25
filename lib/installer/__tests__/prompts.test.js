import test from 'node:test';
import assert from 'node:assert/strict';
import { askCsAgentEnablement } from '../prompts.js';

const executable = 'F:\\smoke\\CS253\\cs-agent.exe';

function probeResult() {
  return {
    data: {
      executable,
      executableTrust: {
        help_signature_sha256: 'abc123',
      },
    },
  };
}

function detectResult(profiles) {
  return {
    data: {
      executable,
      profiles,
    },
  };
}

test('askCsAgentEnablement returns profile metadata when installer enables one profile', async () => {
  const result = await askCsAgentEnablement(process.cwd(), {
    probeContentServer: async () => probeResult(),
    detectContentServer: async () => detectResult([
      {
        name: 'CS253',
        ot_home: 'E:\\CS253',
        workdir: 'E:\\CS253_workdir',
        path_checks_green: true,
      },
    ]),
    prompt: async () => ({ enable: true }),
  });

  assert.equal(result.enabled, true);
  assert.equal(result.profile, 'CS253');
  assert.equal(result.ot_home, 'E:\\CS253');
  assert.equal(result.workdir, 'E:\\CS253_workdir');
  assert.equal(result.executable, executable);
  assert.deepEqual(result.fingerprint, {
    profile: 'CS253',
    ot_home: 'E:\\CS253',
    executable_path: executable,
    help_sha256: 'abc123',
  });
});

test('askCsAgentEnablement supports skipping from the multi-profile picker', async () => {
  const result = await askCsAgentEnablement(process.cwd(), {
    probeContentServer: async () => probeResult(),
    detectContentServer: async () => detectResult([
      {
        name: 'CS253',
        ot_home: 'E:\\CS253',
        workdir: 'E:\\CS253_workdir',
        path_checks_green: true,
      },
      {
        name: 'CS254',
        ot_home: 'E:\\CS254',
        workdir: 'E:\\CS254_workdir',
        path_checks_green: true,
      },
    ]),
    prompt: async (questions) => {
      assert.equal(questions[0].type, 'list');
      assert.ok(questions[0].choices.some(choice => choice.value === '__skip_cs_agent_profile__'));
      return { profile: '__skip_cs_agent_profile__' };
    },
  });

  assert.equal(result.enabled, false);
  assert.equal(result.profile, 'CS253');
  assert.equal(result.dismissed.profile, 'CS253');
  assert.equal(result.dismissedFingerprint.profile, 'CS253');
  assert.equal(typeof result.dismissed.dismissed_at, 'string');
});
