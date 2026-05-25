import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  AdapterError,
  collectSnapshot,
  detectProfile,
  probe as probeAdapter,
  renderInventorySection,
  validateSnapshotMeta,
} from '../integrations/cs-agent.js';
import {
  appendGitignoreEntries,
  readReversaConfig,
  resolveOutputFolder,
} from '../utils/reversa-config.js';

const ACTIONS = new Set(['probe', 'detect', 'snapshot', 'inventory', 'doctor']);
const DEFAULT_INVENTORY_FILE = 'inventory.md';

export default async function contentServer(args) {
  const parsed = parseArgs(args);

  if (!parsed.action || parsed.flags.help || parsed.flags.h) {
    printHelp(parsed.action);
    return;
  }

  if (!ACTIONS.has(parsed.action)) {
    const err = new AdapterError(
      'unknown_action',
      `Unknown content-server action: ${parsed.action}`,
    );
    const envelope = errorEnvelope(parsed.action, err);
    printEnvelope(envelope, parsed.flags);
    process.exitCode = exitCodeFor(err);
    return;
  }

  try {
    const envelope = await runAction(parsed.action, parsed.flags);
    printEnvelope(envelope, parsed.flags);
    process.exitCode = 0;
  } catch (err) {
    const envelope = errorEnvelope(parsed.action, err);
    printEnvelope(envelope, parsed.flags);
    process.exitCode = exitCodeFor(err);
  }
}

export async function probe(flags = {}) {
  const context = loadContext(flags);
  const data = await probeAdapter({
    executablePath: flags.executable || context.csAgent.executable || undefined,
    projectRoot: context.projectRoot,
    timeoutMs: intFlag(flags.timeout),
  });
  return { ok: true, action: 'probe', data };
}

export async function detect(flags = {}) {
  const context = loadContext(flags);
  const executablePath = flags.executable || context.csAgent.executable || undefined;
  const probeData = await probeAdapter({
    executablePath,
    projectRoot: context.projectRoot,
    timeoutMs: intFlag(flags.timeout),
  });
  const detectData = await detectProfile({
    executablePath: probeData.executable,
    projectRoot: context.projectRoot,
    timeoutMs: intFlag(flags.timeout),
  });

  return {
    ok: true,
    action: 'detect',
    data: {
      ...detectData,
      executableTrust: probeData.executableTrust,
      hint: probeData.hint,
    },
  };
}

export async function snapshot(flags = {}) {
  const context = loadContext(flags);
  ensureEnabledOrExplicit(context, flags, 'snapshot');
  const profile = resolveProfile(context, flags);
  if (!profile) {
    throw new AdapterError('profile_required', 'Set integrations.cs_agent.profile or pass --profile');
  }

  const result = await collectSnapshot({
    projectRoot: context.projectRoot,
    executablePath: flags.executable || context.csAgent.executable || undefined,
    profile,
    outDir: resolveSnapshotDir(context, flags),
    snapshotTtlDays: intFlag(flags.ttl_days),
    timeoutMs: intFlag(flags.timeout),
  });
  if (context.csAgent.enabled === true) {
    appendGitignoreEntries(context.projectRoot, ['.reversa/context/cs-agent/']);
  }

  return {
    ok: true,
    action: 'snapshot',
    data: result,
  };
}

export async function inventory(flags = {}) {
  const context = loadContext(flags);
  if (flags.write && flags.print) {
    throw new AdapterError('invalid_flag_combination', '--write and --print are mutually exclusive');
  }
  ensureEnabledOrExplicit(context, flags, 'inventory');
  const snapshotDir = resolveSnapshotDir(context, flags);
  const inventoryPath = resolveInventoryPath(context, flags);
  const driftProbe = await probeForDrift(context, flags);
  const result = renderInventorySection({
    snapshotDir,
    inventoryPath: flags.print ? undefined : inventoryPath,
    ttlHours: resolveTtlHours(context, flags),
    executablePath: driftProbe?.executable,
    currentHelpSignatureSha256: driftProbe?.executableTrust?.help_signature_sha256,
  });

  return {
    ok: true,
    action: 'inventory',
    data: {
      ...result,
      inventoryPath: flags.print ? null : inventoryPath,
    },
  };
}

export async function doctor(flags = {}) {
  const context = loadContext(flags);
  ensureEnabledOrExplicit(context, flags, 'doctor');
  const profile = resolveProfile(context, flags);
  if (!profile) {
    throw new AdapterError('profile_required', 'Set integrations.cs_agent.profile or pass --profile');
  }

  const snapshotDir = resolveSnapshotDir(context, flags);
  const before = readGraphIfValid(snapshotDir);
  const snap = await collectSnapshot({
    projectRoot: context.projectRoot,
    executablePath: flags.executable || context.csAgent.executable || undefined,
    profile,
    outDir: snapshotDir,
    timeoutMs: intFlag(flags.timeout),
  });
  const validation = validateSnapshotMeta(snapshotDir, {
    ttlHours: resolveTtlHours(context, flags),
  });
  const after = readGraphIfValid(snapshotDir);

  return {
    ok: true,
    action: 'doctor',
    data: {
      snapshot: snap,
      validation,
      deltas: diffGraphs(before, after),
    },
  };
}

async function runAction(action, flags) {
  switch (action) {
    case 'probe':
      return probe(flags);
    case 'detect':
      return detect(flags);
    case 'snapshot':
      return snapshot(flags);
    case 'inventory':
      return inventory(flags);
    case 'doctor':
      return doctor(flags);
    default:
      throw new AdapterError('unknown_action', `Unknown content-server action: ${action}`);
  }
}

function parseArgs(args = []) {
  const flags = {};
  let action = null;
  const rest = [...args];
  if (rest[0] && !rest[0].startsWith('-')) action = rest.shift();

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const withoutPrefix = arg.slice(2);
    const eq = withoutPrefix.indexOf('=');
    if (eq !== -1) {
      flags[toKey(withoutPrefix.slice(0, eq))] = withoutPrefix.slice(eq + 1);
      continue;
    }

    const key = toKey(withoutPrefix);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }

  return { action, flags };
}

function toKey(value) {
  return value.replace(/-/g, '_');
}

function loadContext(flags) {
  const projectRoot = resolve(flags.project || process.cwd());
  const config = readReversaConfig(projectRoot);
  return {
    projectRoot,
    config,
    csAgent: config.integrations?.cs_agent || {},
  };
}

function ensureEnabledOrExplicit(context, flags, action) {
  if (context.csAgent.enabled === true) return;
  if (action === 'snapshot' && flags.executable && flags.profile && flags.out_dir) return;
  if (action === 'inventory' && flags.snapshot_dir && (flags.inventory_path || flags.print)) return;
  if (flags.allow_disabled) {
    if (action === 'snapshot' && flags.out_dir) return;
    if (action === 'inventory' && flags.snapshot_dir && (flags.inventory_path || flags.print)) return;
    if (action === 'doctor' && flags.snapshot_dir) return;
  }

  throw new AdapterError(
    'cs_agent_not_enabled',
    'Enable integrations.cs_agent.enabled or pass explicit test-mode flags',
  );
}

function resolveProfile(context, flags) {
  return flags.profile || context.csAgent.profile || null;
}

function resolveSnapshotDir(context, flags) {
  return resolve(
    context.projectRoot,
    flags.snapshot_dir
      || flags.out_dir
      || context.csAgent.context_dir
      || join('.reversa', 'context', 'cs-agent'),
  );
}

function resolveInventoryPath(context, flags) {
  return resolve(
    context.projectRoot,
    flags.inventory_path
      || context.csAgent.inventory_path
      || join(resolveOutputFolder(context.config), DEFAULT_INVENTORY_FILE),
  );
}

async function probeForDrift(context, flags) {
  const executablePath = flags.executable || context.csAgent.executable || undefined;
  if (!executablePath) return null;
  try {
    return await probeAdapter({
      executablePath,
      projectRoot: context.projectRoot,
      timeoutMs: intFlag(flags.timeout),
      force: true,
    });
  } catch {
    return null;
  }
}

function resolveTtlHours(context, flags) {
  const explicitDays = intFlag(flags.ttl_days);
  if (explicitDays) return explicitDays * 24;
  const explicit = intFlag(flags.ttl);
  if (explicit) return explicit;
  if (Number.isInteger(context.csAgent.snapshot_ttl_days)) {
    return context.csAgent.snapshot_ttl_days * 24;
  }
  return context.csAgent.snapshot_ttl_hours;
}

function intFlag(value) {
  if (value == null || value === true) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readGraphIfValid(snapshotDir) {
  const graphPath = join(snapshotDir, 'graph-status.json');
  if (!existsSync(graphPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(graphPath, 'utf8'));
    return raw.status || raw;
  } catch {
    return null;
  }
}

function diffGraphs(before, after) {
  if (!before || !after) return null;
  const keys = ['sourceFileCount', 'source_files', 'fileCount', 'nodeCount', 'nodes', 'edgeCount', 'edges'];
  const deltas = {};
  for (const key of keys) {
    if (Number.isFinite(before[key]) && Number.isFinite(after[key])) {
      deltas[key] = after[key] - before[key];
    }
  }
  return Object.keys(deltas).length > 0 ? deltas : null;
}

function errorEnvelope(action, err) {
  return {
    ok: false,
    action,
    error: {
      code: err.code || 'unknown_error',
      message: err.message || String(err),
      details: err.details || {},
    },
  };
}

function exitCodeFor(err) {
  switch (err.code) {
    case 'executable_not_found':
      return 2;
    case 'profile_required':
    case 'cs_agent_not_enabled':
      return 3;
    case 'snapshot_partial':
      return 4;
    case 'inventory_render_blocked':
      return 5;
    default:
      return 3;
  }
}

function printEnvelope(envelope, flags = {}) {
  if (flags.json) {
    console.log(JSON.stringify(envelope));
    return;
  }

  if (!envelope.ok) {
    console.error(`content-server ${envelope.action}: ${envelope.error.code}: ${envelope.error.message}`);
    return;
  }

  if (flags.quiet) return;

  switch (envelope.action) {
    case 'probe':
      console.log(`cs-agent: ${envelope.data.executable}`);
      console.log(`source: ${envelope.data.source}`);
      console.log(`commands: ${envelope.data.commandCount}`);
      if (envelope.data.hint) console.log(`hint: ${envelope.data.hint}`);
      break;
    case 'detect':
      console.log(`active profile: ${envelope.data.active || 'none'}`);
      for (const profile of envelope.data.profiles || []) {
        console.log(`profile: ${profile.name}`);
      }
      if ((envelope.data.profiles || []).length > 1) {
        console.log('Multiple profiles detected. Use --profile <name> on snapshot/doctor or persist the chosen profile in config.toml.');
      }
      break;
    case 'snapshot':
      console.log(`snapshot: ${envelope.data.snapshotDir}`);
      break;
    case 'inventory':
      if (envelope.data.inventoryPath) {
        console.log(`inventory: ${envelope.data.inventoryPath}`);
      } else {
        console.log(envelope.data.block);
      }
      if (envelope.data.warning) console.log(`warning: ${envelope.data.warning}`);
      break;
    case 'doctor':
      console.log(`snapshot: ${envelope.data.snapshot.snapshotDir}`);
      console.log(`valid: ${envelope.data.validation.ok}`);
      if (envelope.data.validation.stale) console.log('stale: true');
      if (envelope.data.validation.executableDrift) console.log('executable drift: true');
      break;
    default:
      console.log(JSON.stringify(envelope.data, null, 2));
  }
}

function printHelp(action) {
  if (ACTIONS.has(action)) {
    printActionHelp(action);
    return;
  }

  console.log(`
  Usage: reversa content-server <action> [options]

  Actions:
    probe       Probe the cs-agent executable and JSON help tree
    detect      List Content Server profiles without choosing automatically
    snapshot    Collect profile info, graph status, and docs categories
    inventory   Render or update the Content Server inventory block
    doctor      Recollect a snapshot and compare basic counts

  Common options:
    --json                       Emit exactly one JSON envelope
    --quiet                      Suppress successful human output
    --project <path>             Reversa project root

  Run "reversa content-server <action> --help" for action-specific options.
  `);
}

function printActionHelp(action) {
  const common = [
    '    --json                       Emit exactly one JSON envelope',
    '    --quiet                      Suppress successful human output',
    '    --project <path>             Reversa project root',
  ];
  const help = {
    probe: [
      'Usage: reversa content-server probe [options]',
      '',
      'Probe the cs-agent executable and JSON help tree.',
      '',
      'Options:',
      '    --executable <path>          Path to cs-agent/cs-agent.exe',
      ...common,
    ],
    detect: [
      'Usage: reversa content-server detect [options]',
      '',
      'List Content Server profiles without choosing automatically.',
      '',
      'Options:',
      '    --executable <path>          Path to cs-agent/cs-agent.exe',
      ...common,
    ],
    snapshot: [
      'Usage: reversa content-server snapshot [options]',
      '',
      'Collect profile info, graph status, and docs categories.',
      '',
      'Options:',
      '    --profile <name>             cs-agent profile to use',
      '    --executable <path>          Path to cs-agent/cs-agent.exe',
      '    --out-dir <path>             Snapshot output directory',
      '    --ttl-days <int>             Freshness window written to _meta.json',
      '    --timeout <ms>               Command timeout in milliseconds',
      '    --allow-disabled             Permit explicit test-mode run without enabled=true',
      ...common,
    ],
    inventory: [
      'Usage: reversa content-server inventory [options]',
      '',
      'Render or update the Content Server inventory block.',
      '',
      'Options:',
      '    --snapshot-dir <path>        Snapshot directory',
      '    --inventory-path <path>      Target inventory Markdown path',
      '    --write                      Write inventory block (default)',
      '    --print                      Print inventory block without writing',
      '    --ttl-days <int>             Freshness window in days',
      '    --ttl <hours>                Freshness window in hours',
      '    --allow-disabled             Permit explicit test-mode run without enabled=true',
      ...common,
    ],
    doctor: [
      'Usage: reversa content-server doctor [options]',
      '',
      'Recollect a snapshot and compare basic counts against the previous snapshot.',
      '',
      'Options:',
      '    --profile <name>             cs-agent profile to use',
      '    --executable <path>          Path to cs-agent/cs-agent.exe',
      '    --snapshot-dir <path>        Snapshot directory',
      '    --ttl-days <int>             Freshness window in days',
      '    --ttl <hours>                Freshness window in hours',
      '    --timeout <ms>               Command timeout in milliseconds',
      '    --allow-disabled             Permit doctor without enabled=true',
      ...common,
    ],
  };

  console.log(`
${help[action].join('\n')}
  `);
}
