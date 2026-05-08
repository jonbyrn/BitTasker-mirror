---
name: web-design-guidelines
description: "Review UI code for Web Interface Guidelines compliance. Use when asked to 'review my UI', 'check accessibility', 'audit design', 'review UX', or 'check my site against best practices'."
source: https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines — 100+ rules covering accessibility, performance, UX, forms, animation, typography, touch, dark mode, i18n, and navigation.

## How It Works

1. Fetch latest guidelines: `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
2. Read specified files (or ask user which files)
3. Check against all rules in the fetched guidelines
4. Output findings in terse `file:line` format

## BitTasker Notes

- This is a **mobile-first Capacitor app** — touch and responsive rules are critical
- Use daisyUI + Tailwind CSS 4 for styling — check daisyUI component accessibility
- All components are client-only — no SSR concerns
- Use `mcp__plugin_playwright_playwright__*` for browser verification of UI
