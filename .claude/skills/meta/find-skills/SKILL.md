---
name: find-skills
description: "Discover and install agent skills. Use when users ask 'how do I do X', 'find a skill for X', 'is there a skill that can...', or want to extend capabilities."
source: https://raw.githubusercontent.com/vercel-labs/skills/main/skills/find-skills/SKILL.md
---

# Find Skills

Discover and install skills from the open agent skills ecosystem.

## When to Use

- User asks "how do I do X" where a skill might exist
- User says "find a skill for X" or "is there a skill for X"
- User wants to extend capabilities with community skills

## Workflow

1. **Understand the need**: domain (React, testing, design...), task, commonality
2. **Check leaderboard first**: https://skills.sh/ — ranked by installs, shows battle-tested options
3. **Search CLI**: `npx skills find [query]` — use specific keywords
4. **Verify quality**: prefer 1K+ installs, official sources (vercel-labs, anthropics, microsoft), GitHub stars >100
5. **Present options**: skill name, install count, source, install command, skills.sh link
6. **Install**: `npx skills add -g -y <source>@<skill>`

## Key Categories

| Category     | Example Queries                          |
| ------------ | ---------------------------------------- |
| Web Dev      | react, nextjs, typescript, css, tailwind |
| Testing      | testing, jest, playwright, e2e           |
| DevOps       | deploy, docker, kubernetes, ci-cd        |
| Code Quality | review, lint, refactor, best-practices   |
| Design       | ui, ux, design-system, accessibility     |

## No Skill Found?

Offer to help directly. Suggest `npx skills init my-skill-name` to create one.
