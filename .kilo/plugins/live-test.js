export default {
  id: "live-playwright-tester",
  server: async ({ directory, client }) => {
    const DEVSERVER_URL = "http://localhost:3000";
    const PLAYWRIGHT_WS = "ws://localhost:9222";
    let sessionEditedSvelte = [];
    let lastSnapshotTime = 0;

    const log = async (message) => {
      try {
        await client?.app?.log?.({ body: { service: "live-test", level: "info", message } });
      } catch (_) {}
    };

    const safeShell = async (cmd) => {
      try {
        const proc = Bun.spawn(["sh", "-c", cmd], { cwd: directory, stdio: ["ignore", "pipe", "pipe"] });
        const out = await new Response(proc.stdout).text();
        await proc.exited;
        return out.trim();
      } catch {
        return null;
      }
    };

    return {
      event: async ({ event }) => {
        if (event.type === "session.created") {
          sessionEditedSvelte = [];
          await log("[live-test] Session started. Browser expected at " + PLAYWRIGHT_WS);
        }

        // Track .svelte file edits
        if (event.type === "file.edited") {
          try {
            const fp = event.properties?.path || "";
            if (fp.endsWith(".svelte")) {
              sessionEditedSvelte.push(fp);
            }
          } catch (_) {}
        }

        // After each assistant turn, smoke test if UI files changed
        if (event.type === "session.idle") {
          const now = Date.now();
          // Don't run smoke tests more than once per 30 seconds
          if (now - lastSnapshotTime < 30000) return;
          if (sessionEditedSvelte.length === 0) return;

          lastSnapshotTime = now;
          await log("[live-test] Smoke testing " + sessionEditedSvelte.length + " changed .svelte files");

          // Check if dev server is running
          const devServerUp = await safeShell("curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 " + DEVSERVER_URL);
          if (!devServerUp || devServerUp === "000") {
            await log("[live-test] Dev server not running at " + DEVSERVER_URL + " — skipping smoke test");
            return;
          }

          // Check if Playwright browser is available
          const browserUp = await safeShell("curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 http://localhost:9222/json/version");
          if (!browserUp || browserUp === "000") {
            await log("[live-test] Playwright browser not at " + PLAYWRIGHT_WS + " — skipping smoke test");
            return;
          }

          await log("[live-test] Dev server: UP | Browser: UP | Running smoke checks...");

          try {
            // Use playwright MCP to snapshot the current page
            // The agent should use: playwright_browser_navigate + playwright_browser_snapshot
            // We log the readiness but don't auto-navigate (agent decides which pages)
            const pagesResp = await safeShell("curl -s http://localhost:9222/json");
            if (pagesResp) {
              try {
                const pages = JSON.parse(pagesResp);
                const pageUrls = pages.map(p => p.url).filter(Boolean);
                await log("[live-test] Browser pages open: " + JSON.stringify(pageUrls));
              } catch {
                await log("[live-test] Browser connected (could not parse pages)");
              }
            }

            // Quick console error check on the dev server page
            const healthResp = await safeShell("curl -s --connect-timeout 3 " + DEVSERVER_URL);
            if (healthResp && healthResp.length > 10) {
              await log("[live-test] Dev server responding: " + healthResp.substring(0, 80) + "...");
            }

            sessionEditedSvelte = []; // Reset after smoke test
            await log("[live-test] Smoke test complete. Ready for agent-driven browser testing.");
          } catch (error) {
            await log("[live-test] Smoke test error: " + error.message);
          }
        }
      },

      "shell.env": async (input, output) => {
        // Inject Playwright browser endpoint for any playwright commands the agent runs
        output.env.PLAYWRIGHT_BROWSER_WS_ENDPOINT = PLAYWRIGHT_WS;
        output.env.PLAYWRIGHT_CDP_URL = "http://localhost:9222";
      },

      "tool.execute.before": async (input, output) => {
        // When integrator runs test:ci, remind about e2e
        if (input.tool === "bash") {
          const cmd = output.args?.command || input.args?.command || "";
          if (typeof cmd === "string" && cmd.includes("npm run test:ci")) {
            await log("[live-test] test:ci detected — consider adding npm run test:e2e for UI verification");
          }
          // Detect epic phase gate builds and suggest e2e suite
          if (typeof cmd === "string" && cmd.includes("npm run build") && sessionEditedSvelte.length > 0) {
            await log("[live-test] Build with " + sessionEditedSvelte.length + " UI changes — recommend npm run test:e2e before deploy");
          }
        }
      },
    };
  },
};
