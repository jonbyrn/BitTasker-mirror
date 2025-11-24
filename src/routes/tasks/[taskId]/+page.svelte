<script lang="ts">
	import { page } from '$app/stores';
	import { t, locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import TaskDetailsView from '$lib/components/task/TaskDetailsView.svelte';
	import { authState } from '$lib/stores/auth.store';
	import { devicePlatform } from '$lib/stores/device.store';
	import { page as pageState } from '$app/state';
	import { sections } from '$lib/utils/consts';
	import WarningProvider from '$lib/components/WarningProvider.svelte';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import { browser } from '$app/environment';
	// Icon imports for unplugin-icons
	import IconFormatListBulleted from '~icons/mdi/format-list-bulleted';
	import IconPlusCircleOutline from '~icons/mdi/plus-circle-outline';
	import IconMagnify from '~icons/mdi/magnify';
	import IconInvoiceTextSendOutline from '~icons/mdi/invoice-text-send-outline';
	import IconFileSign from '~icons/mdi/file-sign';
	import IconWalletOutline from '~icons/mdi/wallet-outline';
	import IconAccount from '~icons/mdi/account';
	import IconChatOutline from '~icons/mdi/chat-outline';
	import IconCog from '~icons/mdi/cog';

	// Get taskId from route params and SEO data
	const taskId = $page.params.taskId;
	const seo = $page.data.seo;
	const task = seo?.task;

	// Check if user is logged in
	const isLoggedIn = $derived($authState.isAuthenticated);

	// Update meta tags dynamically based on user's current language
	// This ensures the preview shows in the language of the user who is sharing
	$effect(() => {
		if (!browser || !task || !seo) return;
		
		const userLang = $locale || 'en';
		
		// Get translation for current user language
		const translation = taskTranslationService.getStoredTranslation(task, userLang);
		
		// Use translated content if available, otherwise use original
		const taskTitle = translation?.translatedTitle || task.title || 'Untitled Task';
		const taskDescription = translation?.translatedDescription || task.description || 'No description available';
		const taskBudget = task.budget?.amount ? `$${task.budget.amount}` : 'Price not specified';
		const taskLocation = task.pickupLocation?.displayName || task.dropOffLocation?.displayName || 'Remote';
		
		// Truncate description for meta tags
		const truncatedDescription = taskDescription.length > 150 
			? taskDescription.substring(0, 147) + '...' 
			: taskDescription;

		// Update meta tags dynamically
		const updateMetaTag = (property: string, content: string) => {
			let meta = document.querySelector(`meta[property="${property}"]`);
			if (!meta) {
				meta = document.createElement('meta');
				meta.setAttribute('property', property);
				document.head.appendChild(meta);
			}
			meta.setAttribute('content', content);
		};

		// Update title
		document.title = `${taskTitle} - ${taskBudget} - BitTasker`;
		
		// Update description meta
		const descMeta = document.querySelector('meta[name="description"]');
		if (descMeta) {
			descMeta.setAttribute('content', `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation}`);
		}

		// Update Open Graph tags
		updateMetaTag('og:title', `${taskTitle} - ${taskBudget} - BitTasker`);
		updateMetaTag('og:description', `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation}`);
		
		// Update Twitter tags
		updateMetaTag('twitter:title', `${taskTitle} - ${taskBudget} - BitTasker`);
		updateMetaTag('twitter:description', `${truncatedDescription} | Budget: ${taskBudget} | Location: ${taskLocation}`);
	});

	// Dashboard layout state
	let width = $state(375);
	let activeSection = $state('');

	// Icon mapping function for dynamic icon rendering
	function getIconComponent(iconName: string) {
		const iconMap = {
			'mdi:format-list-bulleted': IconFormatListBulleted,
			'mdi:plus-circle-outline': IconPlusCircleOutline,
			'mdi:magnify': IconMagnify,
			'mdi:invoice-text-send-outline': IconInvoiceTextSendOutline,
			'mdi:file-sign': IconFileSign,
			'mdi:wallet-outline': IconWalletOutline,
			'mdi:account': IconAccount,
			'mdi:chat-outline': IconChatOutline,
			'mdi:cog': IconCog
		};
		return iconMap[iconName as keyof typeof iconMap] || IconFormatListBulleted;
	}

	// Update active section based on URL
	$effect(() => {
		const path = pageState.url.pathname;
		
		// Only set active section if we're on a dashboard route
		if (path.includes('/dashboard/')) {
			const section = path.split('/dashboard/')[1] || '';
			const tabParam = pageState.url.searchParams.get('tab');
			
			// Handle special cases for tab-based navigation
			if (tabParam === 'bids') {
				activeSection = 'bids-sent';
			} else if (tabParam === 'contracts') {
				activeSection = 'contracts';
			} else {
				activeSection = section;
			}
		} else {
			// Not on a dashboard route, don't highlight any menu item
			activeSection = 'none';
		}
	});
</script>

<svelte:head>
	<title>{seo?.title || $t('dashboard.task_details_by_task.page_title')}</title>
	<meta
		name="description"
		content={seo?.description || $t('dashboard.task_details_by_task.page_description')}
	/>
	<meta name="keywords" content={seo?.keywords || ''} />
	<link rel="canonical" href={seo?.canonical || ''} />

	<!-- Open Graph / Facebook -->
	{#if seo}
		<meta property="og:type" content="website" />
		<meta property="og:url" content={seo.canonical} />
		<meta property="og:title" content={seo.ogTitle} />
		<meta property="og:description" content={seo.ogDescription} />
		<meta property="og:image" content={seo.ogImage} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:site_name" content="BitTasker" />

		<!-- Twitter -->
		<meta property="twitter:card" content="summary_large_image" />
		<meta property="twitter:url" content={seo.canonical} />
		<meta property="twitter:title" content={seo.twitterTitle} />
		<meta property="twitter:description" content={seo.twitterDescription} />
		<meta property="twitter:image" content={seo.twitterImage} />
		<meta property="twitter:site" content="@BitTaskerdotcom" />
		<meta property="twitter:creator" content="@BitTaskerdotcom" />

		<!-- Structured Data -->
		{#if seo.jsonLd}
			{@html `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`}
		{/if}
	{/if}
</svelte:head>

<svelte:window bind:innerWidth={width} />

{#if isLoggedIn}
	<!-- Dashboard layout for logged-in users -->
	<WarningProvider>
		<div class="bg-base-200 mx-auto flex h-full w-full flex-row gap-8 px-2 md:py-4">
			{#if $devicePlatform !== 'ios' && $devicePlatform !== 'android' && width >= 1200}
				<!-- Fixed Sidebar - Only on desktop -->
				<div class="w-full flex-shrink-0 md:w-64">
					<div class="fixed top-24 left-8 z-10 w-56">
						<div class="card bg-base-100 rounded-xl shadow-xl">
							<div class="card-body p-4">
								<ul class="menu bg-base-100 rounded-box w-full">
									{#each sections as section}
										<li class="my-1">
											<a
												data-sveltekit-reload="off"
												href={section.id === 'bids-sent' ? '/dashboard?tab=bids' : section.id === 'contracts' ? '/dashboard?tab=contracts' : `/dashboard/${section.id}`}
												class:menu-active={activeSection === section.id}
												class="flex items-center gap-3"
											>
												{#if section.icon === 'mdi:format-list-bulleted'}
													<IconFormatListBulleted class="text-primary" />
												{:else if section.icon === 'mdi:plus-circle-outline'}
													<IconPlusCircleOutline class="text-primary" />
												{:else if section.icon === 'mdi:magnify'}
													<IconMagnify class="text-primary" />
												{:else if section.icon === 'mdi:invoice-text-send-outline'}
													<IconInvoiceTextSendOutline class="text-primary" />
												{:else if section.icon === 'mdi:file-sign'}
													<IconFileSign class="text-primary" />
												{:else if section.icon === 'mdi:wallet-outline'}
													<IconWalletOutline class="text-primary" />
												{:else if section.icon === 'mdi:account'}
													<IconAccount class="text-primary" />
												{:else if section.icon === 'mdi:chat-outline'}
													<IconChatOutline class="text-primary" />
												{:else if section.icon === 'mdi:cog'}
													<IconCog class="text-primary" />
												{:else}
													<IconFormatListBulleted class="text-primary" />
												{/if}
												{$t(section.label)}
											</a>
										</li>
									{/each}
								</ul>
							</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Main Content with left margin for fixed sidebar -->
			<div class="min-h-0 w-full flex-1">
				<TaskDetailsView {taskId} showShareButton={true} />
			</div>
		</div>
	</WarningProvider>
{:else}
	<!-- Simple layout for non-logged-in users -->
	<TaskDetailsView {taskId} showShareButton={true} />
{/if}

