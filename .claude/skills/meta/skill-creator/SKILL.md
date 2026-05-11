---
name: skill-creator
description: 'Create new skills, modify existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit or optimize an existing skill, or run evals to benchmark skill performance.'
source: https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md
---

# Skill Creator

Create, modify, and improve Claude Code skills. Use this when the user wants to capture a workflow as a reusable skill.

## Process

1. **Capture intent** — What should the skill do? When should it trigger? What's the expected output?
2. **Interview** — Ask about edge cases, input/output formats, dependencies, success criteria
3. **Write SKILL.md** — name, description (primary trigger), structured instructions
4. **Test** — Run the skill against real prompts, evaluate results
5. **Iterate** — Refine based on feedback, expand test cases
6. **Optimize description** — The description is the primary triggering mechanism; tune it for accuracy

## SKILL.md Format

```yaml
---
name: my-skill
description: 'What it does and when to trigger. Include both purpose AND context clues.'
---
# Skill Title

## Steps
1. ...
```

## BitTasker Skill Conventions

- Skills live in `.claude/skills/{domain}/{skill-name}/SKILL.md`
- Add `source:` to frontmatter for skills that can be updated from upstream
- Reference existing project infrastructure (npm scripts, MCP tools) rather than introducing new dependencies
- All Svelte/Capacitor code must be client-only
