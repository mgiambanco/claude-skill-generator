# Claude Skill Builder CLI

A cross-platform interactive CLI for generating Claude Code skill files in the correct `SKILL.md` format. No dependencies — runs on any machine with Node.js.

## Requirements

- Node.js v14 or later

## Usage

```bash
node skill-builder.js [--help] [--dry-run]
```

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Print usage and exit |
| `--dry-run` | Preview the generated file without saving it |

---

## Skill Types

When the tool starts it asks you to choose one of two skill types:

| Type | Keyword | How it activates |
|------|---------|-----------------|
| Model-invoked | `model` | Claude reads the description and decides when to apply the skill automatically |
| User-invoked | `user` | The user types a `/slash-command` to trigger it |

---

## Prompts — Step by Step

### 1. Skill Type

```
Skill type [model/user] (default: model):
```

Press Enter to accept the default (`model`), or type `user` for a slash-command skill.

---

### 2. Basic Info

```
Skill name (e.g. "my-skill", "code-reviewer"):
Version (default: 1.0.0):
License (optional, e.g. "MIT"):
```

- **Name** is required. Must be kebab-case (`my-skill`). Underscores and spaces are automatically normalized to hyphens; invalid characters produce a re-prompt.
- **Version** defaults to `1.0.0` if left blank.
- **License** is optional and omitted from the file if left blank.

---

### 3. Description / Trigger

This is a **multiline** field. Type your text across as many lines as needed, then type `---` on its own line to finish.

**For model-invoked skills** this is the most critical field — it tells Claude when to automatically invoke the skill. Be explicit:

```
This skill should be used when the user asks to "review code",
"check for bugs", mentions "code quality", or discusses pull request reviews.
---
```

**For user-invoked skills** this is the short description shown in `/help`.

---

### 4. Command Options *(user-invoked skills only)*

```
Argument hint (e.g. "<file> [options]", optional):
Allowed tools (one per line, empty line to finish):
Model override (optional):
```

- **Argument hint** — shown to the user as a usage hint, e.g. `<path> [--verbose]`
- **Allowed tools** — pre-approved tools that skip the permission prompt. Enter one per line (`Read`, `Grep`, `Bash`, …). Empty line to stop.
- **Model override** — force a specific model: `haiku`, `sonnet`, or `opus`. Any other value triggers a re-prompt.

---

### 5. Overview

Multiline. A 1–3 sentence summary of what the skill does.

```
This skill helps Claude produce consistent code review feedback
by applying a structured checklist of quality, security, and style criteria.
---
```

---

### 6. When This Skill Applies

Multiline. Describe the specific conditions or contexts where the skill should be used.

```
- The user asks for a code review or feedback on a PR
- The user shares a diff or file and asks what could be improved
- The user mentions readability, security, or performance concerns
---
```

---

### 7. Instructions / Guidance

Multiline. The main body of the skill. Full markdown is supported — use headings, bullet lists, numbered steps, and code blocks freely.

```
1. Read through the entire file or diff before commenting.
2. Check for security issues first (injection, auth, secrets in code).
3. Then check logic correctness, then style.

### Output Format

Provide feedback as a markdown list grouped by severity:
- **Critical** — must fix before merge
- **Suggestion** — optional improvement
---
```

---

### 8. Extra Sections *(optional)*

After the three required body sections, the tool asks:

```
Add an extra section? [y/N]:
```

Type `y` to add a custom `## Heading` section. You can add as many as you like. Each one prompts for a title and a multiline body.

---

### 9. Preview & Edit

Before saving, the full generated `SKILL.md` is printed to the terminal. You are then prompted:

```
Action — [s]ave / [e]dit a field / [q]uit:
```

- **s** — proceed to save
- **e** — pick any field by name and re-enter it, then re-preview
- **q** — abort without saving

This lets you fix typos or revise content without starting over.

---

### 10. Save Path

```
Save path (default: <cwd>/<name>-SKILL.md):
```

Press Enter to accept the default, or type any absolute or relative path. Missing directories are created automatically.

The conventional location for skills inside a Claude Code plugin is:

```
<plugin-root>/
└── skills/
    └── <skill-name>/
        └── SKILL.md
```

So for a plugin at `~/.claude/plugins/my-plugin`, you would enter:

```
~/.claude/plugins/my-plugin/skills/my-skill/SKILL.md
```

---

## Generated File Format

The output follows the canonical Claude Code SKILL.md spec:

```markdown
---
name: skill-name
type: model
description: When to invoke this skill (single line, YAML-quoted if needed)
version: 1.0.0
license: MIT
# user-invoked only:
argument-hint: <arg> [optional]
allowed-tools: [Read, Grep, Bash]
model: sonnet
---

# Skill Name

## Overview

...

## When This Skill Applies

...

## Instructions

...

## Extra Section (if any)

...
```

### Frontmatter fields

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | Kebab-case; matches the skill directory name |
| `type` | Yes | `model` or `user` |
| `description` | Yes | Trigger condition for model skills; `/help` text for user skills |
| `version` | No | Semantic version, defaults to `1.0.0` |
| `license` | No | Omitted if blank |
| `argument-hint` | No | User-invoked only |
| `allowed-tools` | No | User-invoked only; reduces permission prompts |
| `model` | No | User-invoked only; `haiku`, `sonnet`, or `opus` |

---

## Input Conventions

| Prompt type | How to finish |
|-------------|--------------|
| Single-line | Press **Enter** |
| Multiline | Type `---` on its own line and press **Enter** |
| List (tools) | Press **Enter** on an empty line |

Press **Ctrl+C** at any time to abort cleanly.

---

## Example Session

```
╔══════════════════════════════════════════╗
║        Claude Skill Builder CLI          ║
╚══════════════════════════════════════════╝

▶ Skill Type
  model-invoked: Claude activates this automatically based on context
  user-invoked:  User triggers this with a /slash-command
Skill type [model/user] (default: model): model

▶ Basic Info
Skill name: code-reviewer
Version (default: 1.0.0):
License (optional):

▶ Description / Trigger
Description:
  (Enter your text. Type "---" on its own line when done.)
This skill should be used when the user asks to "review code", "check my PR",
or discusses code quality, bugs, or readability.
---

▶ Skill Body — Overview
Overview:
  (Enter your text. Type "---" on its own line when done.)
Provides structured code review feedback covering security, correctness, and style.
---

...

Generated SKILL.md:
────────────────────────────────────────────────────────────
...
────────────────────────────────────────────────────────────

Action — [s]ave / [e]dit a field / [q]uit: s

▶ Save File
Save path (default: /home/user/code-reviewer-SKILL.md):
~/.claude/plugins/my-plugin/skills/code-reviewer/SKILL.md

✓ Saved to: /home/user/.claude/plugins/my-plugin/skills/code-reviewer/SKILL.md
```
