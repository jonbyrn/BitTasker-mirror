<script lang="ts">
	import { t } from 'svelte-i18n';
	import { taskStore as store } from '$lib/stores/task.store';
	import { isQvacEnabled } from '$lib/services/feature-flags';
	import { draftTask, transcribeAudio, QvacError, type QvacDraft } from '$lib/qvac/client';
	import { taskPatchFromDraft } from '$lib/qvac/apply';

	let rough = $state('');
	let busy = $state<'write' | 'voice' | ''>('');
	let recording = $state(false);
	let errorKey = $state('');
	let range = $state<QvacDraft | null>(null);
	let recorder: MediaRecorder | null = null;
	let recordTimer = 0;

	const enabled = $derived(isQvacEnabled());

	function messageKey(code: string): string {
		if (code === 'too_long') return 'common.qvac.too_long';
		if (code === 'unavailable' || code === 'disabled') return 'common.qvac.unavailable';
		if (code === 'voice_unsupported') return 'common.qvac.voice_unsupported';
		return 'common.qvac.failed';
	}

	function apply(draft: QvacDraft) {
		store.updateTask(taskPatchFromDraft(draft, $store.task.budget));
		range = draft;
		errorKey = '';
	}

	async function write() {
		if (busy) return;
		busy = 'write';
		errorKey = '';
		try {
			apply(await draftTask(rough));
		} catch (error) {
			errorKey = error instanceof QvacError ? error.code : 'failed';
		} finally {
			busy = '';
		}
	}

	function stopRecording() {
		recorder?.stop();
	}

	async function speak() {
		if (busy) return;
		if (recording) {
			stopRecording();
			return;
		}
		if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
			errorKey = 'voice_unsupported';
			return;
		}
		errorKey = '';
		let stream: MediaStream;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			errorKey = 'failed';
			return;
		}
		const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
			? 'audio/webm;codecs=opus'
			: '';
		let rec: MediaRecorder;
		try {
			rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
		} catch {
			stream.getTracks().forEach((track) => track.stop());
			errorKey = 'voice_unsupported';
			return;
		}
		const chunks: Blob[] = [];
		rec.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		const stopped = new Promise<Blob>((resolve) => {
			rec.onstop = () => {
				stream.getTracks().forEach((track) => track.stop());
				window.clearTimeout(recordTimer);
				recording = false;
				recorder = null;
				resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
			};
		});
		recorder = rec;
		recording = true;
		rec.start();
		recordTimer = window.setTimeout(() => rec.stop(), 60_000);
		busy = 'voice';
		try {
			const audio = await stopped;
			const text = await transcribeAudio(audio);
			if (!text) throw new QvacError('failed');
			apply(await draftTask(text));
		} catch (error) {
			errorKey = error instanceof QvacError ? error.code : 'failed';
		} finally {
			busy = '';
			recording = false;
		}
	}
</script>

{#if enabled}
	<section class="bg-base-200 space-y-3 rounded-lg p-4" data-testid="qvac-task-writer">
		<label class="label" for="qvac-rough">
			<span class="label-text font-medium">{$t('common.qvac.rough_label')}</span>
		</label>
		<textarea
			id="qvac-rough"
			class="textarea textarea-bordered w-full"
			rows="3"
			maxlength="4000"
			placeholder={$t('common.qvac.rough_placeholder')}
			bind:value={rough}
		></textarea>
		<div class="flex flex-col gap-2 sm:flex-row">
			<button
				type="button"
				class="btn btn-primary"
				data-testid="qvac-write"
				disabled={busy !== ''}
				onclick={write}
			>
				{busy === 'write' ? $t('common.qvac.writing') : $t('common.qvac.help_write')}
			</button>
			<button
				type="button"
				class="btn btn-lg {recording ? 'btn-error' : 'btn-secondary'}"
				data-testid="qvac-voice"
				disabled={busy === 'write'}
				onclick={speak}
			>
				{#if recording}
					{$t('common.qvac.voice_stop')}
				{:else if busy === 'voice'}
					{$t('common.qvac.voice_working')}
				{:else}
					{$t('common.qvac.voice')}
				{/if}
			</button>
		</div>
		{#if range}
			<p class="text-sm" data-testid="qvac-price-range">
				{$t('common.qvac.price_range', { values: { low: range.priceLow, high: range.priceHigh } })}
			</p>
		{/if}
		{#if errorKey}
			<p class="text-error text-sm" data-testid="qvac-error">{$t(messageKey(errorKey))}</p>
		{/if}
		<p class="text-base-content/60 text-xs">{$t('common.qvac.privacy')}</p>
	</section>
{/if}
