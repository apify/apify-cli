---
title: Agent Skill
description: Learn about the available Agent Skill for the Apify CLI.
---

An Agent Skill is a Markdown file that contains guidance for coding agents. The Apify CLI ships its own skill that your agent can use when a task involves the CLI.

## View the skill

To view the skill, run:

```bash
apify help --skill
```

The output prints the contents of a `SKILL.md` file that matches your installed version of the Apify CLI.

## Install the skill

To have the skill installed persistently, redirect the output of `apify help --skill` into your agent's skills directory. The location depends on the agent type.

Note that this approach creates a snapshot of the skill. Re-install the skill each time you upgrade the Apify CLI.

### Claude Code

For Claude Code, use:

```bash
mkdir -p ~/.claude/skills/apify-cli
apify help --skill > ~/.claude/skills/apify-cli/SKILL.md
```

### Codex and other agents

Codex and most other agents follow the [Agent Skills open standard](https://developers.openai.com/codex/skills). It loads skills from `.agents/skills` per repository or from `~/.agents/skills` per user:

```bash
mkdir -p ~/.agents/skills/apify-cli
apify help --skill > ~/.agents/skills/apify-cli/SKILL.md
```
