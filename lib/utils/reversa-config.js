import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const STRING_ARRAY_RE = /^\s*([A-Za-z0-9_-]+)\s*=\s*\[\s*$/;

function readText(filePath) {
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function writeAtomic(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmpPath, content, 'utf8');
  renameSync(tmpPath, filePath);
}

function normalizeNewline(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function ensureFinalNewline(text, newline = '\n') {
  return text.endsWith('\n') ? text : `${text}${newline}`;
}

function findSectionBounds(text, sectionName) {
  const lines = text.split(/\r?\n/);
  const headerRe = new RegExp(`^\\s*\\[${escapeRegExp(sectionName)}\\]\\s*$`);
  let header = -1;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      header = i;
      break;
    }
  }

  if (header === -1) return null;

  for (let i = header + 1; i < lines.length; i++) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return { lines, header, start: header + 1, end };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTomlScalar(raw) {
  const value = stripInlineComment(raw).trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return undefined;
}

function stripInlineComment(raw) {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (ch === '#' && !inString) return raw.slice(0, i);
  }
  return raw;
}

function parseStringArray(lines, startIndex) {
  const values = [];
  let endIndex = startIndex;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === ']') {
      endIndex = i;
      break;
    }
    const match = trimmed.match(/^"((?:\\"|\\\\|[^"])*)",?\s*(?:#.*)?$/);
    if (match) {
      values.push(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
    }
  }

  return { values, endIndex };
}

function parseTomlSections(text) {
  const lines = text.split(/\r?\n/);
  const root = {};
  let section = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      section = header[1].trim();
      root[section] ??= {};
      continue;
    }

    if (!section) continue;

    const arrayHeader = line.match(STRING_ARRAY_RE);
    if (arrayHeader) {
      const parsed = parseStringArray(lines, i);
      root[section][arrayHeader[1]] = parsed.values;
      i = parsed.endIndex;
      continue;
    }

    const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) continue;

    const parsed = parseTomlScalar(kv[2]);
    if (parsed !== undefined) root[section][kv[1]] = parsed;
  }

  return root;
}

function mergeSections(base, override) {
  const merged = { ...base };
  for (const [section, values] of Object.entries(override)) {
    merged[section] = { ...(merged[section] ?? {}), ...values };
  }
  return merged;
}

function nestedFromSections(sections) {
  const root = {};
  for (const [sectionName, values] of Object.entries(sections)) {
    const parts = sectionName.split('.');
    let cursor = root;
    for (const part of parts.slice(0, -1)) {
      cursor[part] ??= {};
      cursor = cursor[part];
    }
    cursor[parts.at(-1)] = values;
  }
  return root;
}

function renderValue(value) {
  if (typeof value === 'string') return `"${escapeTomlString(value)}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Number.isInteger(value)) return String(value);
  throw new TypeError(`Unsupported TOML value type: ${typeof value}`);
}

function renderFlatSection(sectionName, values, newline) {
  const body = Object.entries(values)
    .map(([key, value]) => `${key} = ${renderValue(value)}`)
    .join(newline);
  return `[${sectionName}]${newline}${body}${newline}`;
}

function assertSupportedExistingBody(lines, bounds, sectionName) {
  for (let i = bounds.start; i < bounds.end; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^\[[^\]]+\]$/.test(trimmed)) break;
    if (!/^[A-Za-z0-9_-]+\s*=/.test(trimmed)) {
      throw new Error(`Unsupported TOML content in [${sectionName}]`);
    }
    const value = stripInlineComment(trimmed.split(/=(.*)/s)[1] ?? '').trim();
    if (value.startsWith('[') || value.startsWith('{') || value.includes('"""')) {
      throw new Error(`Unsupported TOML value in [${sectionName}]`);
    }
  }
}

function insertAfterSection(text, insertAfter, block, newline) {
  if (!insertAfter) return `${ensureFinalNewline(text, newline)}${newline}${block}`;

  const bounds = findSectionBounds(text, insertAfter);
  if (!bounds) return `${ensureFinalNewline(text, newline)}${newline}${block}`;

  const lines = bounds.lines;
  const before = lines.slice(0, bounds.end).join(newline).replace(/\s*$/, '');
  const after = lines.slice(bounds.end).join(newline).replace(/^\s*/, '');
  return after
    ? `${before}${newline}${newline}${block}${newline}${after}`
    : `${before}${newline}${newline}${block}`;
}

export function escapeTomlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function resolveOutputFolder(config) {
  return config?.output?.folder || config?.sections?.output?.folder || '_reversa_sdd';
}

export function readReversaConfig(projectRoot = process.cwd()) {
  const configPath = join(projectRoot, '.reversa', 'config.toml');
  const userConfigPath = join(projectRoot, '.reversa', 'config.user.toml');
  const baseSections = parseTomlSections(readText(configPath));
  const userSections = parseTomlSections(readText(userConfigPath));
  const sections = mergeSections(baseSections, userSections);
  const nested = nestedFromSections(sections);

  return {
    projectRoot,
    configPath,
    userConfigPath,
    sections,
    ...nested,
  };
}

export function upsertTomlSection(filePath, sectionName, values, options = {}) {
  const text = readText(filePath);
  const newline = normalizeNewline(text);
  const block = renderFlatSection(sectionName, values, newline).trimEnd();
  const bounds = findSectionBounds(text, sectionName);

  if (!text.trim()) {
    writeAtomic(filePath, `${block}${newline}`);
    return true;
  }

  if (!bounds) {
    const next = insertAfterSection(text, options.insertAfter, `${block}${newline}`, newline);
    writeAtomic(filePath, ensureFinalNewline(next.replace(/\s+$/u, ''), newline));
    return true;
  }

  assertSupportedExistingBody(bounds.lines, bounds, sectionName);

  const before = bounds.lines.slice(0, bounds.header).join(newline).replace(/\s*$/, '');
  const after = bounds.lines.slice(bounds.end).join(newline).replace(/^\s*/, '');
  const next = [
    before,
    block,
    after,
  ].filter(Boolean).join(`${newline}${newline}`);

  writeAtomic(filePath, ensureFinalNewline(next, newline));
  return true;
}

export function appendTomlStringArrayValue(filePath, sectionName, key, value) {
  const text = readText(filePath);
  const newline = normalizeNewline(text);
  const bounds = findSectionBounds(text, sectionName);

  if (!bounds) {
    const block = `[${sectionName}]${newline}${key} = [${newline}  "${escapeTomlString(value)}"${newline}]${newline}`;
    writeAtomic(filePath, `${ensureFinalNewline(text, newline)}${newline}${block}`);
    return true;
  }

  const lines = bounds.lines;
  for (let i = bounds.start; i < bounds.end; i++) {
    const trimmed = lines[i].trim();
    const inline = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\\[(.*)\\]\\s*$`));
    if (inline) {
      throw new Error(`Inline arrays are not supported for [${sectionName}].${key}`);
    }

    const arrayHeader = lines[i].match(STRING_ARRAY_RE);
    if (!arrayHeader || arrayHeader[1] !== key) continue;

    const parsed = parseStringArray(lines, i);
    if (parsed.values.includes(value)) return false;

    const insertLine = `  "${escapeTomlString(value)}",`;
    lines.splice(parsed.endIndex, 0, insertLine);
    writeAtomic(filePath, ensureFinalNewline(lines.join(newline), newline));
    return true;
  }

  lines.splice(bounds.end, 0, `${key} = [`, `  "${escapeTomlString(value)}",`, `]`);
  writeAtomic(filePath, ensureFinalNewline(lines.join(newline), newline));
  return true;
}

export function appendGitignoreEntries(projectRoot, entries) {
  const gitignorePath = join(projectRoot, '.gitignore');
  const existing = readText(gitignorePath);
  const newline = normalizeNewline(existing);
  const existingLines = new Set(existing.split(/\r?\n/).map(line => line.trim()));
  const missing = entries.filter(entry => !existingLines.has(entry));

  if (missing.length === 0) return false;

  const prefix = existing.trim() ? `${ensureFinalNewline(existing, newline)}${newline}` : '';
  const body = [
    existing.includes('# Reversa') ? null : '# Reversa',
    ...missing,
  ].filter(Boolean).join(newline);

  writeAtomic(gitignorePath, `${prefix}${body}${newline}`);
  return true;
}

