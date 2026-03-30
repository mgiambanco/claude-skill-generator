#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node skill-builder.js [--help] [--dry-run]

Interactive CLI for generating Claude Code SKILL.md files.

Options:
  --help, -h     Show this help message
  --dry-run      Print the generated SKILL.md without saving

Input conventions:
  Single-line prompts  Press Enter to confirm
  Multiline prompts    Type --- on its own line to finish
  List prompts         Press Enter on an empty line to finish
`);
  process.exit(0);
}

const DRY_RUN = process.argv.includes('--dry-run');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function exit(code = 0, msg = '') {
  if (msg) console.log(msg);
  rl.close();
  process.exit(code);
}

process.on('SIGINT', () => exit(0, '\n\nAborted.'));

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askMultiline(prompt) {
  return new Promise((resolve, reject) => {
    console.log(prompt);
    console.log('  (Enter your text. Type "---" on its own line when done.)');
    const lines = [];
    const onLine = (line) => {
      if (line === '---') {
        rl.removeListener('line', onLine);
        rl.removeListener('error', onError);
        resolve(lines.join('\n'));
      } else {
        lines.push(line);
      }
    };
    const onError = (err) => {
      rl.removeListener('line', onLine);
      rl.removeListener('error', onError);
      reject(err);
    };
    rl.on('line', onLine);
    rl.on('error', onError);
  });
}

function askList(prompt) {
  return new Promise((resolve, reject) => {
    console.log(prompt);
    console.log('  (Enter one item per line. Empty line to finish.)');
    const items = [];
    const onLine = (line) => {
      if (line === '') {
        rl.removeListener('line', onLine);
        rl.removeListener('error', onError);
        resolve(items);
      } else {
        items.push(line.trim());
      }
    };
    const onError = (err) => {
      rl.removeListener('line', onLine);
      rl.removeListener('error', onError);
      reject(err);
    };
    rl.on('line', onLine);
    rl.on('error', onError);
  });
}

// ---------------------------------------------------------------------------
// Validated field helpers (single source of truth for retry loops)
// ---------------------------------------------------------------------------

const VALID_MODELS = ['haiku', 'sonnet', 'opus'];

function validateName(raw) {
  if (!raw) return { error: 'Name is required.' };
  const normalized = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized)) {
    return { error: 'Name must be kebab-case (lowercase letters, numbers, hyphens only). e.g. "my-skill"' };
  }
  return { value: normalized };
}

async function askName(prompt) {
  while (true) {
    const raw = await ask(prompt);
    const result = validateName(raw);
    if (result.error) {
      console.error(`\x1b[31m  ✗ ${result.error}\x1b[0m`);
    } else {
      if (result.value !== raw.trim()) info(`Normalized to: ${result.value}`);
      return result.value;
    }
  }
}

async function askModel(prompt) {
  info(`Model options: ${VALID_MODELS.join(', ')} (leave blank for default)`);
  while (true) {
    const m = await ask(prompt);
    if (m === '' || VALID_MODELS.includes(m.toLowerCase())) return m.toLowerCase();
    console.error(`\x1b[31m  ✗ Invalid model "${m}". Choose from: ${VALID_MODELS.join(', ')}\x1b[0m`);
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function hr() { console.log('\n' + '─'.repeat(60) + '\n'); }
function section(title) { console.log(`\n\x1b[36m▶ ${title}\x1b[0m`); }
function info(msg) { console.log(`\x1b[90m  ${msg}\x1b[0m`); }

// ---------------------------------------------------------------------------
// YAML helpers
// ---------------------------------------------------------------------------

function yamlQuote(value) {
  if (/[:#\[\]{},|>&*!'"@`]/.test(value) || /^\s/.test(value) || /\s$/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Output builder
// ---------------------------------------------------------------------------

function toTitleCase(name) {
  return name.split(/[-_ ]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function buildOutput(data) {
  const {
    isUserInvoked, name, version, license,
    description, argumentHint, allowedTools, model,
    overview, whenToUse, instructions, extraSections,
  } = data;

  const frontmatterLines = ['---'];
  frontmatterLines.push(`name: ${name}`);
  frontmatterLines.push(`type: ${isUserInvoked ? 'user' : 'model'}`);
  frontmatterLines.push(`description: ${yamlQuote(description.replace(/\n/g, ' '))}`);
  frontmatterLines.push(`version: ${yamlQuote(version)}`);
  if (license) frontmatterLines.push(`license: ${yamlQuote(license)}`);
  if (isUserInvoked) {
    if (argumentHint) frontmatterLines.push(`argument-hint: ${yamlQuote(argumentHint)}`);
    if (allowedTools.length > 0) {
      frontmatterLines.push(`allowed-tools: [${allowedTools.map(yamlQuote).join(', ')}]`);
    }
    if (model) frontmatterLines.push(`model: ${model}`);
  }
  frontmatterLines.push('---');

  const bodyLines = [
    `# ${toTitleCase(name)}`,
    '',
    '## Overview', '', overview,
    '',
    '## When This Skill Applies', '', whenToUse,
    '',
    '## Instructions', '', instructions,
  ];

  for (const { title, body } of extraSections) {
    bodyLines.push('', `## ${title}`, '', body);
  }

  return [...frontmatterLines, '', ...bodyLines, ''].join('\n');
}

// ---------------------------------------------------------------------------
// Edit a single field in-place
// ---------------------------------------------------------------------------

const CORE_FIELDS = ['name', 'version', 'license', 'description', 'overview', 'whenToUse', 'instructions'];
const USER_FIELDS = ['argumentHint', 'allowedTools', 'model'];

async function editField(data) {
  const fields = [...CORE_FIELDS, ...(data.isUserInvoked ? USER_FIELDS : [])];
  const hasExtras = data.extraSections.length > 0;
  if (hasExtras) fields.push('extraSections');

  console.log('\nEditable fields: ' + fields.join(', '));
  const field = await ask('Field to edit: ');

  if (!fields.includes(field)) {
    console.error(`\x1b[31m  Unknown field: ${field}\x1b[0m`);
    return;
  }

  if (['description', 'overview', 'whenToUse', 'instructions'].includes(field)) {
    data[field] = await askMultiline(`New value for "${field}":`);
  } else if (field === 'name') {
    data.name = await askName('New name: ');
  } else if (field === 'model') {
    data.model = await askModel('Model override (optional): ');
  } else if (field === 'allowedTools') {
    data.allowedTools = await askList('Allowed tools (one per line, empty to finish):');
  } else if (field === 'extraSections') {
    if (data.extraSections.length === 0) {
      console.log('No extra sections to edit.');
      return;
    }
    data.extraSections.forEach((s, i) => console.log(`  ${i + 1}. ${s.title}`));
    const idxRaw = await ask('Section number to edit (or 0 to add a new one): ');
    const idx = parseInt(idxRaw, 10);
    if (idx === 0) {
      const title = await ask('  Section title: ');
      const body = await askMultiline(`  Content for "${title}":`);
      data.extraSections.push({ title, body });
    } else if (idx >= 1 && idx <= data.extraSections.length) {
      const s = data.extraSections[idx - 1];
      const choice = await ask(`  Edit [t]itle or [b]ody of "${s.title}"? `);
      if (choice.toLowerCase() === 't') s.title = await ask('  New title: ');
      else s.body = await askMultiline(`  New body for "${s.title}":`);
    } else {
      console.error('\x1b[31m  Invalid section number.\x1b[0m');
    }
  } else {
    data[field] = await ask(`New value for "${field}": `);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function buildSkill() {
  console.log('\x1b[1m\x1b[35m');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║        Claude Skill Builder CLI          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('\x1b[0m');
  if (DRY_RUN) info('Dry-run mode: file will not be saved.\n');

  section('Skill Type');
  info('model-invoked: Claude activates this automatically based on context');
  info('user-invoked:  User triggers this with a /slash-command');
  const skillTypeRaw = await ask('Skill type [model/user] (default: model): ');
  const isUserInvoked = skillTypeRaw.toLowerCase() === 'user';

  hr();
  section('Basic Info');
  const name = await askName('Skill name (e.g. "my-skill", "code-reviewer"): ');
  const version = await ask('Version (default: 1.0.0): ') || '1.0.0';
  const license = await ask('License (optional, e.g. "MIT"): ');

  hr();
  section('Description / Trigger');
  if (isUserInvoked) {
    info('Short description shown in /help');
  } else {
    info('This is the most important field — it tells Claude WHEN to invoke this skill.');
    info('Be specific: include trigger phrases, keywords, and topic areas.');
    info('Example: Use this skill when the user asks to "review code" or discusses code quality.');
  }
  const description = await askMultiline('Description:');

  let argumentHint = '';
  let allowedTools = [];
  let model = '';

  if (isUserInvoked) {
    hr();
    section('Command Options');
    argumentHint = await ask('Argument hint (e.g. "<file> [options]", optional): ');
    allowedTools = await askList('Allowed tools (e.g. Read, Grep, Bash — one per line, empty to finish):');
    model = await askModel('Model override (optional): ');
  }

  hr();
  section('Skill Body — Overview');
  info('What does this skill do? Give a short 1-3 sentence summary.');
  const overview = await askMultiline('Overview:');

  hr();
  section('Skill Body — When To Use');
  info('Describe the conditions / situations where this skill should be applied.');
  const whenToUse = await askMultiline('When to use:');

  hr();
  section('Skill Body — Instructions / Guidance');
  info('The main body: step-by-step instructions, rules, patterns, best practices.');
  info('You can use full markdown here (headings, bullets, code blocks, etc.).');
  const instructions = await askMultiline('Instructions:');

  hr();
  const extraSections = [];
  let addMore = await ask('Add an extra section? [y/N]: ');
  while (addMore.toLowerCase() === 'y') {
    const title = await ask('  Section title: ');
    const body = await askMultiline(`  Content for "${title}":`);
    extraSections.push({ title, body });
    addMore = await ask('Add another section? [y/N]: ');
  }

  const data = {
    isUserInvoked, name, version, license,
    description, argumentHint, allowedTools, model,
    overview, whenToUse, instructions, extraSections,
  };

  // Preview / edit loop
  while (true) {
    hr();
    const output = buildOutput(data);
    console.log('\x1b[1m\x1b[32mGenerated SKILL.md:\x1b[0m\n');
    console.log('\x1b[90m' + '─'.repeat(60) + '\x1b[0m');
    console.log(output);
    console.log('\x1b[90m' + '─'.repeat(60) + '\x1b[0m');
    hr();

    const action = await ask('Action — [s]ave / [e]dit a field / [q]uit: ');

    if (action.toLowerCase() === 'q') exit(0, 'Aborted.');

    if (action.toLowerCase() === 'e') {
      await editField(data);
      continue;
    }

    // Save
    if (DRY_RUN) exit(0, '\n\x1b[33m[Dry-run] File not saved.\x1b[0m\n');

    section('Save File');
    info('Tip: skills live at  <plugin>/skills/<skill-name>/SKILL.md');
    const defaultPath = path.join(process.cwd(), `${data.name}-SKILL.md`);
    const savePath = await ask(`Save path (default: ${defaultPath}): `) || defaultPath;
    const resolvedPath = path.resolve(savePath);

    if (fs.existsSync(resolvedPath)) {
      const overwrite = await ask(`\x1b[33m  File already exists. Overwrite? [y/N]: \x1b[0m`);
      if (overwrite.toLowerCase() !== 'y') {
        info('Not overwritten. Choose a different path or edit the name.');
        continue;
      }
    }

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, output, 'utf8');
    console.log(`\n\x1b[32m✓ Saved to: ${resolvedPath}\x1b[0m\n`);
    break;
  }

  exit(0);
}

buildSkill().catch((err) => {
  console.error(err);
  exit(1);
});
