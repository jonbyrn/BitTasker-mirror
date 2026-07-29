import { describe, it, expect, beforeEach } from 'vitest';
import { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import NDK from '@nostr-dev-kit/ndk';
import type { Attachment } from '$lib/types/task';

describe('NDKContractStatus completionText', () => {
	let ndk: NDK;
	let status: NDKContractStatus;

	beforeEach(() => {
		ndk = new NDK({});
		status = new NDKContractStatus(ndk);
	});

	describe('getter/setter behavior', () => {
		it('should return undefined when completionText is not set', () => {
			expect(status.completionText).toBeUndefined();
		});

		it('should store and retrieve a simple completion text', () => {
			status.completionText = 'Work completed successfully';
			expect(status.completionText).toBe('Work completed successfully');
		});

		it('should store and retrieve an empty string', () => {
			status.completionText = '';
			expect(status.completionText).toBe('');
		});

		it('should handle special characters in completion text', () => {
			const text = 'Work completed! Task #123: "Test & <Validation>"';
			status.completionText = text;
			expect(status.completionText).toBe(text);
		});

		it('should handle multiline completion text', () => {
			const text = 'Line 1\nLine 2\nLine 3';
			status.completionText = text;
			expect(status.completionText).toBe(text);
		});

		it('should overwrite previous value when set again', () => {
			status.completionText = 'First text';
			status.completionText = 'Second text';
			expect(status.completionText).toBe('Second text');
		});

		it('should remove tag when set to undefined', () => {
			status.completionText = 'Some text';
			expect(status.completionText).toBe('Some text');
			status.completionText = undefined;
			expect(status.completionText).toBeUndefined();
		});

		it('should handle JSON-resilient text (no JSON parsing needed for string)', () => {
			// completionText is stored as plain string, not JSON
			status.completionText = 'Plain text without JSON';
			expect(status.completionText).toBe('Plain text without JSON');
		});
	});

	describe('coexistence with completionAttachments', () => {
		it('should store completionText alongside completionAttachments', () => {
			status.completionText = 'Task completed via file upload';
			const attachments: Attachment[] = [
				{
					key: 'screenshot',
					url: 'https://example.com/screenshot.png',
					type: 'image/png',
					alt: 'screenshot',
					size: 1024
				}
			];
			status.completionAttachments = attachments;

			expect(status.completionText).toBe('Task completed via file upload');
			expect(status.completionAttachments).toEqual(attachments);
		});

		it('should handle only completionText (no attachments)', () => {
			status.completionText = 'Completed with text only';
			expect(status.completionText).toBe('Completed with text only');
			expect(status.completionAttachments).toBeUndefined();
		});

		it('should handle only attachments (no text)', () => {
			const attachments: Attachment[] = [
				{
					key: 'proof',
					url: 'https://example.com/proof.pdf',
					type: 'application/pdf',
					alt: 'proof',
					size: 2048
				}
			];
			status.completionAttachments = attachments;
			expect(status.completionAttachments).toEqual(attachments);
			expect(status.completionText).toBeUndefined();
		});
	});

	describe('defensive coding', () => {
		it('should handle undefined gracefully in getter', () => {
			// Raw tag value that doesn't exist should return undefined
			expect(status.tagValue('completionText')).toBeUndefined();
			expect(status.completionText).toBeUndefined();
		});

		it('should handle empty string tag value', () => {
			// Manually add empty tag to simulate edge case
			status.tags.push(['completionText', '']);
			expect(status.completionText).toBe('');
		});

		it('should not fail JSON.stringify on empty string', () => {
			// Empty string should be stored as-is, not JSON-stringified
			status.completionText = '';
			expect(status.completionText).toBe('');
		});
	});
});
