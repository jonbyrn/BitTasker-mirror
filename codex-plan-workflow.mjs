#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const NOTIFY_CHAT_URL =
	process.env.NOTIFY_CHAT_URL || "https://cloud.bittasker.com/ocs/v2.php/apps/spreed/api/v1/chat/39ob7dut";
const NOTIFY_CHAT_USER = process.env.NOTIFY_CHAT_USER || "bit-bot";
const NOTIFY_CHAT_PASSWORD = process.env.NOTIFY_CHAT_PASSWORD || "AYbAf-StStD-zm7om-Xie8o-psD8B";
const SCRIPT_PATH = path.resolve(process.argv[1]);
const WORKDIR = process.cwd();
const rawArgs = process.argv.slice(2);
const STATUS_ONLY = rawArgs.includes("--status");
const AUTO_AUDIT_AFTER_IMPLEMENT = rawArgs.includes("--audit-after-implement");
const FORCE_FRESH_RUN = rawArgs.includes("--fresh-run");
const TEST_NOTIFICATION_ONLY = rawArgs.includes("--test-notification");
const DEBUG_JSON_STREAM = rawArgs.includes("--debug-json");
const FORCE_SANDBOXED = rawArgs.includes("--sandboxed");
const DANGEROUS_AUTO_ELEVATE =
	!FORCE_SANDBOXED &&
	(process.env.CODEX_AUTO_ELEVATE !== "0" ||
		rawArgs.includes("--dangerously-bypass-approvals-and-sandbox") ||
		rawArgs.includes("--auto-elevate"));
const filteredArgs = rawArgs.filter(
	(arg) =>
		arg !== "--status" &&
		arg !== "--audit-after-implement" &&
		arg !== "--fresh-run" &&
		arg !== "--test-notification" &&
		arg !== "--debug-json" &&
		arg !== "--dangerously-bypass-approvals-and-sandbox" &&
		arg !== "--auto-elevate" &&
		arg !== "--sandboxed"
);
const MODE = filteredArgs[0];
const inputArg = filteredArgs[1];
const MAX_ITERS = Number(process.env.MAX_ITERS || 30);
const TARGET_CONFIDENCE = Number(process.env.TARGET_CONFIDENCE || 95);
const VERIFY_CMD = process.env.VERIFY_CMD || "";
const COLOR_ENABLED = process.stdout.isTTY && process.env.NO_COLOR !== "1";
const ANSI = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	cyan: "\x1b[36m",
	blue: "\x1b[34m",
	yellow: "\x1b[33m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	magenta: "\x1b[35m"
};

const MODES = {
	plan: {
		runDirRoot: ".codex-plan-create",
		currentArtifactFilename: "current-plan.md",
		snapshotPrefix: "plan",
		usageFileLabel: "<brief-file>",
		schema: {
			type: "object",
			properties: {
				status: { type: "string", enum: ["in_progress", "blocked", "complete"] },
				confidence_percent: { type: "integer", minimum: 0, maximum: 100 },
				summary: { type: "string" },
				plan_markdown: { type: "string" },
				recommendations: { type: "array", items: { type: "string" } },
				required_user_action: { type: "array", items: { type: "string" } }
			},
			required: [
				"status",
				"confidence_percent",
				"summary",
				"plan_markdown",
				"recommendations",
				"required_user_action"
			],
			additionalProperties: false
		}
	},
	implement: {
		runDirRoot: ".codex-plan-loop",
		currentArtifactFilename: null,
		snapshotPrefix: null,
		usageFileLabel: "<plan-file>",
		schema: {
			type: "object",
			properties: {
				status: { type: "string", enum: ["in_progress", "blocked", "complete"] },
				percent_complete: { type: "integer", minimum: 0, maximum: 100 },
				summary: { type: "string" },
				remaining_work: { type: "array", items: { type: "string" } },
				required_user_action: { type: "array", items: { type: "string" } }
			},
			required: ["status", "percent_complete", "summary", "remaining_work", "required_user_action"],
			additionalProperties: false
		}
	},
	audit: {
		runDirRoot: ".codex-implementation-audit",
		currentArtifactFilename: "current-audit.md",
		snapshotPrefix: "audit",
		usageFileLabel: "<plan-file>",
		schema: {
			type: "object",
			properties: {
				status: { type: "string", enum: ["in_progress", "blocked", "complete"] },
				confidence_percent: { type: "integer", minimum: 0, maximum: 100 },
				summary: { type: "string" },
				audit_report_markdown: { type: "string" },
				recommendations: { type: "array", items: { type: "string" } },
				remaining_work: { type: "array", items: { type: "string" } },
				required_user_action: { type: "array", items: { type: "string" } }
			},
			required: [
				"status",
				"confidence_percent",
				"summary",
				"audit_report_markdown",
				"recommendations",
				"remaining_work",
				"required_user_action"
			],
			additionalProperties: false
		}
	}
};

if (!TEST_NOTIFICATION_ONLY && (!MODE || !MODES[MODE] || !inputArg)) {
	const usage =
		"Usage: node codex-plan-workflow.mjs {plan|implement|audit} <plan-or-brief-file> [--status] [--audit-after-implement] [--sandboxed] [--debug-json] | --test-notification";
	console.error(usage);
	process.exit(1);
}

const modeConfig = MODE ? MODES[MODE] : null;
const INPUT_PATH = inputArg ? path.resolve(WORKDIR, inputArg) : "";
const INPUT_NAME = INPUT_PATH ? path.basename(INPUT_PATH) : "";
const RUN_DIR = modeConfig ? getRunDir(modeConfig.runDirRoot, INPUT_PATH) : "";
const SCHEMA_PATH = RUN_DIR ? path.join(RUN_DIR, "schema.json") : "";
const STATE_PATH = RUN_DIR ? path.join(RUN_DIR, "state.json") : "";
const CURRENT_ARTIFACT_PATH =
	modeConfig && modeConfig.currentArtifactFilename ? path.join(RUN_DIR, modeConfig.currentArtifactFilename) : null;

function safeSlug(input) {
	return input.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

function colorize(text, ...codes) {
	if (!COLOR_ENABLED) {
		return text;
	}

	return `${codes.join("")}${text}${ANSI.reset}`;
}

function createCodexCliError(message) {
	const error = new Error(message);
	error.isCodexCliError = true;
	return error;
}

function isResumeCommand(args) {
	return args[0] === "codex" && args[1] === "exec" && args[2] === "resume";
}

function shouldFallbackToFreshExec(error) {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return (
		message.includes("cannot access session files") ||
		(message.includes("thread/resume failed") && message.includes(".codex/sessions")) ||
		(message.includes("failed to create session") && message.includes(".codex/sessions"))
	);
}

function getRunDir(root, inputPath) {
	const base = safeSlug(path.basename(inputPath, path.extname(inputPath)));
	const hash = createHash("sha1").update(inputPath).digest("hex").slice(0, 8);
	return path.join(WORKDIR, root, `${base}-${hash}`);
}

async function ensureRunDir() {
	await fs.mkdir(RUN_DIR, { recursive: true });
	await writeFileAtomic(SCHEMA_PATH, JSON.stringify(modeConfig.schema, null, 2));
}

async function readJsonIfExists(filePath) {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

async function readTextIfExists(filePath) {
	try {
		return await fs.readFile(filePath, "utf8");
	} catch (error) {
		if (error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

async function writeFileAtomic(filePath, contents) {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await fs.writeFile(tempPath, contents);
	await fs.rename(tempPath, filePath);
}

async function writeJson(filePath, value) {
	await writeFileAtomic(filePath, JSON.stringify(value, null, 2));
}

class ControlledExit extends Error {
	constructor(code) {
		super(`Controlled exit ${code}`);
		this.name = "ControlledExit";
		this.code = code;
	}
}

async function exitScript(code) {
	await new Promise((resolve) => process.stdout.write("", resolve));
	await new Promise((resolve) => process.stderr.write("", resolve));
	throw new ControlledExit(code);
}

function buildStatusSummary(state) {
	const summary = {
		mode: MODE,
		input_path: INPUT_PATH,
		run_dir: RUN_DIR,
		status: state.last_status,
		iteration: state.iteration,
		artifact_path: CURRENT_ARTIFACT_PATH,
		summary: state.last_result?.summary ?? null,
		required_user_action: state.last_result?.required_user_action ?? [],
		updated_at: state.updated_at ?? null
	};

	if (MODE === "plan" || MODE === "audit") {
		summary.confidence_percent = state.current_confidence ?? state.last_result?.confidence_percent ?? null;
		summary.target_confidence = TARGET_CONFIDENCE;
		summary.recommendations = state.recommendations ?? [];
	}

	if (MODE === "implement") {
		summary.percent_complete = state.last_result?.percent_complete ?? null;
		summary.remaining_work = state.prior_remaining_work ?? [];
	}

	if (MODE === "audit") {
		summary.remaining_work = state.remaining_work ?? [];
	}

	if (state.verify_failures?.length) {
		summary.verify_failures = state.verify_failures;
	}

	if (state.verification_pending) {
		summary.verification_pending = true;
	}

	return summary;
}

async function persistState(state) {
	state.updated_at = new Date().toISOString();
	await writeJson(STATE_PATH, state);
}

async function writeCurrentArtifact(text, iteration) {
	if (!CURRENT_ARTIFACT_PATH || !modeConfig.snapshotPrefix) {
		return;
	}

	await writeFileAtomic(CURRENT_ARTIFACT_PATH, text);
	await writeFileAtomic(path.join(RUN_DIR, `${modeConfig.snapshotPrefix}-${iteration}.md`), text);
}

async function sendNotification(title, message) {
	try {
		if (!NOTIFY_CHAT_URL || !NOTIFY_CHAT_USER || !NOTIFY_CHAT_PASSWORD) {
			console.error("Notification skipped: missing NOTIFY_CHAT_URL, NOTIFY_CHAT_USER, or NOTIFY_CHAT_PASSWORD.");
			return false;
		}

		const response = await fetch(NOTIFY_CHAT_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				"OCS-APIRequest": "true",
				Authorization: `Basic ${Buffer.from(`${NOTIFY_CHAT_USER}:${NOTIFY_CHAT_PASSWORD}`).toString("base64")}`
			},
			body: JSON.stringify({
				message
			})
		});

		if (!response.ok) {
			console.error(`Notification failed: ${response.status} ${response.statusText}`);
			return false;
		}

		return true;
	} catch (error) {
		console.error(`Notification failed: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}

function formatFact(label, value) {
	return `- **${label}:** ${value}`;
}

function formatListSection(title, items) {
	if (!items?.length) {
		return [];
	}

	return [`### ${title}`, ...items.map((item) => `- ${item}`)];
}

function formatCodeSection(title, text) {
	if (!text) {
		return [];
	}

	return [`### ${title}`, "```text", text, "```"];
}

function buildMarkdownNotification(title, { summary = null, facts = [], sections = [] } = {}) {
	const lines = [`## ${title}`];

	if (summary) {
		lines.push("", `**Summary:** ${summary}`);
	}

	if (facts.length) {
		lines.push("", ...facts);
	}

	for (const section of sections) {
		if (!section?.length) {
			continue;
		}
		lines.push("", ...section);
	}

	return lines.join("\n");
}

async function sendTestNotification() {
	const ok = await sendNotification(
		"codex-plan-workflow test notification",
		buildMarkdownNotification("codex-plan-workflow test notification", {
			facts: [formatFact("Workspace", `\`${WORKDIR}\``), formatFact("UTC", `\`${new Date().toISOString()}\``)]
		})
	);
	if (!ok) {
		throw new Error("Test notification failed.");
	}
}

async function sendStateNotificationOnce(state, key, title, message) {
	state.notification_flags ||= {};
	if (state.notification_flags[key] === "sent") {
		return;
	}

	state.notification_flags[key] = "pending";
	await persistState(state);
	if (await sendNotification(title, message)) {
		state.notification_flags[key] = "sent";
		await persistState(state);
	}
}

function stripAnsi(text) {
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function modeDisplay() {
	if (MODE === "plan") {
		return colorize("PLAN", ANSI.bold, ANSI.cyan);
	}

	if (MODE === "implement") {
		return colorize("IMPLEMENT", ANSI.bold, ANSI.blue);
	}

	return colorize("AUDIT", ANSI.bold, ANSI.magenta);
}

function statusDisplay(status) {
	const label = status.toUpperCase();

	if (status === "complete") {
		return colorize(label, ANSI.bold, ANSI.green);
	}

	if (status === "blocked") {
		return colorize(label, ANSI.bold, ANSI.red);
	}

	if (status === "max iters") {
		return colorize(label.toUpperCase(), ANSI.bold, ANSI.magenta);
	}

	if (status === "verifying") {
		return colorize(label, ANSI.bold, ANSI.cyan);
	}

	return colorize(label, ANSI.bold, ANSI.yellow);
}

function printHeadline(iteration, status, detailParts) {
	const segments = [
		modeDisplay().padEnd(stripAnsi(modeDisplay()).length + (modeDisplay().length - stripAnsi(modeDisplay()).length)),
		`Iteration ${iteration}`,
		statusDisplay(status)
	];

	for (const part of detailParts) {
		if (part) {
			segments.push(part);
		}
	}

	const line = segments.join(" | ");
	const visibleLength = stripAnsi(line).length;
	const border = `+${"-".repeat(visibleLength + 2)}+`;

	console.log("");
	console.log(border);
	console.log(`| ${line}${" ".repeat(Math.max(0, visibleLength - stripAnsi(line).length))} |`);
	console.log(border);
}

function safeJsonParse(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function summarizeText(text, maxLength = 140) {
	if (typeof text !== "string") {
		return null;
	}

	const compact = text.replace(/\s+/g, " ").trim();
	if (!compact) {
		return null;
	}

	return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}

function formatProgressItems(items, limit = 3) {
	if (!Array.isArray(items) || items.length === 0) {
		return [];
	}

	const lines = items.slice(0, limit).map((item) => `- ${item}`);
	if (items.length > limit) {
		lines.push(`- ...and ${items.length - limit} more`);
	}

	return lines;
}

function extractEventItem(event) {
	if (!event || typeof event !== "object") {
		return null;
	}

	if (event.item && typeof event.item === "object") {
		return event.item;
	}

	if (event.payload?.item && typeof event.payload.item === "object") {
		return event.payload.item;
	}

	return null;
}

function renderStructuredProgress(structured) {
	const lines = [];
	const summary = summarizeText(structured.summary, 220);
	const progress =
		typeof structured.percent_complete === "number"
			? `${structured.percent_complete}%`
			: typeof structured.confidence_percent === "number"
				? `${structured.confidence_percent}% confidence`
				: null;
	const label = structured.status === "blocked" ? "Blocked" : "Working";

	if (summary) {
		lines.push(`[${label}]${progress ? ` ${progress}` : ""} ${summary}`);
	} else if (progress) {
		lines.push(`[${label}] ${progress}`);
	}

	const remaining = formatProgressItems(structured.remaining_work);
	if (remaining.length) {
		lines.push("Remaining:");
		lines.push(...remaining);
	}

	const recommendations = formatProgressItems(structured.recommendations);
	if (recommendations.length) {
		lines.push("Recommendations:");
		lines.push(...recommendations);
	}

	const required = formatProgressItems(structured.required_user_action);
	if (required.length) {
		lines.push("Required user action:");
		lines.push(...required);
	}

	return lines;
}

function renderTodoList(item) {
	const entries =
		item?.items ??
		item?.todos ??
		item?.tasks ??
		item?.content?.items ??
		item?.content?.todos ??
		[];
	if (!Array.isArray(entries) || entries.length === 0) {
		return [];
	}

	const lines = ["Progress:"];
	for (const entry of entries) {
		const text = summarizeText(
			entry?.content ?? entry?.text ?? entry?.label ?? entry?.title ?? "",
			180
		);
		if (!text) {
			continue;
		}

		const done =
			entry?.completed === true ||
			entry?.checked === true ||
			entry?.done === true ||
			entry?.status === "completed";
		lines.push(`${done ? "[x]" : "[ ]"} ${text}`);
	}

	return lines.length > 1 ? lines : [];
}

function renderGenericEvent(event, item) {
	const eventType = event?.type;
	const itemType = item?.type ?? event?.item_type ?? event?.payload?.item_type ?? null;
	const text =
		summarizeText(
			item?.text ??
				item?.message ??
				item?.content?.text ??
				item?.title ??
				item?.label ??
				event?.message ??
				"",
			180
		) ?? null;

	if (eventType === "item.started" && text) {
		return [`[Starting] ${text}`];
	}

	if (eventType === "item.completed" && text) {
		if (itemType === "agent_message") {
			return [`[Working] ${text}`];
		}

		return [`[Done] ${text}`];
	}

	if (eventType === "turn.completed") {
		const usage = event?.usage ?? event?.metrics?.usage ?? null;
		if (usage) {
			const input = usage.input_tokens ?? usage.inputTokenCount ?? usage.input ?? null;
			const cached = usage.cached_input_tokens ?? usage.cachedInputTokens ?? usage.cached ?? null;
			const output = usage.output_tokens ?? usage.outputTokenCount ?? usage.output ?? null;
			const parts = [];
			if (input != null) {
				parts.push(`input ${input}`);
			}
			if (cached != null) {
				parts.push(`cached ${cached}`);
			}
			if (output != null) {
				parts.push(`output ${output}`);
			}
			if (parts.length) {
				return [`[Turn complete] ${parts.join(" | ")}`];
			}
		}

		return ["[Turn complete]"];
	}

	return [];
}

function renderCodexEvent(event) {
	const item = extractEventItem(event);
	if (item?.type === "todo_list") {
		return renderTodoList(item);
	}

	if (item?.type === "agent_message") {
		const structured = safeJsonParse(item.text ?? item.message ?? "");
		if (structured && typeof structured === "object" && !Array.isArray(structured)) {
			return renderStructuredProgress(structured);
		}
	}

	return renderGenericEvent(event, item);
}

function printIterationHeadline(iteration, result) {
	if (MODE === "plan") {
		printHeadline(iteration, result.status, [
			`Confidence ${result.confidence_percent}%`,
			`Target ${TARGET_CONFIDENCE}%`
		]);
		return;
	}

	if (MODE === "implement") {
		const extras = [`Complete ${result.percent_complete}%`];
		if (result.status === "blocked") {
			extras.push(colorize("Action needed", ANSI.bold, ANSI.red));
		}
		printHeadline(iteration, result.status, extras);
		return;
	}

	printHeadline(iteration, result.status, [
		`Confidence ${result.confidence_percent}%`,
		`Target ${TARGET_CONFIDENCE}%`
	]);
}

function initialState() {
	const base = {
		input_path: INPUT_PATH,
		run_dir: RUN_DIR,
		iteration: 0,
		last_status: null,
		last_result: null,
		verification_pending: null,
		artifact_sync_pending: false,
		notification_flags: {},
		updated_at: null
	};

	if (MODE === "plan") {
		return {
			...base,
			current_artifact_path: CURRENT_ARTIFACT_PATH,
			current_confidence: 0,
			recommendations: []
		};
	}

	if (MODE === "implement") {
		return {
			...base,
			prior_remaining_work: [],
			verify_failures: []
		};
	}

	return {
		...base,
		current_artifact_path: CURRENT_ARTIFACT_PATH,
		current_confidence: 0,
		recommendations: [],
		remaining_work: [],
		verify_failures: []
	};
}

async function runCodex(args, prompt, lastMessagePath) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const settleReject = (error) => {
			if (settled) {
				return;
			}

			settled = true;
			reject(error);
		};
		const settleResolve = (value) => {
			if (settled) {
				return;
			}

			settled = true;
			resolve(value);
		};

		const child = spawn("npx", args, {
			cwd: WORKDIR,
			env: process.env,
			stdio: ["pipe", "pipe", "pipe"]
		});

		let stdout = "";
		let stderr = "";
		let stdoutBuffer = "";
		let lastRenderedSignature = null;

		const flushStdoutLines = (flushRemainder = false) => {
			const lines = stdoutBuffer.split("\n");
			if (!flushRemainder) {
				stdoutBuffer = lines.pop() ?? "";
			} else {
				stdoutBuffer = "";
			}

			for (const rawLine of lines) {
				const line = rawLine.trim();
				if (!line) {
					continue;
				}

				if (DEBUG_JSON_STREAM) {
					process.stdout.write(`${rawLine}\n`);
					continue;
				}

				const event = safeJsonParse(line);
				if (!event || typeof event !== "object") {
					console.log(line);
					continue;
				}

				const renderedLines = renderCodexEvent(event);
				if (!renderedLines.length) {
					continue;
				}

				const signature = JSON.stringify(renderedLines);
				if (signature === lastRenderedSignature) {
					continue;
				}

				lastRenderedSignature = signature;
				for (const renderedLine of renderedLines) {
					console.log(renderedLine);
				}
			}
		};

		child.stdout.on("data", (chunk) => {
			const text = chunk.toString();
			stdout += text;
			stdoutBuffer += text;
			flushStdoutLines(false);
		});

		child.stderr.on("data", (chunk) => {
			const text = chunk.toString();
			stderr += text;
			process.stderr.write(text);
		});

		child.on("error", (error) => {
			settleReject(createCodexCliError(`Failed to start Codex CLI: ${error.message}`));
		});

		child.stdin.on("error", (error) => {
			settleReject(createCodexCliError(`Failed to send prompt to Codex CLI: ${error.message}`));
		});

		child.on("close", async (code) => {
			flushStdoutLines(true);

			if (code !== 0) {
				settleReject(createCodexCliError(`Codex exited with code ${code}\n${stderr}`));
				return;
			}

			let result;
			try {
				result = JSON.parse(await fs.readFile(lastMessagePath, "utf8"));
			} catch (error) {
				settleReject(createCodexCliError(`Failed to parse last message JSON: ${error.message}`));
				return;
			}

			settleResolve({ result });
		});

		try {
			child.stdin.end(prompt);
		} catch (error) {
			settleReject(
				createCodexCliError(
					`Failed to write prompt to Codex CLI: ${error instanceof Error ? error.message : String(error)}`
				)
			);
		}
	});
}

async function runCodexWithFallback(args, prompt, lastMessagePath) {
	try {
		return await runCodex(args, prompt, lastMessagePath);
	} catch (error) {
		if (!isResumeCommand(args) || !shouldFallbackToFreshExec(error)) {
			throw error;
		}

		console.error("Resume unavailable. Falling back to a fresh Codex exec for this iteration.");
		return await runCodex(buildExecArgs(lastMessagePath), prompt, lastMessagePath);
	}
}

async function runVerify() {
	if (!VERIFY_CMD) {
		return { ok: true, output: "" };
	}

	return new Promise((resolve) => {
		const child = spawn("zsh", ["-lc", VERIFY_CMD], {
			cwd: WORKDIR,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"]
		});

		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			output += chunk.toString();
		});
		child.on("close", (code) => {
			resolve({ ok: code === 0, output: output.trim() });
		});
	});
}

async function runAuditAfterImplementation() {
	return await new Promise((resolve, reject) => {
		const childArgs = [SCRIPT_PATH, "audit", INPUT_PATH, "--fresh-run"];
		if (DANGEROUS_AUTO_ELEVATE) {
			childArgs.push("--dangerously-bypass-approvals-and-sandbox");
		}

		const child = spawn(process.execPath, childArgs, {
			cwd: WORKDIR,
			env: process.env,
			stdio: ["ignore", "inherit", "inherit"]
		});

		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
	});
}

function buildPrompt(inputText, currentArtifactText, state, iteration) {
	const isInitialIteration = iteration === 1 && !state.last_result;
	const hasVerificationFailures = Boolean(state.verify_failures?.length);
	const hasRecommendations = Boolean(state.recommendations?.length);
	const hasRemainingWork = Boolean(state.prior_remaining_work?.length || state.remaining_work?.length);
	const explicitFieldContract =
		MODE === "plan"
			? [
				"Return a single JSON object with exactly these fields:",
				'- "status": "in_progress" | "blocked" | "complete"',
				'- "confidence_percent": integer 0-100',
				'- "summary": string',
				'- "plan_markdown": string',
				'- "recommendations": array of strings',
				'- "required_user_action": array of strings'
			].join("\n")
			: MODE === "implement"
				? [
					"Return a single JSON object with exactly these fields:",
					'- "status": "in_progress" | "blocked" | "complete"',
					'- "percent_complete": integer 0-100',
					'- "summary": string',
					'- "remaining_work": array of strings',
					'- "required_user_action": array of strings'
				].join("\n")
				: [
					"Return a single JSON object with exactly these fields:",
					'- "status": "in_progress" | "blocked" | "complete"',
					'- "confidence_percent": integer 0-100',
					'- "summary": string',
					'- "audit_report_markdown": string',
					'- "recommendations": array of strings',
					'- "remaining_work": array of strings',
					'- "required_user_action": array of strings'
				].join("\n");
	const schemaReminder = isInitialIteration
		? "Return only JSON matching the provided schema."
		: "Return only JSON matching the provided schema exactly, with every required field present and no extra text before or after the JSON.";

	if (MODE === "plan") {
		const phaseInstruction = isInitialIteration
			? "Create the initial implementation plan from the brief, then have specialized agents critique it and revise it before returning."
			: "Start from the current saved plan, have specialized agents review it, integrate their recommendations, and then audit the revised plan again before returning.";

		return [
			"You are creating an implementation plan for work in this repository.",
			"Work iteratively until the plan is high quality and confidence reaches the required threshold.",
			"On this iteration, use a swarm of specialized agents relevant to the brief to critique and improve the plan.",
			"Choose specialist roles that fit the brief, such as architecture, implementation, testing, security, performance, migration, user experience, or release planning.",
			phaseInstruction,
			"While working, emit short plain-language progress updates describing the current phase and immediate task. Keep each update to one sentence.",
			"Produce a conservative confidence_percent for the final revised plan from this iteration.",
			schemaReminder,
			explicitFieldContract,
			`Set status to 'complete' only if confidence_percent is at least ${TARGET_CONFIDENCE} and the revised plan is ready for implementation.`,
			"Set status to 'blocked' only if you cannot continue without user action, such as missing requirements, credentials, access, or a manual decision.",
			"If status is 'blocked', required_user_action must clearly tell the user what to do before rerunning.",
			"If status is 'complete', confidence_percent must be at least the required threshold.",
			"",
			`Iteration: ${iteration}`,
			`Confidence target: ${TARGET_CONFIDENCE}%`,
			"",
			"Brief:",
			inputText,
			"",
			isInitialIteration ? "Initial plan context:" : "Current plan to revise:",
			currentArtifactText || "No current plan exists yet.",
			"",
			"Recommendations from the previous iteration to integrate:",
			JSON.stringify(state.recommendations || [], null, 2)
		].join("\n");
	}

	if (MODE === "implement") {
		const phaseInstruction = isInitialIteration
			? "Inspect the repository and the plan, compare the current repository state against the plan to identify what is already implemented versus what remains, then begin implementing the highest-value remaining work."
			: hasVerificationFailures
				? "Continue the implementation by fixing the verification failures and any remaining implementation work before claiming completion again."
				: "Continue the implementation from the saved state and remaining work without repeating a full repository-wide implementation assessment unless new findings make the saved state unreliable.";

		return [
			"Implement the plan in this repository.",
			"Work iteratively until the plan is fully implemented.",
			"Use a swarm of agents to implement the plan in parallel where possible, and for implementation review.",
			"You may inspect files, edit files, and run verification commands as needed.",
			phaseInstruction,
			"Use any relevant MCP servers, skills, and search online for documentation prior to implementation when needed for correctness.",
			"While working, emit short plain-language progress updates describing the current phase and immediate task. Keep each update to one sentence.",
			schemaReminder,
			explicitFieldContract,
			"Set status to 'complete' only if the implementation is fully done and no implementation work remains.",
			"Set status to 'blocked' only if implementation cannot continue until the user performs some external action, such as setting env vars, providing credentials, granting access, or making a manual decision.",
			"Set percent_complete as a conservative estimate of implementation progress only.",
			"On the first iteration, base percent_complete on the plan requirements already satisfied by the current repository, not just on work completed during this session.",
			"Do not redo completed work unless it is incorrect, incomplete, or required to finish the plan cleanly.",
			"If status is 'complete', percent_complete must be 100.",
			"If status is 'blocked', required_user_action must clearly state what the user needs to do before rerunning the script.",
			"",
			`Iteration: ${iteration}`,
			"",
			"Plan:",
			inputText,
			"",
			"Previously identified remaining implementation work:",
			JSON.stringify(state.prior_remaining_work || [], null, 2),
			"",
			"External verification failures from prior iteration:",
			JSON.stringify(state.verify_failures || [], null, 2)
		].join("\n");
	}

	const phaseInstruction = isInitialIteration
		? "Create the initial audit report by auditing the implemented code against the plan and repository state."
		: hasVerificationFailures
			? "Continue the audit by resolving the verification failures, then update and re-audit the report before returning."
			: hasRecommendations || hasRemainingWork
				? "Continue from the current audit report, address the highest-value remaining recommendations you can implement directly, and then re-audit before returning."
				: "Continue auditing from the current saved audit report and repository state.";

	return [
		"You are auditing the implementation of a plan in this repository.",
		"Use a swarm of specialized review agents relevant to the plan and implementation, such as architecture, testing, security, performance, frontend, backend, data, migration, user experience, and reliability reviewers.",
		phaseInstruction,
		"Gather any information you need before making changes, including tests, docs, local code, MCP resources, skills, and web searches when useful.",
		"While working, emit short plain-language progress updates describing the current phase and immediate task. Keep each update to one sentence.",
		schemaReminder,
		explicitFieldContract,
		`Set status to 'complete' only if the audited implementation is in good shape and confidence_percent is at least ${TARGET_CONFIDENCE}.`,
		"Set status to 'blocked' only if the audit or remediation cannot continue until the user performs an external action such as setting env vars, providing credentials, granting access, or making a manual decision.",
		"If status is 'blocked', required_user_action must clearly state what the user needs to do before rerunning.",
		"If status is 'complete', confidence_percent must be at least the required threshold.",
		"",
		`Iteration: ${iteration}`,
		`Confidence target: ${TARGET_CONFIDENCE}%`,
		"",
		"Plan:",
		inputText,
		"",
		isInitialIteration ? "Initial audit context:" : "Current audit report to update:",
		currentArtifactText || "No audit report exists yet.",
		"",
		"Recommendations from the previous iteration to address or verify:",
		JSON.stringify(state.recommendations || [], null, 2),
		"",
		"Remaining work from the previous iteration:",
		JSON.stringify(state.remaining_work || [], null, 2),
		"",
		"External verification failures from the previous iteration:",
		JSON.stringify(state.verify_failures || [], null, 2)
	].join("\n");
}

function buildExecArgs(lastMessagePath) {
	return [
		"codex",
		"exec",
		"--json",
		...(DANGEROUS_AUTO_ELEVATE
			? ["--dangerously-bypass-approvals-and-sandbox"]
			: ["--full-auto"]),
		"--cd",
		WORKDIR,
		"--output-schema",
		SCHEMA_PATH,
		"--output-last-message",
		lastMessagePath,
		"-"
	];
}

function buildResumeArgs(lastMessagePath) {
	return [
		"codex",
		"exec",
		"resume",
		"--last",
		"--json",
		...(DANGEROUS_AUTO_ELEVATE
			? ["--dangerously-bypass-approvals-and-sandbox"]
			: ["--full-auto"]),
		"--output-last-message",
		lastMessagePath,
		"-"
	];
}

function validateResult(result) {
	if (!result || typeof result !== "object" || Array.isArray(result)) {
		throw new Error("Invalid model output: expected a JSON object.");
	}

	const expectArrayOfStrings = (value, fieldName) => {
		if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
			throw new Error(`Invalid model output: ${fieldName} must be an array of strings.`);
		}
	};

	if (typeof result.status !== "string" || !["in_progress", "blocked", "complete"].includes(result.status)) {
		throw new Error("Invalid model output: status must be one of in_progress, blocked, or complete.");
	}

	if (typeof result.summary !== "string") {
		throw new Error("Invalid model output: summary must be a string.");
	}

	if (MODE === "plan" || MODE === "audit") {
		if (!Number.isInteger(result.confidence_percent) || result.confidence_percent < 0 || result.confidence_percent > 100) {
			throw new Error("Invalid model output: confidence_percent must be an integer between 0 and 100.");
		}

		expectArrayOfStrings(result.required_user_action, "required_user_action");

		if (MODE === "plan") {
			if (typeof result.plan_markdown !== "string") {
				throw new Error("Invalid model output: plan_markdown must be a string.");
			}
			expectArrayOfStrings(result.recommendations, "recommendations");
		} else {
			if (typeof result.audit_report_markdown !== "string") {
				throw new Error("Invalid model output: audit_report_markdown must be a string.");
			}
			expectArrayOfStrings(result.recommendations, "recommendations");
			expectArrayOfStrings(result.remaining_work, "remaining_work");
		}

		if (result.status === "complete" && result.confidence_percent < TARGET_CONFIDENCE) {
			throw new Error(
				`Invalid model output: complete requires confidence_percent >= ${TARGET_CONFIDENCE}`
			);
		}

		if ((result.status === "in_progress" || result.status === "blocked") && result.confidence_percent >= TARGET_CONFIDENCE) {
			throw new Error(
				`Invalid model output: in_progress or blocked cannot have confidence_percent >= ${TARGET_CONFIDENCE}`
			);
		}

		return;
	}

	if (!Number.isInteger(result.percent_complete) || result.percent_complete < 0 || result.percent_complete > 100) {
		throw new Error("Invalid model output: percent_complete must be an integer between 0 and 100.");
	}

	expectArrayOfStrings(result.remaining_work, "remaining_work");
	expectArrayOfStrings(result.required_user_action, "required_user_action");

	if (result.status === "complete" && result.percent_complete !== 100) {
		throw new Error("Invalid model output: complete requires percent_complete=100");
	}

	if ((result.status === "in_progress" || result.status === "blocked") && result.percent_complete === 100) {
		throw new Error("Invalid model output: in_progress or blocked cannot have percent_complete=100");
	}
}

function buildProgressMilestoneMessage(state, percent) {
	return buildMarkdownNotification(`${INPUT_NAME} implementation ${percent}%`, {
		summary: `Implementation progress has reached ${percent}%.`,
		facts: [
			formatFact("Mode", "implement"),
			formatFact("Iteration", state?.iteration ?? "current"),
			formatFact("Percent complete", `${percent}%`),
			formatFact("Run dir", `\`${RUN_DIR}\``)
		]
	});
}

function buildConfidenceMilestoneMessage(state, confidence) {
	return buildMarkdownNotification(`${INPUT_NAME} confidence ${confidence}%`, {
		summary: `${MODE === "plan" ? "Plan" : "Audit"} confidence has reached ${confidence}%.`,
		facts: [
			formatFact("Mode", MODE),
			formatFact("Iteration", state?.iteration ?? "current"),
			formatFact("Confidence", `${confidence}%`),
			formatFact("Target confidence", `${TARGET_CONFIDENCE}%`),
			formatFact("Run dir", `\`${RUN_DIR}\``)
		]
	});
}

async function sendMilestoneNotifications(state) {
	if (MODE === "implement") {
		const percent = state.last_result?.percent_complete ?? 0;
		for (const threshold of [25, 50, 75]) {
			if (percent >= threshold) {
				await sendStateNotificationOnce(
					state,
					`progress_${threshold}`,
					`${INPUT_NAME} implementation ${threshold}%`,
					buildProgressMilestoneMessage(state, threshold)
				);
			}
		}
		return;
	}

	const confidence = state.current_confidence ?? state.last_result?.confidence_percent ?? 0;
	for (const threshold of [80, 85, 90]) {
		if (confidence >= threshold) {
			await sendStateNotificationOnce(
				state,
				`confidence_${threshold}`,
				`${INPUT_NAME} confidence ${threshold}%`,
				buildConfidenceMilestoneMessage(state, threshold)
			);
		}
	}
}

function buildBlockedMessage(state) {
	if (MODE === "plan") {
		return buildMarkdownNotification(`${INPUT_NAME} blocked`, {
			summary: state.last_result?.summary ?? "Plan creation is blocked and requires user action before it can continue.",
			facts: [
				formatFact("Mode", "plan"),
				formatFact("Iteration", state.iteration),
				formatFact("Confidence", `${state.last_result?.confidence_percent ?? "unknown"}%`),
				formatFact("Run dir", `\`${RUN_DIR}\``),
				formatFact("Artifact", `\`${CURRENT_ARTIFACT_PATH}\``)
			],
			sections: [
				formatListSection("Required User Action", state.last_result?.required_user_action),
				formatListSection("Recommendations", state.recommendations)
			]
		});
	}

	if (MODE === "implement") {
		return buildMarkdownNotification(`${INPUT_NAME} blocked`, {
			summary: state.last_result?.summary ?? "Implementation is blocked and requires user action before it can continue.",
			facts: [
				formatFact("Mode", "implement"),
				formatFact("Iteration", state.iteration),
				formatFact("Percent complete", `${state.last_result?.percent_complete ?? "unknown"}%`),
				formatFact("Run dir", `\`${RUN_DIR}\``)
			],
			sections: [
				formatListSection("Required User Action", state.last_result?.required_user_action),
				formatListSection("Remaining Work", state.prior_remaining_work)
			]
		});
	}

	return buildMarkdownNotification(`${INPUT_NAME} blocked`, {
		summary: state.last_result?.summary ?? "Implementation audit is blocked and requires user action before it can continue.",
		facts: [
			formatFact("Mode", "audit"),
			formatFact("Iteration", state.iteration),
			formatFact("Confidence", `${state.current_confidence ?? "unknown"}%`),
			formatFact("Run dir", `\`${RUN_DIR}\``),
			formatFact("Artifact", `\`${CURRENT_ARTIFACT_PATH}\``)
		],
		sections: [
			formatListSection("Required User Action", state.last_result?.required_user_action),
			formatListSection("Remaining Work", state.remaining_work)
		]
	});
}

function buildMaxItersMessage(state) {
	if (MODE === "plan") {
		return buildMarkdownNotification(`${INPUT_NAME} max iterations reached`, {
			facts: [
				formatFact("Mode", "plan"),
				formatFact("Iteration", state.iteration),
				formatFact("Last status", state.last_status ?? "unknown"),
				formatFact("Confidence", `${state.current_confidence ?? "unknown"}%`),
				formatFact("Target confidence", `${TARGET_CONFIDENCE}%`),
				formatFact("Run dir", `\`${RUN_DIR}\``),
				formatFact("Artifact", `\`${CURRENT_ARTIFACT_PATH}\``)
			],
			sections: [formatListSection("Recommendations", state.recommendations)]
		});
	}

	if (MODE === "implement") {
		return buildMarkdownNotification(`${INPUT_NAME} max iterations reached`, {
			facts: [
				formatFact("Mode", "implement"),
				formatFact("Iteration", state.iteration),
				formatFact("Last status", state.last_status ?? "unknown"),
				formatFact("Percent complete", `${state.last_result?.percent_complete ?? "unknown"}%`),
				formatFact("Run dir", `\`${RUN_DIR}\``)
			],
			sections: [
				formatListSection("Remaining Work", state.prior_remaining_work),
				formatCodeSection("Verification Failures", state.verify_failures?.join("\n\n"))
			]
		});
	}

	return buildMarkdownNotification(`${INPUT_NAME} max iterations reached`, {
		facts: [
			formatFact("Mode", "audit"),
			formatFact("Iteration", state.iteration),
			formatFact("Last status", state.last_status ?? "unknown"),
			formatFact("Confidence", `${state.current_confidence ?? "unknown"}%`),
			formatFact("Target confidence", `${TARGET_CONFIDENCE}%`),
			formatFact("Run dir", `\`${RUN_DIR}\``),
			formatFact("Artifact", `\`${CURRENT_ARTIFACT_PATH}\``)
		],
		sections: [
			formatListSection("Remaining Work", state.remaining_work),
			formatListSection("Recommendations", state.recommendations),
			formatCodeSection("Verification Failures", state.verify_failures?.join("\n\n"))
		]
	});
}

function buildCompleteMessage(state, result) {
	if (MODE === "plan") {
		return buildMarkdownNotification(`${INPUT_NAME} plan ready`, {
			summary: state.last_result?.summary ?? "Plan is ready for implementation.",
			facts: [
				formatFact("Mode", "plan"),
				formatFact("Iteration", state.iteration),
				formatFact("Confidence", `${state.current_confidence}%`),
				formatFact("Target confidence", `${TARGET_CONFIDENCE}%`),
				formatFact("Run dir", `\`${RUN_DIR}\``),
				formatFact("Artifact", `\`${CURRENT_ARTIFACT_PATH}\``)
			],
			sections: [formatListSection("Recommendations", state.recommendations)]
		});
	}

	if (MODE === "implement") {
		return buildMarkdownNotification(`${INPUT_NAME} complete`, {
			summary: result.summary,
			facts: [
				formatFact("Mode", "implement"),
				formatFact("Iteration", state.iteration),
				formatFact("Percent complete", `${result.percent_complete}%`),
				formatFact("Run dir", `\`${RUN_DIR}\``),
				...(AUTO_AUDIT_AFTER_IMPLEMENT ? [formatFact("Next step", "audit starting automatically")] : [])
			]
		});
	}

	return buildMarkdownNotification(`${INPUT_NAME} audit ready`, {
		summary: state.last_result?.summary ?? "Audit is complete.",
		facts: [
			formatFact("Mode", "audit"),
			formatFact("Iteration", state.iteration),
			formatFact("Confidence", `${state.current_confidence}%`),
			formatFact("Target confidence", `${TARGET_CONFIDENCE}%`),
			formatFact("Run dir", `\`${RUN_DIR}\``),
			formatFact("Artifact", `\`${CURRENT_ARTIFACT_PATH}\``)
		],
		sections: [
			formatListSection("Recommendations", state.recommendations),
			formatListSection("Remaining Work", state.remaining_work)
		]
	});
}

function artifactOutputKey() {
	return MODE === "plan" ? "plan_path" : MODE === "audit" ? "audit_path" : null;
}

function resultArtifactText(result) {
	return MODE === "plan" ? result.plan_markdown : result.audit_report_markdown;
}

async function reconcilePendingArtifactSync(state) {
	if (!CURRENT_ARTIFACT_PATH || !state.artifact_sync_pending || !state.last_result || state.verification_pending) {
		return state;
	}

	const text = resultArtifactText(state.last_result);
	if (typeof text !== "string") {
		state.artifact_sync_pending = false;
		await persistState(state);
		return state;
	}

	await writeCurrentArtifact(text, state.iteration);
	state.artifact_sync_pending = false;
	await persistState(state);
	return state;
}

function buildFinalOutput(status, result) {
	const output = { status, result };
	const key = artifactOutputKey();
	if (key) {
		output[key] = CURRENT_ARTIFACT_PATH;
	}
	return output;
}

async function resolvePendingVerification(state) {
	if (!(MODE === "implement" || MODE === "audit") || !state.verification_pending) {
		return state;
	}

	printHeadline(state.verification_pending.iteration, "verifying", [
		MODE === "implement"
			? `Complete ${state.verification_pending.result?.percent_complete ?? "unknown"}%`
			: `Confidence ${state.verification_pending.result?.confidence_percent ?? "unknown"}%`
	]);

	const verify = await runVerify();

	if (!verify.ok) {
		state.last_status = "in_progress";
		state.last_result = {
			...state.verification_pending.result,
			status: "in_progress",
			percent_complete:
				MODE === "implement"
					? Math.min((state.verification_pending.result?.percent_complete ?? 100) - 1, 99)
					: state.verification_pending.result?.percent_complete,
			confidence_percent:
				MODE === "audit"
					? Math.min(state.verification_pending.result?.confidence_percent ?? TARGET_CONFIDENCE, TARGET_CONFIDENCE - 1)
					: state.verification_pending.result?.confidence_percent
		};

		if (MODE === "implement") {
			state.verify_failures = [verify.output || "Verification failed with no output."];
			state.prior_remaining_work = [
				...(state.prior_remaining_work || []),
				"Fix external verification failures before claiming completion."
			];
		} else {
			state.verify_failures = [verify.output || "Verification failed with no output."];
			state.remaining_work = [
				...(state.remaining_work || []),
				"Fix external verification failures before claiming the audit is complete."
			];
		}

		if (MODE === "audit") {
			state.current_confidence = state.last_result.confidence_percent;
			state.artifact_sync_pending = false;
		}
		state.verification_pending = null;
		await persistState(state);
		return state;
	}

	state.last_status = "complete";
	state.last_result = state.verification_pending.result;
	state.verify_failures = [];
	if (MODE === "implement") {
		state.prior_remaining_work = [];
	}
	state.verification_pending = null;
	await persistState(state);
	return state;
}

try {
		if (TEST_NOTIFICATION_ONLY) {
			await sendTestNotification();
			console.log(JSON.stringify({ status: "complete", message: "Test notification sent." }, null, 2));
			await exitScript(0);
		}

		let state = FORCE_FRESH_RUN && !STATUS_ONLY ? null : (await readJsonIfExists(STATE_PATH)) || null;

		if (STATUS_ONLY) {
			if (!state) {
			printHeadline(0, "blocked", [colorize("No saved run state", ANSI.bold, ANSI.red)]);
			console.log(
				JSON.stringify(
					{
						mode: MODE,
						input_path: INPUT_PATH,
						run_dir: RUN_DIR,
						status: null,
						iteration: 0,
						artifact_path: CURRENT_ARTIFACT_PATH,
						summary: null,
						required_user_action: [],
						updated_at: new Date().toISOString()
					},
					null,
					2
				)
			);
				await exitScript(0);
			}

			await ensureRunDir();
			if (state.artifact_sync_pending && !state.verification_pending) {
				state = await reconcilePendingArtifactSync(state);
			}
			const latest = buildStatusSummary(state);
			const status = latest.status || "blocked";
			const metric =
				MODE === "implement"
				? `Complete ${latest.percent_complete ?? "unknown"}%`
				: `Confidence ${latest.confidence_percent ?? "unknown"}%`;
		printHeadline(latest.iteration ?? 0, status, [metric]);
		console.log(JSON.stringify(latest, null, 2));
		await exitScript(0);
	}

		if (FORCE_FRESH_RUN && !STATUS_ONLY) {
			await fs.rm(RUN_DIR, { recursive: true, force: true });
		}
		await ensureRunDir();
		state ||= initialState();
	state = await resolvePendingVerification(state);
	state = await reconcilePendingArtifactSync(state);

	const inputText = await fs.readFile(INPUT_PATH, "utf8");

	if (state.last_status === "complete" && state.last_result) {
		await sendStateNotificationOnce(
			state,
			`complete_${state.iteration}`,
			MODE === "plan" ? `${INPUT_NAME} plan ready` : MODE === "implement" ? `${INPUT_NAME} complete` : `${INPUT_NAME} audit ready`,
			buildCompleteMessage(state, state.last_result)
		);
		if (MODE === "implement" && AUTO_AUDIT_AFTER_IMPLEMENT) {
			await sendStateNotificationOnce(
				state,
				`audit_started_${state.iteration}`,
				`${INPUT_NAME} audit started`,
				buildMarkdownNotification(`${INPUT_NAME} audit started`, {
					facts: [
						formatFact("Mode", "audit"),
						formatFact("Source", "automatic handoff from implementation"),
						formatFact("Run dir", `\`${getRunDir(MODES.audit.runDirRoot, INPUT_PATH)}\``)
					]
				})
			);
			console.log(JSON.stringify(buildFinalOutput("complete", state.last_result), null, 2));
			console.log("Implementation complete. Starting audit...");
			await exitScript(await runAuditAfterImplementation());
		}
		console.log(JSON.stringify(buildFinalOutput("complete", state.last_result), null, 2));
		await exitScript(0);
	}

	if (state.iteration >= MAX_ITERS) {
		await sendStateNotificationOnce(
			state,
			"max_iterations_reached",
			`${INPUT_NAME} max iterations reached`,
			buildMaxItersMessage(state)
		);
		printHeadline(state.iteration, "max iters", [
			MODE === "implement"
				? `Complete ${state.last_result?.percent_complete ?? "unknown"}%`
				: `Confidence ${state.current_confidence ?? "unknown"}%`
		]);
		console.error(`State already reached MAX_ITERS=${MAX_ITERS}.`);
		await exitScript(2);
	}

	for (let iteration = state.iteration + 1; iteration <= MAX_ITERS; iteration++) {
		const currentArtifactText = CURRENT_ARTIFACT_PATH ? await readTextIfExists(CURRENT_ARTIFACT_PATH) : null;
		const lastMessagePath = path.join(RUN_DIR, `last-message-${iteration}.json`);
		const prompt = buildPrompt(inputText, currentArtifactText, state, iteration);
		const args = iteration === 1 && state.iteration === 0 ? buildExecArgs(lastMessagePath) : buildResumeArgs(lastMessagePath);

		const { result } = await runCodexWithFallback(args, prompt, lastMessagePath);

		validateResult(result);

		state.iteration = iteration;
		state.notification_flags ||= {};
		state.verification_pending = null;
		state.artifact_sync_pending = false;

		if (MODE === "plan") {
			state.last_result = result;
			state.last_status = result.status;
			state.current_confidence = result.confidence_percent;
			state.recommendations = result.recommendations || [];
			state.artifact_sync_pending = Boolean(CURRENT_ARTIFACT_PATH);
		} else if (MODE === "implement") {
			state.last_result = result;
			state.last_status = result.status === "complete" ? "verifying" : result.status;
			state.prior_remaining_work = result.remaining_work || [];
			state.verify_failures = [];
			state.verification_pending = result.status === "complete" ? { iteration, result } : null;
		} else {
			state.last_result = result;
			state.last_status = result.status === "complete" ? "verifying" : result.status;
			state.current_confidence = result.confidence_percent;
			state.recommendations = result.recommendations || [];
			state.remaining_work = result.remaining_work || [];
			state.verify_failures = [];
			state.verification_pending = result.status === "complete" ? { iteration, result } : null;
			state.artifact_sync_pending = Boolean(CURRENT_ARTIFACT_PATH);
		}

		await persistState(state);

		if (state.artifact_sync_pending && !(MODE === "audit" && result.status === "complete")) {
			await writeCurrentArtifact(resultArtifactText(result), iteration);
			state.artifact_sync_pending = false;
			await persistState(state);
		}

		await sendMilestoneNotifications(state);

		if (result.status === "blocked") {
			printIterationHeadline(iteration, result);
			await sendStateNotificationOnce(
				state,
				`blocked_${state.iteration}`,
				`${INPUT_NAME} blocked`,
				buildBlockedMessage(state)
			);
			console.log(JSON.stringify(buildFinalOutput("blocked", result), null, 2));
			await exitScript(3);
		}

		if (result.status === "complete") {
			if (MODE === "implement" || MODE === "audit") {
				printHeadline(iteration, "verifying", [
					MODE === "implement"
						? `Complete ${result.percent_complete}%`
						: `Confidence ${result.confidence_percent}%`
					]);

					state = await resolvePendingVerification(state);
					if (state.last_status !== "complete") {
						printHeadline(iteration, "in_progress", [
						MODE === "implement"
							? `Complete ${result.percent_complete}%`
							: `Confidence ${result.confidence_percent}%`,
						colorize("Verification failed", ANSI.bold, ANSI.red)
						]);
						continue;
					}
					state = await reconcilePendingArtifactSync(state);
				}

			printIterationHeadline(iteration, result);
			await sendStateNotificationOnce(
				state,
				`complete_${state.iteration}`,
				MODE === "plan" ? `${INPUT_NAME} plan ready` : MODE === "implement" ? `${INPUT_NAME} complete` : `${INPUT_NAME} audit ready`,
				buildCompleteMessage(state, result)
			);
			if (MODE === "implement" && AUTO_AUDIT_AFTER_IMPLEMENT) {
				await sendStateNotificationOnce(
					state,
					`audit_started_${state.iteration}`,
					`${INPUT_NAME} audit started`,
					buildMarkdownNotification(`${INPUT_NAME} audit started`, {
						facts: [
							formatFact("Mode", "audit"),
							formatFact("Source", "automatic handoff from implementation"),
							formatFact("Run dir", `\`${getRunDir(MODES.audit.runDirRoot, INPUT_PATH)}\``)
						]
					})
				);
				console.log(JSON.stringify(buildFinalOutput("complete", result), null, 2));
				console.log("Implementation complete. Starting audit...");
				await exitScript(await runAuditAfterImplementation());
			}
			console.log(JSON.stringify(buildFinalOutput("complete", result), null, 2));
			await exitScript(0);
		}

		printIterationHeadline(iteration, result);
	}

	await sendStateNotificationOnce(
		state,
		"max_iterations_reached",
		`${INPUT_NAME} max iterations reached`,
		buildMaxItersMessage(state)
	);
	printHeadline(state.iteration, "max iters", [
		MODE === "implement"
			? `Complete ${state.last_result?.percent_complete ?? "unknown"}%`
			: `Confidence ${state.current_confidence ?? "unknown"}%`
	]);
	console.error(`Exceeded MAX_ITERS=${MAX_ITERS}.`);
	await exitScript(2);
	} catch (error) {
		if (error instanceof ControlledExit) {
			process.exitCode = error.code;
		} else {
		const title = error?.isCodexCliError ? `${INPUT_NAME} codex cli error` : `${INPUT_NAME} error`;
		await sendNotification(
			title,
			buildMarkdownNotification(title, {
				sections: [formatCodeSection("Error", error instanceof Error ? error.message : String(error))]
			})
		);
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
		}
	}
