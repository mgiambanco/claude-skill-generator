#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function askMultiline(prompt) {
  return new Promise((resolve) => {
    console.log(prompt);
    console.log('  (Enter your text. Type "---" on its own line when done.)');
    const lines = [];
    const onLine = (line) => {
      if (line === '---') {
        rl.removeListener('line', onLine);
        resolve(lines.join('\n'));
      } else {
        lines.push(line);
      }
    };
    rl.on('line', onLine);
  });
}

function askList(prompt) {
  return new Promise(async (resolve) => {
    console.log(prompt);
    console.log('  (Enter one item per line. Empty line to finish.)');
    const items = [];
    const onLine = (line) => {
      if (line === '') {
        rl.removeListener('line', onLine);
        resolve(items);
      } else {
        items.push(line.trim());
      }
    };
    rl.on('line', onLine);
  });
}

function hr() {
  console.log('\n' + '─'.repeat(60) + '\n');
}

function section(title) {
  console.log(`\n\x1b[36m▶ ${title}\x1b[0m`);
}

function info(msg) {
  console.log(`\x1b[90m  ${msg}\x1b[0m`);
}

async function buildSkill() {
  console.log('\x1b[1m\x1b[35m');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║        Claude Skill Builder CLI          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('\x1b[0m');

  // --- Skill type ---
  section('Skill Type');
  info('model-invoked: Claude activates this automatically based on context');
  info('user-invoked:  User triggers this with a /slash-command');
  const skillTypeRaw = await ask('Skill type [model/user] (default: model): ');
  const isUserInvoked = skillTypeRaw.toLowerCase() === 'user';

  hr();

  // --- Frontmatter ---
  section('Basic Info');

  const name = await ask('Skill name (e.g. "my-skill", "code-reviewer"): ');
  if (!name) {
    console.error('Name is required.');
    rl.close();
    process.exit(1);
  }

  const version = await ask('Version (default: 1.0.0): ') || '1.0.0';
  const license = await ask('License (optional, e.g. "MIT"): ');

  hr();

  section('Description / Trigger');
  if (isUserInvoked) {
    info('Short description shown in /help');
  } else {
    info('This is the most important field — it tells Claude WHEN to invoke this skill.');
    info('Be specific: include trigger phrases, keywords, and topic areas.');
    info('Example: This skill should be used when the user asks to "review code", "check for bugs", or discusses code quality.');
  }
  const description = await askMultiline('Description:');

  hr();

  let argumentHint = '';
  let allowedTools = [];
  let model = '';

  if (isUserInvoked) {
    section('Command Options');
    argumentHint = await ask('Argument hint (e.g. "<file> [options]", optional): ');
    allowedTools = await askList('Allowed tools (e.g. Read, Grep, Bash — one per line, empty to finish):');
    info('Model options: haiku, sonnet, opus (leave blank for default)');
    model = await ask('Model override (optional): ');
    hr();
  }

  // --- Body sections ---
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

  // --- Extra sections ---
  const extraSections = [];
  let addMore = await ask('Add an extra section? [y/N]: ');
  while (addMore.toLowerCase() === 'y') {
    const sectionTitle = await ask('  Section title: ');
    const sectionBody = await askMultiline(`  Content for "${sectionTitle}":`);
    extraSections.push({ title: sectionTitle, body: sectionBody });
    addMore = await ask('Add another section? [y/N]: ');
  }

  hr();

  // --- Build frontmatter ---
  const frontmatterLines = ['---'];
  frontmatterLines.push(`name: ${name}`);
  frontmatterLines.push(`description: ${description.replace(/\n/g, ' ')}`);
  frontmatterLines.push(`version: ${version}`);
  if (license) frontmatterLines.push(`license: ${license}`);
  if (isUserInvoked) {
    if (argumentHint) frontmatterLines.push(`argument-hint: ${argumentHint}`);
    if (allowedTools.length > 0) frontmatterLines.push(`allowed-tools: [${allowedTools.join(', ')}]`);
    if (model) frontmatterLines.push(`model: ${model}`);
  }
  frontmatterLines.push('---');

  // --- Build body ---
  const titleCase = name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const bodyLines = [
    `# ${titleCase}`,
    '',
    '## Overview',
    '',
    overview,
    '',
    '## When This Skill Applies',
    '',
    whenToUse,
    '',
    '## Instructions',
    '',
    instructions,
  ];

  for (const { title, body } of extraSections) {
    bodyLines.push('', `## ${title}`, '', body);
  }

  const output = [...frontmatterLines, '', ...bodyLines, ''].join('\n');

  // --- Preview ---
  hr();
  console.log('\x1b[1m\x1b[32mGenerated SKILL.md:\x1b[0m\n');
  console.log('\x1b[90m' + '─'.repeat(60) + '\x1b[0m');
  console.log(output);
  console.log('\x1b[90m' + '─'.repeat(60) + '\x1b[0m');

  // --- Save ---
  hr();
  section('Save File');
  info('Tip: skills live at  <plugin>/skills/<skill-name>/SKILL.md');
  const defaultPath = path.join(process.cwd(), `${name}-SKILL.md`);
  const savePath = await ask(`Save path (default: ${defaultPath}): `) || defaultPath;

  const resolvedPath = path.resolve(savePath);
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, output, 'utf8');
  console.log(`\n\x1b[32m✓ Saved to: ${resolvedPath}\x1b[0m\n`);

  rl.close();
}

buildSkill().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
