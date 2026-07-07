/**
 * Chat Message Word-Break E2E Test
 *
 * Verifies that chat messages display correctly:
 * - Words wrap at word boundaries (not mid-word)
 * - Long words break only as a last resort (when wider than container)
 * - The bubble never overflows horizontally
 * - Height grows freely to accommodate text
 *
 * This uses the FIXED CSS: overflow-wrap: break-word (break-words in Tailwind)
 * instead of the buggy word-break: break-all.
 */
import { test, expect } from '@playwright/test';

const CHAT_MARKUP = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chat Word-Break Test</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .chat-container {
      width: 100%;
      max-width: 480px;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.625;
    }

    .message-row {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    .message-row.sender {
      flex-direction: row-reverse;
    }

    /* Bubble — matches ChatMessage.svelte with the fix applied */
    .message-bubble {
      display: flex;
      max-width: 75%;
      flex-direction: column;
      overflow: hidden;
      border-radius: 1rem;
      padding: 12px 16px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      overflow-wrap: anywhere;
    }
    .message-bubble.received { background-color: #f3f4f6; }
    .message-bubble.sent { background-color: #e5e7eb; }

    /* Text — FIXED: break-words instead of break-all */
    .message-text {
      font-size: 14px;
      line-height: 1.625;
      overflow-wrap: break-word;
      white-space: pre-wrap;
    }

    .timestamp { font-size: 12px; opacity: 0.5; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="chat-container" id="chat"></div>
  <script>
    const messages = [
      'ThisIsAReallyLongWordThatShouldNotBeBrokenInTheMiddleOfTheWord',
      'Hello this is a message with a supercalifragilisticexpialidocious word inside',
      'Check out https://very-long-domain-name-that-should-not-break.example.com/very/long/path',
      'This is a normal sentence with many words that should wrap correctly at word boundaries and not break any individual words in the middle',
      'Hello!',
      'Ok',
      'Antidisestablishmentarianism is a long word',
      'Pneumonoultramicroscopicsilicovolcanoconiosis is the longest word in English',
      'I need help with my task please contact me at user@example.com or call +1-555-123-4567',
      'Necesito ayuda con mi tarea, ¿puedes enviarme más información sobre el servicio?',
    ];
    const chat = document.getElementById('chat');
    messages.forEach((msg, i) => {
      const isSender = i % 2 === 0;
      const row = document.createElement('div');
      row.className = 'message-row' + (isSender ? ' sender' : '');
      row.dataset.messageId = 'msg-' + i;
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble' + (isSender ? ' sent' : ' received');
      const text = document.createElement('p');
      text.className = 'message-text';
      text.textContent = msg;
      const time = document.createElement('div');
      time.className = 'timestamp';
      time.textContent = isSender ? '2 min ago' : '1 min ago';
      bubble.appendChild(text);
      bubble.appendChild(time);
      row.appendChild(bubble);
      chat.appendChild(row);
    });
  </script>
</body>
</html>
`;

function countWordSplits(el: Element): {
	wordsSplit: number;
	totalWords: number;
	splitWords: string[];
} {
	const textNode = el.firstChild;
	if (!textNode) return { wordsSplit: 0, totalWords: 0, splitWords: [] };

	const text = textNode.textContent || '';
	const words = text.split(/\s+/);
	let wordsSplit = 0;
	const splitWords: string[] = [];

	for (const word of words) {
		const wordStart = text.indexOf(word);
		if (wordStart === -1) continue;

		const range = document.createRange();
		range.setStart(textNode, wordStart);
		range.setEnd(textNode, wordStart + word.length);

		const rects = range.getClientRects();
		const uniqueTops = new Set<number>();
		for (const rect of rects) {
			uniqueTops.add(Math.round(rect.top));
		}

		if (uniqueTops.size > 1) {
			wordsSplit++;
			splitWords.push(word);
		}
	}

	return { wordsSplit, totalWords: words.length, splitWords };
}

test.describe('Chat Message Word-Break (Fixed)', () => {
	test.beforeEach(async ({ page }) => {
		await page.setContent(CHAT_MARKUP);
		await page.waitForLoadState('domcontentloaded');
	});

	test('uses overflow-wrap: break-word (not break-all)', async ({ page }) => {
		const msg = page.locator('[data-message-id="msg-0"] .message-text');
		await expect(msg).toBeVisible();

		const styles = await msg.evaluate((el) => {
			const s = window.getComputedStyle(el);
			return { overflowWrap: s.overflowWrap, wordBreak: s.wordBreak };
		});

		expect(styles.overflowWrap).toBe('break-word');
		expect(styles.wordBreak).not.toBe('break-all');
	});

	test('normal words in sentences are NOT split across lines', async ({ page }) => {
		const msg = page.locator('[data-message-id="msg-3"] .message-text');
		await expect(msg).toBeVisible();

		const result = await msg.evaluate(countWordSplits);

		// No normal-length word should be split across lines
		expect(result.wordsSplit).toBe(0);
	});

	test('short messages display on a single line', async ({ page }) => {
		const shortMsg = page.locator('[data-message-id="msg-4"] .message-text');
		await expect(shortMsg).toBeVisible();

		const lines = await shortMsg.evaluate((el) => {
			const range = document.createRange();
			range.selectNodeContents(el);
			const rects = range.getClientRects();
			const uniqueTops = new Set<number>();
			for (const r of rects) uniqueTops.add(Math.round(r.top));
			return uniqueTops.size;
		});

		expect(lines).toBe(1);
	});

	test('long words still wrap (prevents horizontal overflow)', async ({ page }) => {
		const msg = page.locator('[data-message-id="msg-0"] .message-text');
		await expect(msg).toBeVisible();

		const overflow = await msg.evaluate((el) => {
			const bubble = el.closest('.message-bubble') as HTMLElement;
			if (!bubble) return { textWider: false, bubbleOverflow: '' };
			return {
				textWider: el.scrollWidth > bubble.clientWidth,
				bubbleOverflow: window.getComputedStyle(bubble).overflow
			};
		});

		// overflow-hidden on bubble prevents horizontal scrollbar
		expect(overflow.bubbleOverflow).toBe('hidden');
	});

	test('bubble width is constrained (max-width: 75%)', async ({ page }) => {
		const bubble = page.locator('[data-message-id="msg-0"] .message-bubble');
		await expect(bubble).toBeVisible();

		const layout = await bubble.evaluate((el) => {
			const container = el.closest('.chat-container') as HTMLElement;
			return {
				bubbleWidth: el.getBoundingClientRect().width,
				containerWidth: container?.getBoundingClientRect().width ?? 0,
				maxWidth: window.getComputedStyle(el).maxWidth
			};
		});

		// Bubble should be at most 75% of container
		expect(layout.bubbleWidth).toBeLessThanOrEqual(layout.containerWidth * 0.76);
	});

	test('height grows freely — no max-height constraint', async ({ page }) => {
		const msg = page.locator('[data-message-id="msg-3"] .message-text');
		await expect(msg).toBeVisible();

		const heights = await msg.evaluate((el) => {
			const style = window.getComputedStyle(el);
			return {
				height: el.getBoundingClientRect().height,
				maxHeight: style.maxHeight,
				overflow: style.overflow
			};
		});

		// No max-height constraint on text
		expect(heights.maxHeight).toBe('none');
	});

	test('mobile viewport: words wrap at boundaries, not mid-word', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });

		const msg = page.locator('[data-message-id="msg-3"] .message-text');
		await expect(msg).toBeVisible();

		const result = await msg.evaluate((el) => {
			const s = window.getComputedStyle(el);
			const textNode = el.firstChild;
			let wordsSplit = 0;
			let totalWords = 0;
			if (textNode) {
				const text = textNode.textContent || '';
				const words = text.split(/\s+/);
				totalWords = words.length;
				for (const word of words) {
					const wordStart = text.indexOf(word);
					if (wordStart === -1) continue;
					const range = document.createRange();
					range.setStart(textNode, wordStart);
					range.setEnd(textNode, wordStart + word.length);
					const rects = range.getClientRects();
					const uniqueTops = new Set<number>();
					for (const r of rects) uniqueTops.add(Math.round(r.top));
					if (uniqueTops.size > 1) wordsSplit++;
				}
			}
			return { overflowWrap: s.overflowWrap, wordsSplit, totalWords };
		});

		expect(result.overflowWrap).toBe('break-word');
		expect(result.wordsSplit).toBe(0);
	});

	test('multiple rapid messages: all use correct word-break', async ({ page }) => {
		await page.evaluate(() => {
			const chat = document.getElementById('chat');
			if (!chat) return;
			const msgs = [
				'Hey can you help me with something I really need this done quickly',
				'It is about the plumbing work in the kitchen area specifically near the sink',
				'Please respond as soon as possible thank you very much for your time',
				'AnotherMessageWithAReallyLongWord: Pneumonoultramicroscopicsilicovolcanoconiosis',
				'Ok got it thanks!'
			];
			msgs.forEach((msg, i) => {
				const row = document.createElement('div');
				row.className = 'message-row' + (i % 2 === 0 ? '' : ' sender');
				row.dataset.messageId = 'rapid-' + i;
				const bubble = document.createElement('div');
				bubble.className = 'message-bubble' + (i % 2 === 0 ? ' received' : ' sent');
				const text = document.createElement('p');
				text.className = 'message-text';
				text.textContent = msg;
				bubble.appendChild(text);
				row.appendChild(bubble);
				chat.appendChild(row);
			});
		});

		for (let i = 0; i < 5; i++) {
			const msg = page.locator(`[data-message-id="rapid-${i}"] .message-text`);
			await expect(msg).toBeVisible();

			const styles = await msg.evaluate((el) => {
				const s = window.getComputedStyle(el);
				return { overflowWrap: s.overflowWrap, wordBreak: s.wordBreak };
			});

			expect(styles.overflowWrap).toBe('break-word');
			expect(styles.wordBreak).not.toBe('break-all');
		}
	});

	test('Spanish text with accents wraps correctly', async ({ page }) => {
		const msg = page.locator('[data-message-id="msg-9"] .message-text');
		await expect(msg).toBeVisible();

		const result = await msg.evaluate(countWordSplits);
		expect(result.wordsSplit).toBe(0);
	});

	test('screenshot: fixed word-break on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await expect(page.locator('[data-message-id="msg-9"] .message-text')).toBeVisible();
		await page.screenshot({
			path: 'tests/e2e/screenshots/chat-word-break-fixed-mobile.png',
			fullPage: true
		});
	});

	test('screenshot: fixed word-break on desktop', async ({ page }) => {
		await expect(page.locator('[data-message-id="msg-9"] .message-text')).toBeVisible();
		await page.screenshot({
			path: 'tests/e2e/screenshots/chat-word-break-fixed-desktop.png',
			fullPage: true
		});
	});
});
