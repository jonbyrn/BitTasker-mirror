import { $ } from "bun";

const CHECK_CMD = ["npm", "run", "check"];
const LINT_CMD = ["npm", "run", "lint"];
const BUILD_CMD = "npm run build";
const TRANSLATION_SCRIPT = ["python3", "scripts/find-missing-translations.py", "--fix-suggestions"];
const DEVSERVER_URL = "http://localhost:3000";

export default {
  id: "auto-quality-enforcer",
  server: async ({ directory, client }) => {
    let sessionEditedFiles = [];
    let impactChecked = false;

    const log = async (message) => {
      try {
        await client?.app?.log?.({ body: { service: "auto-fix", level: "info", message } });
      } catch (_) {}
    };

    return {
      event: async ({ event }) => {
        if (event.type === "session.created") {
          sessionEditedFiles = [];
          impactChecked = false;
        }
      },

      "tool.execute.before": async (input, output) => {
        // Track edited files
        if (input.tool === "edit" || input.tool === "write") {
          try {
            const fp = output.args?.filePath || input.args?.filePath;
            if (fp) sessionEditedFiles.push(fp);
          } catch (_) {}
        }

        // Flag if gitnexus_impact was run (for commit hook awareness)
        if (input.tool === "gitnexus_impact" || input.tool === "gitnexus_query") {
          impactChecked = true;
        }

        // Prevent premature npm run build (only allowed at epic phase gates
        // which are signaled by the orchestrator agent triggering it explicitly)
        if (input.tool === "bash") {
          const cmd = output.args?.command || input.args?.command || "";
          if (typeof cmd === "string" && cmd.includes("npm run build") && !cmd.includes("npm run build:storybook")) {
            const hasEpicPlan = await (async () => {
              try {
                const result = await $`ls .kilo/epics/*/epic-plan.md 2>/dev/null | wc -l`.cwd(directory).quiet();
                return parseInt(result.stdout.toString().trim()) > 0;
              } catch { return false; }
            })();
            if (!hasEpicPlan) {
              output.args.command = "npm run check";
              await log("Build deferred: no epic phase gate active. Running npm run check instead.");
            }
          }
        }
      },

      "tool.execute.after": async (input, output) => {
        // After editing a .svelte file, run auto-fix silently
        if (input.tool === "edit" || input.tool === "write") {
          try {
            const fp = output.args?.filePath || input.args?.filePath || "";
            if (typeof fp !== "string" || !fp.endsWith(".svelte")) return;

            // Read the file and scan for common issues
            let content = "";
            try {
              content = await $`cat ${fp}`.cwd(directory).quiet().text();
            } catch { return; }

            let fixed = false;
            const fixes = [];

            // Check for inline styles — extract specific occurrences with daisyUI suggestions
            const styleMatches = content.match(/style\s*=\s*"([^"]*)"/g) || [];
            if (styleMatches.length > 0) {
              const daisyUIMap = {
                'display: flex': 'flex',
                'display: grid': 'grid',
                'display: none': 'hidden',
                'display: block': 'block',
                'text-align: center': 'text-center',
                'text-align: left': 'text-left',
                'text-align: right': 'text-right',
                'font-weight: bold': 'font-bold',
                'font-size:': 'text- (use text-sm, text-base, text-lg, text-xl, text-2xl)',
                'color:': 'text- (use text-primary, text-base-content, text-error, etc.)',
                'background': 'bg- (use bg-base-100, bg-primary, bg-error, etc.)',
                'padding': 'p- (use p-2, p-4, px-4, py-2, etc.)',
                'margin': 'm- (use m-2, m-4, mx-auto, my-4, etc.)',
                'width': 'w- (use w-full, w-1/2, w-64, max-w-md, etc.)',
                'height': 'h- (use h-full, h-screen, h-64, min-h-screen, etc.)',
                'border': 'border border-base-300',
                'border-radius': 'rounded (use rounded, rounded-lg, rounded-full)',
                'box-shadow': 'shadow (use shadow, shadow-md, shadow-lg, shadow-xl)',
                'cursor: pointer': 'cursor-pointer',
                'overflow': 'overflow (use overflow-auto, overflow-hidden, overflow-x-auto)',
                'position': 'relative/absolute/fixed (use relative, absolute, fixed, sticky)',
                'z-index': 'z- (use z-10, z-20, z-50)',
                'gap:': 'gap- (use gap-2, gap-4)',
                'flex-direction': 'flex-col/flex-row',
                'align-items': 'items-center/items-start/items-end',
                'justify-content': 'justify-center/justify-between/justify-end',
              };
              const suggestions = styleMatches.slice(0, 3).map(m => {
                const css = m.replace(/style\s*=\s*"/, '').replace(/"$/, '');
                const tails = [];
                for (const [key, tailwind] of Object.entries(daisyUIMap)) {
                  if (css.includes(key)) tails.push(`  ${key} → ${tailwind}`);
                }
                return `style="${css}"\n${tails.length ? tails.join('\n') : '  → remove and use daisyUI component or Tailwind utility classes'}`;
              });
              fixes.push(`inline styles (${styleMatches.length} occurrences):\n${suggestions.join('\n')}`);
            }

            // Check for as any
            if (/\bas any\b/.test(content)) {
              fixes.push("'as any' usage detected (use proper types from src/lib/types/)");
            }

            // Check for @ts-ignore
            if (/@ts-ignore/.test(content) || /@ts-expect-error/.test(content)) {
              fixes.push("ts-ignore/ts-expect-error detected (fix the type error instead)");
            }

            // Check for legacy Svelte 4 patterns
            if (/(?<!\/\/.*)\$\s*:/.test(content)) {
              fixes.push("legacy reactive declaration '$:' detected (use $derived instead)");
            }
            if (/(?<!\/\/.*)export\s+let\s+\w+/.test(content)) {
              fixes.push("legacy 'export let' detected (use $props instead)");
            }
            if (/on:click/.test(content)) {
              fixes.push("legacy 'on:click' detected (use onclick instead)");
            }

            // Check for raw English strings not in $t()
            const textNodes = content.match(/>([^<>{}$]+)</g) || [];
            for (const match of textNodes) {
              const text = match.slice(1, -1).trim();
              if (text.length > 3 && /[a-zA-Z]/.test(text) && !text.startsWith("{") && !text.includes("$t(")) {
                fixes.push(`untranslated string: "${text.substring(0, 40)}" (wrap with $t())`);
                break; // one warning per file is enough
              }
            }

            if (fixes.length > 0) {
              await log(`[auto-fix] ${fp}: ${fixes.join("; ")}`);
              // Flag fixes as output metadata so the agent can see them
              if (output.metadata) {
                output.metadata.autoFixWarnings = fixes;
              }
            }
          } catch (_) {}
        }

        // After git commit, run quality checks
        if (input.tool === "bash") {
          const cmd = output.args?.command || input.args?.command || "";
          if (typeof cmd !== "string") return;

          if (cmd.includes("git commit")) {
            await log("[auto-fix] Post-commit quality checks running...");

            // Run type check
            try {
              await $`npm run check`.cwd(directory).quiet();
              await log("[auto-fix] npm run check: PASS");
            } catch {
              await log("[auto-fix] npm run check: FAILED (see output above)");
            }

            // Run lint
            try {
              await $`npm run lint`.cwd(directory).quiet();
              await log("[auto-fix] npm run lint: PASS");
            } catch {
              await log("[auto-fix] npm run lint: FAILED (auto-fix with prettier)");
            }
          }
        }
      },

      "shell.env": async (input, output) => {
        output.env.CI = "true";
        output.env.FORCE_COLOR = "1";
      },
    };
  },
};
