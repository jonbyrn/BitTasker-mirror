---
name: webapp-testing
description: 'Test local web applications using Playwright. Use for verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.'
source: https://raw.githubusercontent.com/anthropics/skills/main/skills/webapp-testing/SKILL.md
---

# Web Application Testing

Test local web applications with Playwright.

## BitTasker Priority

**Prefer `mcp__plugin_playwright_playwright__*` MCP tools** for most testing. The MCP tools provide browser navigation, snapshots, screenshots, and network inspection directly. Use `npm run test:e2e` for running the project's existing Playwright test suite.

This skill's `with_server.py` patterns are for cases where you need a custom Playwright script outside the existing test framework.

## Reconnaissance-Then-Action Pattern

1. Navigate and wait for `networkidle`
2. Take screenshot or inspect DOM
3. Identify selectors from rendered state
4. Execute actions with discovered selectors

**Critical**: Always wait for `page.wait_for_load_state('networkidle')` before inspecting DOM on dynamic apps.

## Testing with Existing Infrastructure

```bash
# Run project's Playwright e2e tests
npm run test:e2e

# Dev server for manual MCP browser testing
npm run dev
```

Then use `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost:3000`.
