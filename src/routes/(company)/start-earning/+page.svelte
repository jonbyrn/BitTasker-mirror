<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import DocumentTitle from '$lib/components/seo/DocumentTitle.svelte';
	import { resolve } from '$app/paths';
	import { t } from 'svelte-i18n';

	let { data: seo } = $props();
</script>

<svelte:head>
	<DocumentTitle fallback={seo.title} />
	<meta name="description" content={seo.description} />
	<meta name="author" content="BitTasker" />
	<meta name="robots" content="index, follow" />
	<link rel="canonical" href={seo.canonical} />
</svelte:head>

<div class="w-full">
	<section class="hero bg-base-100 text-base-content min-h-[40vh] pb-12">
		<div class="hero-content flex-col text-center">
			<Logo />
			<div class="max-w-3xl px-4">
				<h1>{$t('start_earning.title')}</h1>
				<p class="text-base-content/80 py-6 text-lg">{$t('start_earning.lead')}</p>
				<p class="text-base-content/80 text-lg">{$t('start_earning.payments')}</p>
			</div>
		</div>
	</section>

	<div class="mx-auto my-16 max-w-xl px-6">
		<ul class="space-y-4 text-lg">
			<li>
				<a class="link" href={resolve('/auth/signup')}>{$t('start_earning.onboarding')}</a>
			</li>
			<li>
				<a class="link" href={resolve('/tasks')}>{$t('start_earning.tasks')}</a>
			</li>
			<li>
				<a class="link" href={resolve('/browse/staff')}>{$t('start_earning.staff')}</a>
			</li>
			<li>
				<a class="link" href={resolve('/browse/goods')}>{$t('start_earning.goods')}</a>
			</li>
		</ul>
	</div>
</div>
