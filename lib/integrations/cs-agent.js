import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { spawn, spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export const ADAPTER_VERSION = '0.1.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const AUDIT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TTL_HOURS = 7 * 24;
const CS_PROFILE_START = '<!-- reversa:cs-profile:begin -->';
const CS_PROFILE_END = '<!-- reversa:cs-profile:end -->';
const LEGACY_PROFILE_START = '<!-- REVERSA:CS_AGENT_INVENTORY START -->';
const LEGACY_PROFILE_END = '<!-- REVERSA:CS_AGENT_INVENTORY END -->';
const SNAPSHOT_FILES = {
  profile: 'profile-info.json',
  graph: 'graph-status.json',
  docs: 'docs-categories.json',
};
const READ_ONLY_COMMANDS = new Set([
  'profile info',
  'graph status',
  'docs categories',
]);

let runCmdImpl = defaultRunCmd;
const probeCache = new Map();

export class AdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.details = details;
  }
}

export const __test = {
  setRunCmd(fn) {
    runCmdImpl = fn;
    probeCache.clear();
  },
  resetRunCmd() {
    runCmdImpl = defaultRunCmd;
    probeCache.clear();
  },
};

export function resolveExecutable(options = {}) {
  const configuredPath = options.executablePath || options.configuredPath;
  if (configuredPath) {
    const absolute = resolve(configuredPath);
    if (existsSync(absolute)) {
      return { path: absolute, source: 'config', hint: null };
    }
    throw new AdapterError('executable_not_found', `Configured cs-agent executable not found: ${absolute}`, {
      path: absolute,
    });
  }

  const envPath = process.env.CS_AGENT_EXE || process.env.CS_AGENT_EXECUTABLE;
  if (envPath) {
    const absolute = resolve(envPath);
    if (existsSync(absolute)) {
      return {
        path: absolute,
        source: process.env.CS_AGENT_EXE ? 'env:CS_AGENT_EXE' : 'env:CS_AGENT_EXECUTABLE',
        hint: 'Resolved cs-agent from environment. Pin integrations.cs_agent.executable for repeatable project runs.',
      };
    }
    throw new AdapterError('executable_not_found', `Environment cs-agent executable not found: ${absolute}`, {
      path: absolute,
      source: process.env.CS_AGENT_EXE ? 'CS_AGENT_EXE' : 'CS_AGENT_EXECUTABLE',
    });
  }

  const packaged = join(PACKAGE_ROOT, process.platform === 'win32' ? 'cs-agent.exe' : 'cs-agent');
  if (existsSync(packaged)) {
    return { path: packaged, source: 'package', hint: null };
  }

  const pathCandidate = findOnPath(process.platform === 'win32' ? 'cs-agent.exe' : 'cs-agent');
  if (pathCandidate) {
    return {
      path: pathCandidate,
      source: 'PATH',
      hint: 'Resolved cs-agent from PATH. Pin integrations.cs_agent.executable for repeatable runs.',
    };
  }

  throw new AdapterError('executable_not_found', 'cs-agent executable was not found', {
    searched: ['configured path', 'CS_AGENT_EXE', 'CS_AGENT_EXECUTABLE', packaged, 'PATH'],
  });
}

export async function probe(options = {}) {
  const resolved = resolveExecutable(options);
  const stat = statSync(resolved.path);
  const cacheKey = `${resolved.path}:${stat.size}:${stat.mtimeMs}`;
  if (!options.force && probeCache.has(cacheKey)) return probeCache.get(cacheKey);

  const result = await executeJson(resolved.path, ['help', '--json'], {
    timeoutMs: options.timeoutMs,
    cwd: options.cwd,
  });

  const help = unwrapData(result.envelope);
  const rawStdout = result.rawStdout;
  const helpSignatureSha256 = sha256(rawStdout);
  const trust = executableTrust(resolved.path, stat);

  const summary = {
    adapterVersion: ADAPTER_VERSION,
    executable: resolved.path,
    source: resolved.source,
    hint: resolved.hint,
    commandCount: countCommands(help),
    topics: listTopics(help),
    helpSignatureSha256,
    executableTrust: {
      ...trust,
      help_signature_sha256: helpSignatureSha256,
    },
  };

  probeCache.set(cacheKey, summary);
  return summary;
}

export async function detectProfile(options = {}) {
  const resolved = resolveExecutable(options);
  const activeResult = await executeJson(resolved.path, ['profile', 'info', '--json'], {
    timeoutMs: options.timeoutMs,
    cwd: options.cwd,
  });
  const activeData = unwrapData(activeResult.envelope);
  const activeName = activeData.active
    || activeData.profile?.name
    || activeResult.envelope.profile
    || null;
  const registry = extractRegistry(activeData);
  const profiles = new Map();

  if (activeName) {
    profiles.set(activeName, summarizeProfile(activeName, activeData));
  }

  for (const entry of registry) {
    const name = entry.name || entry.profile || entry.id;
    if (!name || profiles.has(name)) continue;
    const result = await executeJson(resolved.path, ['profile', 'info', '--json', '--profile', name], {
      expectedProfile: name,
      timeoutMs: options.timeoutMs,
      cwd: options.cwd,
      allowMissingProfile: true,
    });
    profiles.set(name, summarizeProfile(name, unwrapData(result.envelope)));
  }

  return {
    adapterVersion: ADAPTER_VERSION,
    executable: resolved.path,
    active: activeName,
    profiles: [...profiles.values()],
    registryCount: registry.length,
  };
}

export function isReadOnlyAllowed(topic, command) {
  return READ_ONLY_COMMANDS.has(`${topic} ${command}`);
}

export async function runReadOnly(options = {}) {
  const {
    executable,
    projectRoot = process.cwd(),
    topic,
    command,
    profile,
    args = [],
    flags = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cwd,
  } = options;

  if (!profile) {
    throw new AdapterError('profile_required', 'A cs-agent profile is required before running read-only commands');
  }
  if (!isReadOnlyAllowed(topic, command)) {
    throw new AdapterError('unclassified_command', `Command is not classified read-only: ${topic} ${command}`, {
      topic,
      command,
    });
  }

  const argv = [
    topic,
    command,
    ...args,
    '--json',
    '--profile',
    profile,
    ...renderFlags(flags),
  ];

  let audit = null;
  try {
    const result = await executeJson(executable, argv, {
      expectedProfile: profile,
      timeoutMs,
      cwd,
    });
    audit = {
      ok: true,
      argv,
      profile,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
    };
    return unwrapData(result.envelope);
  } catch (err) {
    audit = {
      ok: false,
      argv,
      profile,
      error: normalizeError(err),
    };
    throw err;
  } finally {
    appendAuditLog(projectRoot, {
      at: new Date().toISOString(),
      adapterVersion: ADAPTER_VERSION,
      executable,
      ...audit,
    });
  }
}

export async function collectSnapshot(options = {}) {
  const {
    projectRoot = process.cwd(),
    outDir = join(projectRoot, '.reversa', 'context', 'cs-agent'),
    profile,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cwd,
  } = options;

  if (!profile) {
    throw new AdapterError('profile_required', 'A cs-agent profile is required before collecting a snapshot');
  }

  const resolved = resolveExecutable(options);
  const snapshotDir = resolve(outDir);
  const stagingDir = join(snapshotDir, `.staging-${randomUUID()}`);

  mkdirSync(stagingDir, { recursive: true });

  try {
    const probeResult = await probe({ ...options, executablePath: resolved.path, force: true, timeoutMs, cwd });
    const profileInfo = await runReadOnly({
      executable: resolved.path,
      projectRoot,
      topic: 'profile',
      command: 'info',
      profile,
      timeoutMs,
      cwd,
    });
    const graphStatus = await runReadOnly({
      executable: resolved.path,
      projectRoot,
      topic: 'graph',
      command: 'status',
      profile,
      timeoutMs,
      cwd,
    });
    const docsCategories = await runReadOnly({
      executable: resolved.path,
      projectRoot,
      topic: 'docs',
      command: 'categories',
      profile,
      timeoutMs,
      cwd,
    });

    writeJson(join(stagingDir, SNAPSHOT_FILES.profile), profileInfo);
    writeJson(join(stagingDir, SNAPSHOT_FILES.graph), graphStatus);
    writeJson(join(stagingDir, SNAPSHOT_FILES.docs), docsCategories);

    const meta = {
      adapter_version: ADAPTER_VERSION,
      created_at: new Date().toISOString(),
      profile,
      executable_path: resolved.path,
      executable_source: resolved.source,
      executable_trust: probeResult.executableTrust,
      schema_version_observed: observedSchemaVersion(profileInfo, graphStatus, docsCategories),
      files: SNAPSHOT_FILES,
    };
    writeJson(join(stagingDir, '_meta.json'), meta);

    mkdirSync(snapshotDir, { recursive: true });
    for (const fileName of [...Object.values(SNAPSHOT_FILES), '_meta.json']) {
      moveReplacing(join(stagingDir, fileName), join(snapshotDir, fileName));
    }
    rmSync(stagingDir, { recursive: true, force: true });

    return {
      snapshotDir,
      meta,
    };
  } catch (err) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }
}

export function validateSnapshotMeta(snapshotDir, options = {}) {
  const dir = resolve(snapshotDir);
  const problems = [];
  const metaPath = join(dir, '_meta.json');
  let meta = null;

  if (!existsSync(metaPath)) {
    return {
      ok: false,
      meta: null,
      problems: ['missing_meta'],
      stale: false,
      executableDrift: false,
    };
  }

  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    return {
      ok: false,
      meta: null,
      problems: ['invalid_meta_json'],
      stale: false,
      executableDrift: false,
    };
  }

  const files = meta.files || SNAPSHOT_FILES;
  for (const fileName of Object.values(files)) {
    const filePath = join(dir, fileName);
    if (!existsSync(filePath)) {
      problems.push(`missing_${fileName}`);
      continue;
    }
    try {
      JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      problems.push(`invalid_${fileName}`);
    }
  }

  const ttlHours = options.ttlHours ?? DEFAULT_TTL_HOURS;
  const createdAt = Date.parse(meta.created_at);
  const stale = Number.isFinite(createdAt)
    ? Date.now() - createdAt > ttlHours * 60 * 60 * 1000
    : true;
  if (!Number.isFinite(createdAt)) problems.push('invalid_created_at');

  const executableDrift = detectExecutableDrift(meta, {
    executablePath: options.executablePath || options.executable,
    currentHelpSignatureSha256: options.currentHelpSignatureSha256,
  });

  return {
    ok: problems.length === 0,
    meta,
    problems,
    stale,
    executableDrift,
  };
}

export function renderInventorySection(options = {}) {
  const {
    snapshotDir = join(process.cwd(), '.reversa', 'context', 'cs-agent'),
    inventoryPath,
    ttlHours,
  } = options;

  const validation = validateSnapshotMeta(snapshotDir, {
    ttlHours,
    executablePath: options.executablePath,
    currentHelpSignatureSha256: options.currentHelpSignatureSha256,
  });
  if (!validation.ok) {
    throw new AdapterError('snapshot_invalid', 'cs-agent snapshot is missing or invalid', {
      problems: validation.problems,
    });
  }

  const files = validation.meta.files || SNAPSHOT_FILES;
  const profileInfo = readJson(join(snapshotDir, files.profile));
  const graphStatus = readJson(join(snapshotDir, files.graph));
  const docsCategories = readJson(join(snapshotDir, files.docs));
  const block = renderInventoryBlock({
    validation,
    profileInfo,
    graphStatus,
    docsCategories,
  });

  if (!inventoryPath) {
    return { block, validation, written: false, warning: null };
  }

  const existing = existsSync(inventoryPath) ? readFileSync(inventoryPath, 'utf8') : '';
  const next = upsertMarkedBlock(existing, block);
  writeFileSync(inventoryPath, next.text, 'utf8');
  return {
    block,
    validation,
    written: true,
    inventoryPath,
    warning: next.warning,
  };
}

function defaultRunCmd(executable, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
}

async function executeJson(executable, args, options = {}) {
  const result = await runCmdImpl(executable, args, options);
  if (result.timedOut) {
    throw new AdapterError('timeout', `cs-agent command timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`, {
      args,
    });
  }
  if (result.exitCode !== 0) {
    throw new AdapterError('spawn_failed', `cs-agent exited with code ${result.exitCode}`, {
      args,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  }

  const envelope = parseSingleJson(result.stdout, args);
  if (envelope.ok === false) {
    throw new AdapterError('command_failed', envelope.error?.message || 'cs-agent returned ok=false', {
      args,
      error: envelope.error,
    });
  }

  if (options.expectedProfile) {
    const actual = envelope.profile
      || envelope.data?.profile?.name
      || envelope.data?.active
      || null;
    if (!actual && !options.allowMissingProfile) {
      throw new AdapterError('profile_mismatch', 'cs-agent JSON envelope did not include a profile', {
        expected: options.expectedProfile,
      });
    }
    if (actual && actual !== options.expectedProfile) {
      throw new AdapterError('profile_mismatch', 'cs-agent returned data for a different profile', {
        expected: options.expectedProfile,
        actual,
      });
    }
  }

  return {
    envelope,
    rawStdout: result.stdout,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
  };
}

function parseSingleJson(stdout, args) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new AdapterError('invalid_json', 'cs-agent produced no JSON output', { args });
  }
  if (/\}\s*\{/.test(trimmed)) {
    throw new AdapterError('multi_envelope', 'cs-agent produced multiple JSON envelopes', { args });
  }
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new AdapterError('invalid_json', 'cs-agent produced invalid JSON', {
      args,
      cause: err.message,
    });
  }
}

function unwrapData(envelope) {
  return envelope && typeof envelope === 'object' && 'data' in envelope
    ? envelope.data
    : envelope;
}

function findOnPath(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(cmd, [name], {
    windowsHide: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const first = result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean);
  return first || null;
}

function executableTrust(executable, stat = statSync(executable)) {
  return {
    path: executable,
    size_bytes: stat.size,
    mtime_ms: stat.mtimeMs,
    signature: 'not_checked',
  };
}

function countCommands(help) {
  const commands = help?.commands;
  if (Array.isArray(commands)) return commands.length;
  if (commands && typeof commands === 'object') return Object.keys(commands).length;
  if (Array.isArray(help?.topics)) {
    return help.topics.reduce((count, topic) => {
      if (Array.isArray(topic.commands)) return count + topic.commands.length;
      if (topic.commands && typeof topic.commands === 'object') return count + Object.keys(topic.commands).length;
      return count;
    }, 0);
  }
  return 0;
}

function listTopics(help) {
  if (Array.isArray(help?.topics)) {
    return help.topics
      .map(topic => typeof topic === 'string' ? topic : topic.name || topic.topic)
      .filter(Boolean);
  }
  if (help?.topics && typeof help.topics === 'object') return Object.keys(help.topics);
  if (help?.commands && typeof help.commands === 'object') {
    return [...new Set(Object.keys(help.commands).map(key => key.split(/\s+/)[0]))];
  }
  return [];
}

function extractRegistry(data) {
  if (Array.isArray(data?.registry)) return data.registry;
  if (Array.isArray(data?.profiles)) return data.profiles;
  if (data?.registry && typeof data.registry === 'object') {
    return Object.entries(data.registry).map(([name, value]) => ({ name, ...value }));
  }
  return [];
}

function summarizeProfile(name, data) {
  const profile = data.profile || data;
  const pathChecks = data.path_checks || profile.path_checks || [];
  const checks = Array.isArray(pathChecks) ? pathChecks : Object.values(pathChecks);
  const pathChecksGreen = checks.length > 0
    ? checks.every(check => check.ok !== false && check.exists !== false && check.valid !== false)
    : null;

  return {
    name,
    ot_home: profile.ot_home || profile.otHome || profile.paths?.ot_home || profile.paths?.othome || null,
    workdir: profile.workdir || profile.work_dir || profile.paths?.workdir || null,
    srcdir: profile.srcdir || profile.paths?.srcdir || null,
    schema_version: profile.version || profile.schema_version || data.schema_version || data.schemaVersion || null,
    path_checks_green: pathChecksGreen,
  };
}

function renderFlags(flags) {
  const rendered = [];
  if (Array.isArray(flags)) {
    for (const flag of flags) {
      if (flag === '--json' || flag === '--profile') {
        throw new AdapterError('invalid_flag_override', `Flag is controlled by the adapter: ${flag}`);
      }
      rendered.push(flag);
    }
    return rendered;
  }

  for (const [key, value] of Object.entries(flags || {})) {
    const normalized = key.startsWith('--') ? key : `--${key.replace(/_/g, '-')}`;
    if (normalized === '--json' || normalized === '--profile') {
      throw new AdapterError('invalid_flag_override', `Flag is controlled by the adapter: ${normalized}`);
    }
    if (value === false || value == null) continue;
    rendered.push(normalized);
    if (value !== true) rendered.push(String(value));
  }
  return rendered;
}

function observedSchemaVersion(profileInfo, graphStatus, docsCategories) {
  return graphStatus?.schema_version
    || graphStatus?.schemaVersion
    || graphStatus?.status?.schema_version
    || graphStatus?.status?.schemaVersion
    || profileInfo?.profile?.version
    || profileInfo?.schema_version
    || docsCategories?.schema_version
    || null;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function moveReplacing(src, dest) {
  if (existsSync(dest)) unlinkSync(dest);
  renameSync(src, dest);
}

function detectExecutableDrift(meta, options = {}) {
  const pathToCheck = options.executablePath || meta.executable_path;
  if (!pathToCheck || !existsSync(pathToCheck)) return false;
  const current = statSync(pathToCheck);
  const trusted = meta.executable_trust || {};
  const currentHelpSignature = options.currentHelpSignatureSha256;
  return Boolean(
    trusted.size_bytes && trusted.size_bytes !== current.size
    || trusted.mtime_ms && trusted.mtime_ms !== current.mtimeMs
    || currentHelpSignature && trusted.help_signature_sha256 && trusted.help_signature_sha256 !== currentHelpSignature
  );
}

function appendAuditLog(projectRoot, entry) {
  try {
    const dir = join(projectRoot, '.reversa', 'context', 'cs-agent');
    mkdirSync(dir, { recursive: true });
    const logPath = join(dir, 'adapter.log');
    if (existsSync(logPath) && statSync(logPath).size > AUDIT_MAX_BYTES) {
      const lines = readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
      const keepFrom = Math.floor(lines.length * 0.25);
      writeFileSync(logPath, `${lines.slice(keepFrom).join('\n')}\n`, 'utf8');
    }
    writeFileSync(logPath, `${formatAuditEntry(entry)}\n`, { encoding: 'utf8', flag: 'a' });
  } catch {
    // Audit logging must not hide the command result.
  }
}

function formatAuditEntry(entry) {
  const status = entry.ok ? 'ok' : 'fail';
  const argv = (entry.argv || []).map(arg => String(arg).replace(/\s+/g, ' ')).join(' ');
  const fields = [
    entry.at,
    status,
    `profile=${entry.profile || ''}`,
    `code=${entry.exitCode ?? entry.error?.code ?? ''}`,
    `duration_ms=${entry.durationMs ?? ''}`,
    `argv=${argv}`,
  ];
  if (entry.error?.message) fields.push(`failure=${entry.error.message.replace(/\s+/g, ' ')}`);
  return fields.join('\t');
}

function normalizeError(err) {
  return {
    code: err.code || 'unknown',
    message: err.message || String(err),
    details: err.details || {},
  };
}

function renderInventoryBlock({ validation, profileInfo, graphStatus, docsCategories }) {
  const meta = validation.meta;
  const profile = profileInfo.profile || profileInfo;
  const graph = graphStatus.status || graphStatus;
  const docs = docsCategories.categories || docsCategories.docs || [];
  const sourceFiles = numberOrNull(graph.sourceFileCount, graph.source_files, graph.files, graph.fileCount);
  const supportAssets = numberOrNull(
    graph.supportAssetCount,
    graph.supportAssetFileCount,
    graph.support_assets,
    graph.supportFiles,
    graph.support?.fileCount,
  );
  const nodes = numberOrNull(graph.nodeCount, graph.nodes);
  const edges = numberOrNull(graph.edgeCount, graph.edges);
  const errors = numberOrNull(
    graph.extractionErrors,
    graph.extractionErrorFileCount,
    graph.extraction_error_count,
    graph.errorCount,
  );
  const modules = listModuleCounts(graph.countsByModule || graph.modules || graph.support?.countsByModule);
  const unresolved = graph.unresolvedRefsByKind || graph.unresolved_refs_by_kind || {};
  const confidence = graph.confidenceCounts || graph.confidence || graph.edgesByConfidence || {};

  const lines = [
    CS_PROFILE_START,
    '## CS Profile (cs-agent)',
    '',
  ];

  if (validation.stale) {
    lines.push('> Warning: cs-agent snapshot is older than the configured freshness window.', '');
  }
  if (validation.executableDrift) {
    lines.push('> Warning: cs-agent executable metadata changed since this snapshot was collected.', '');
  }

  lines.push(
    `Generated: ${meta.created_at}`,
    `Profile: ${inline(meta.profile)}`,
    `Adapter: ${inline(meta.adapter_version || ADAPTER_VERSION)}`,
    '',
    '### Profile',
    `- OT home: ${inline(profile.ot_home || profile.otHome || profile.paths?.ot_home || profile.paths?.othome || 'unknown')}`,
    `- Workdir: ${inline(profile.workdir || profile.work_dir || profile.paths?.workdir || 'unknown')}`,
    `- Source dir: ${inline(profile.srcdir || profile.paths?.srcdir || 'unknown')}`,
    `- Schema version: ${inline(meta.schema_version_observed || profile.version || profile.schema_version || 'unknown')}`,
    '',
    '### Graph',
    `- Source files: ${formatNumber(sourceFiles)}`,
    `- Support assets: ${formatNumber(supportAssets)}`,
    `- Nodes: ${formatNumber(nodes)}`,
    `- Edges: ${formatNumber(edges)}`,
    `- Extraction errors: ${formatNumber(errors)}`,
  );

  if (modules.length > 0) {
    lines.push('', '### Modules', ...modules.map(item => `- ${item.name}: ${formatNumber(item.count)}`));
  }

  const confidenceEntries = keyCountEntries(confidence);
  if (confidenceEntries.length > 0) {
    lines.push(
      '',
      '### Reference Confidence',
      ...confidenceEntries.map(item => `- ${item.name}: ${formatNumber(item.count)}`),
    );
  }

  const unresolvedEntries = keyCountEntries(unresolved);
  if (unresolvedEntries.length > 0) {
    lines.push(
      '',
      '### Unresolved References',
      ...unresolvedEntries.map(item => `- ${item.name}: ${formatNumber(item.count)}`),
    );
  }

  const docNames = Array.isArray(docs)
    ? docs.map(item => typeof item === 'string' ? item : item.name || item.id).filter(Boolean)
    : Object.keys(docs);
  if (docNames.length > 0) {
    lines.push('', '### Documentation Categories', ...docNames.map(name => `- ${name}`));
  }

  lines.push(CS_PROFILE_END, '');
  return lines.join('\n');
}

function upsertMarkedBlock(existing, block) {
  const pairs = [
    { start: CS_PROFILE_START, end: CS_PROFILE_END },
    { start: LEGACY_PROFILE_START, end: LEGACY_PROFILE_END },
  ];

  for (const pair of pairs) {
    const startIndex = existing.indexOf(pair.start);
    const endIndex = existing.indexOf(pair.end);
    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      const afterEnd = endIndex + pair.end.length;
      return {
        text: `${existing.slice(0, startIndex)}${block}${existing.slice(afterEnd).replace(/^\s*/u, '')}`,
        warning: pair.start === CS_PROFILE_START ? null : 'legacy_marker_replaced',
      };
    }
    if (startIndex !== -1) {
      return {
        text: `${existing.slice(0, startIndex).replace(/\s+$/u, '')}${existing.slice(0, startIndex).trim() ? '\n\n' : ''}${block}`,
        warning: 'partial_marker_replaced_to_eof',
      };
    }
    if (endIndex !== -1) {
      const headingIndex = Math.max(
        existing.lastIndexOf('## CS Profile (cs-agent)', endIndex),
        existing.lastIndexOf('## Content Server Inventory', endIndex),
      );
      const replaceFrom = headingIndex !== -1
        ? lineStartIndex(existing, headingIndex)
        : lineStartIndex(existing, endIndex);
      const afterEnd = endIndex + pair.end.length;
      return {
        text: `${existing.slice(0, replaceFrom).replace(/\s+$/u, '')}${existing.slice(0, replaceFrom).trim() ? '\n\n' : ''}${block}${existing.slice(afterEnd).replace(/^\s*/u, '')}`,
        warning: 'dangling_end_marker_replaced',
      };
    }
  }

  const suffix = existing.trim() ? `${existing.replace(/\s+$/u, '')}\n\n${block}` : block;
  return { text: suffix, warning: null };
}

function lineStartIndex(text, index) {
  const previousNewline = text.lastIndexOf('\n', index);
  return previousNewline === -1 ? 0 : previousNewline + 1;
}

function listModuleCounts(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => ({
        name: item.name || item.module || item.id || item.key,
        count: item.count ?? item.files ?? item.nodes,
      }))
      .filter(item => item.name);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([name, count]) => ({ name, count }));
  }
  return [];
}

function keyCountEntries(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => ({
        name: item.name || item.kind || item.id || item.key,
        count: item.count ?? item.value,
      }))
      .filter(item => item.name);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([name, count]) => ({ name, count }));
  }
  return [];
}

function numberOrNull(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(value) : 'unknown';
}

function inline(value) {
  return `\`${String(value)}\``;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
