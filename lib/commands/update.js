import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { loadManifest, saveManifest, buildManifest, fileStatus } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { ENGINES } from '../installer/detector.js';
import { applyOrangeTheme, ORANGE_PREFIX } from '../installer/orange-prompts.js';
import { readJsonSafe } from '../utils/json-safe.js';
import { appendTomlStringArrayValue, readReversaConfig, upsertTomlSection } from '../utils/reversa-config.js';

async function fetchLatestVersion(packageName) {
  try {
    const registryName = encodeURIComponent(packageName);
    const res = await fetch(`https://registry.npmjs.org/${registryName}/latest`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

const PACKAGE_NAME = '@pnocera/reversa';
const NPX_COMMAND = `npx ${PACKAGE_NAME}`;
const CONTENT_SERVER_AGENT_ID = 'reversa-content-server';

export default async function update(args) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');
  const { default: semver } = await import('semver');

  const projectRoot = resolve(process.cwd());

  console.log(chalk.bold('\n  Reversa: Update\n'));

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow('  Reversa is not installed in this directory.'));
    console.log('  Run ' + chalk.bold(`${NPX_COMMAND} install`) + ' to install.\n');
    return;
  }

  const installedVersion = existing.version;

  // Validate installed version before comparing
  if (!semver.valid(installedVersion)) {
    console.log(chalk.yellow(`  Invalid installed version: "${installedVersion}". Run ${NPX_COMMAND} install to fix it.\n`));
    return;
  }

  const state = existing.state;
  let installedAgents = state.agents ?? [];
  const installedEngineIds = state.engines ?? [];
  const installedEngines = ENGINES.filter(e => installedEngineIds.includes(e.id));
  const reversaConfig = readReversaConfig(projectRoot);
  const configAgents = reversaConfig.sections?.agents?.installed ?? [];
  const hasDiscoveryCore = installedAgents.includes('reversa') && installedAgents.includes('reversa-scout');
  const csAgentSectionMissing = !reversaConfig.sections?.['integrations.cs_agent'];
  const needsContentServerState = hasDiscoveryCore && !installedAgents.includes(CONTENT_SERVER_AGENT_ID);
  const needsContentServerConfig = hasDiscoveryCore && !configAgents.includes(CONTENT_SERVER_AGENT_ID);
  const needsDismissalStateMigration = typeof state.cs_agent_enablement_dismissed === 'boolean';
  const contentServerMigrationNeeded = needsContentServerState
    || needsContentServerConfig
    || csAgentSectionMissing
    || needsDismissalStateMigration;

  // Check version on npm
  const spinner = ora({ text: 'Checking for latest version...', color: 'cyan' }).start();
  const latestVersion = await fetchLatestVersion(PACKAGE_NAME);
  spinner.stop();

  if (latestVersion && semver.valid(latestVersion)) {
    if (!semver.lt(installedVersion, latestVersion)) {
      console.log(chalk.hex('#ffa203')(`  You are already on the latest version (v${installedVersion}).`));
      if (!contentServerMigrationNeeded) {
        console.log('');
        return;
      }
      console.log(chalk.gray('  Continuing to apply installation migrations.\n'));
    } else {
      console.log(`  Installed version:  ${chalk.yellow('v' + installedVersion)}`);
      console.log(`  Available version:  ${chalk.hex('#ffa203')('v' + latestVersion)}\n`);
    }
  } else {
    console.log(chalk.gray(`  Installed version: v${installedVersion}`));
    console.log(chalk.gray('  Could not check version on npm. Continuing offline.\n'));
  }

  // Carregar manifest e classificar arquivos
  const manifest = loadManifest(projectRoot);

  const modified = [];
  const intact = [];
  const missing = [];

  for (const [relPath, hash] of Object.entries(manifest)) {
    const status = fileStatus(projectRoot, relPath, hash);
    if (status === 'modified') modified.push(relPath);
    else if (status === 'missing') missing.push(relPath);
    else intact.push(relPath);
  }

  if (modified.length > 0) {
    console.log(chalk.yellow(`  ${modified.length} file(s) modified by you, will be kept:`));
    modified.forEach(f => console.log(chalk.gray(`    ✎  ${f}`)));
    console.log('');
  }
  if (missing.length > 0) {
    console.log(chalk.cyan(`  ${missing.length} missing file(s), will be restored:`));
    missing.forEach(f => console.log(chalk.gray(`    +  ${f}`)));
    console.log('');
  }

  const toUpdate = intact.length + missing.length;
  console.log(`  ${toUpdate} file(s) will be updated.`);
  if (needsContentServerState || needsContentServerConfig) {
    console.log(chalk.cyan(`  ${CONTENT_SERVER_AGENT_ID} will be added to this discovery installation.`));
  }
  if (csAgentSectionMissing) {
    console.log(chalk.cyan('  Content Server configuration defaults will be added.'));
  }
  if (needsDismissalStateMigration) {
    console.log(chalk.cyan('  Content Server dismissal state will be migrated.'));
  }
  if (toUpdate === 0 && !latestVersion && !contentServerMigrationNeeded) {
    console.log(chalk.gray('  No files to update.\n'));
    return;
  }

  const { default: inquirer } = await import('inquirer');
  applyOrangeTheme();
  const { confirm } = await inquirer.prompt([{
    prefix: ORANGE_PREFIX,
    type: 'confirm',
    name: 'confirm',
    message: '\nConfirm update?',
    default: true,
  }]);
  if (!confirm) {
    console.log(chalk.gray('\n  Update cancelled.\n'));
    return;
  }

  const writer = new Writer(projectRoot);
  const updateSpinner = ora({ text: 'Updating agents...', color: 'cyan' }).start();

  try {
    if (contentServerMigrationNeeded) {
      if (csAgentSectionMissing) {
        upsertTomlSection(join(projectRoot, '.reversa', 'config.toml'), 'integrations.cs_agent', {
          enabled: false,
          profile: '',
          executable: '',
          context_dir: '.reversa/context/cs-agent',
          inventory_path: '',
          snapshot_ttl_days: 7,
        }, { insertAfter: 'analysis' });
      }
      if (needsContentServerState) {
        installedAgents = [...installedAgents, CONTENT_SERVER_AGENT_ID];
        state.agents = installedAgents;
        writeFileSync(join(projectRoot, '.reversa', 'state.json'), JSON.stringify(state, null, 2), 'utf8');
      }
      if (needsContentServerConfig) {
        appendTomlStringArrayValue(
          join(projectRoot, '.reversa', 'config.toml'),
          'agents',
          'installed',
          CONTENT_SERVER_AGENT_ID,
        );
      }
      if (needsDismissalStateMigration) {
        state.cs_agent_enablement_dismissed = null;
        writeFileSync(join(projectRoot, '.reversa', 'state.json'), JSON.stringify(state, null, 2), 'utf8');
      }
    }

    // Reinstalar skills (intactos + ausentes; pular modificados)
    for (const agent of installedAgents) {
      for (const engine of installedEngines) {
        const relDir = join(engine.skillsDir, agent).replace(/\\/g, '/');
        const isModified = modified.some(f => f.replace(/\\/g, '/').startsWith(relDir));
        if (!isModified) {
          const { rmSync } = await import('fs');
          const dest = join(projectRoot, engine.skillsDir, agent);
          if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
          await writer.installSkill(agent, engine.skillsDir);
        }

        if (engine.universalSkillsDir && engine.universalSkillsDir !== engine.skillsDir) {
          const uRelDir = join(engine.universalSkillsDir, agent).replace(/\\/g, '/');
          const uIsModified = modified.some(f => f.replace(/\\/g, '/').startsWith(uRelDir));
          if (!uIsModified) {
            const { rmSync } = await import('fs');
            const uDest = join(projectRoot, engine.universalSkillsDir, agent);
            if (existsSync(uDest)) rmSync(uDest, { recursive: true, force: true });
            await writer.installSkill(agent, engine.universalSkillsDir);
          }
        }
      }
    }

    updateSpinner.text = 'Refreshing forward assets...';

    // Refrescar body templates, scripts e hooks.yml respeitando modificações do usuário
    const modifiedSet = new Set(modified.map(f => f.replace(/\\/g, '/')));
    writer.refreshForwardAssets(modifiedSet);

    updateSpinner.text = 'Updating entry files...';

    // Atualizar entry files intactos ou ausentes
    for (const engine of installedEngines) {
      const relEntry = engine.entryFile;
      const hash = manifest[relEntry];
      if (!hash) continue; // não foi instalado pelo Reversa — não tocar
      const status = fileStatus(projectRoot, relEntry, hash);
      if (status === 'intact' || status === 'missing') {
        await writer.installEntryFile(engine, { force: true });
      }
    }

    updateSpinner.text = 'Updating version...';

    if (latestVersion && semver.valid(latestVersion)) {
      writeFileSync(join(projectRoot, '.reversa', 'version'), latestVersion, 'utf8');
      const statePath = join(projectRoot, '.reversa', 'state.json');
      const s = readJsonSafe(statePath);
      s.version = latestVersion;
      writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');
    }

    updateSpinner.text = 'Updating manifest...';

    writer.saveCreatedFiles();
    const newManifest = buildManifest(projectRoot, writer.manifestPaths);
    // Mesclar com manifest existente (preservar entradas de arquivos não tocados)
    const intactEntries = Object.fromEntries(
      intact.map(r => [r, manifest[r]])
    );
    saveManifest(projectRoot, { ...intactEntries, ...newManifest });

    updateSpinner.succeed(chalk.hex('#ffa203')('Update complete!'));
  } catch (err) {
    updateSpinner.fail(chalk.red('Error during update.'));
    throw err;
  }

  if (modified.length > 0) {
    console.log(chalk.yellow(`\n  ${modified.length} file(s) kept (modified by you).`));
  }
  console.log('');
}
