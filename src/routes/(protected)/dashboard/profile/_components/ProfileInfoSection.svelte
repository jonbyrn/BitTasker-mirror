<script lang="ts">
	import { profileStore } from '$lib/stores/profile.store';
	import { t } from 'svelte-i18n';

	let { formatDate, yearsFrom } = $props<{
		formatDate: (date: string) => string;
		yearsFrom: (date: string) => number;
	}>();
</script>

<!-- Profile Info Section -->
<div class="mb-8 flex-1">
	{#if $profileStore.isLoading}
		<div class="space-y-6">
			<div class="animate-pulse space-y-4">
				<div class="bg-base-300 h-6 w-48 rounded"></div>
				<div class="bg-base-300 h-4 w-full rounded"></div>
				<div class="bg-base-300 h-4 w-3/4 rounded"></div>
			</div>
		</div>
	{:else if $profileStore.data}
		<!-- About -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.about')}</h3>
			{#if $profileStore.data.about}
				<p class="text-base-content/70 line-clamp-2 whitespace-pre-line">
					{$profileStore.data.about}
				</p>
			{:else}
				<p class="text-base-content/70 line-clamp-2">{$t('profile.noDescription')}</p>
			{/if}
		</div>

		<!-- Skills Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.skills.title')}</h3>
			{#if $profileStore.data.skills && $profileStore.data.skills.length > 0}
				<div class="grid gap-4 md:grid-cols-2">
					{#each $profileStore.data.skills as skill}
						<div class="flex w-full flex-wrap items-center justify-between">
							<div class="flex items-center gap-2">
								<span>{skill.name}</span>
								<small
									class="badge badge-sm pb-[2px] {skill.verificationStatus === 'verified'
										? 'badge-success'
										: skill.verificationStatus === 'pending'
											? 'badge-warning'
											: 'badge-ghost badge-outline'}"
								>
									{skill.verificationStatus}
								</small>
							</div>
							<div class="rating rating-sm w-full">
								{#each Array(5) as _, i}
									<input
										type="radio"
										class="mask mask-star-2 bg-orange-400"
										checked={i + 1 === skill.level}
										disabled
									/>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="alert alert-outline rounded-xl">{$t('profile.noSkills')}</p>
			{/if}
		</div>

		<!-- Certifications Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.certifications')}</h3>
			{#if $profileStore.data.certifications && $profileStore.data.certifications.length > 0}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					{#each $profileStore.data.certifications as cert}
						<div class="card bg-base-200 flex flex-row items-center justify-start rounded-xl">
							<img src={cert.fileUrl} alt={cert.name} class="h-full w-20 rounded-lg object-cover" />
							<div class="card-body p-4">
								<div class="flex items-start justify-between">
									<h4 class="card-title text-base">{cert.name}</h4>
									{#if cert.verified}
										<div class="badge badge-success">{$t('profile.verified')}</div>
									{:else}
										<div class="badge badge-warning text-black">{$t('profile.unverified')}</div>
									{/if}
								</div>
								<p class="text-base-content/70 text-sm">{cert.issuer}</p>
								<p class="text-sm">
									<span class="text-base-content/70">{$t('profile.since')} </span>
									{formatDate(cert.date)}
									<span class="text-base-content/70"
										>({yearsFrom(cert.date)} {$t('profile.years')})</span
									>
								</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert alert-outline rounded-xl">
					<span>{$t('profile.noCertifications')}</span>
				</div>
			{/if}
		</div>

		<!-- Portfolio Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.portfolio.title')}</h3>
			{#if $profileStore.data.portfolio && $profileStore.data.portfolio.length > 0}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					{#each $profileStore.data.portfolio as item}
						<div class="card bg-base-200 rounded-xl">
							<div class="card-body p-4">
								<h4 class="card-title">
									{item.title}
									<span class="badge pb-[4px]">
										{formatDate(item.completionDate)}
									</span>
								</h4>
								<p class="my-2 line-clamp-4">{item.description}</p>
								{#if item.images && item.images.length > 0}
									<div class="carousel w-full rounded-lg">
										{#each item.images as image, i}
											<div class="carousel-item w-full" id="slide-{item.id}-{i}">
												<img src={image.url} alt={image.alt} class="h-48 w-full object-cover" />
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="alert alert-outline rounded-xl">
					<span>{$t('profile.noPortfolio')}</span>
				</div>
			{/if}
		</div>

		<!-- Reviews Section -->
		<div class="mb-8">
			<h3 class="mb-4 text-xl font-semibold">{$t('profile.reviews')}</h3>
			{#if $profileStore.data.reviews && $profileStore.data.reviews.length > 0}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					{#each $profileStore.data.reviews as review}
						<div class="card bg-base-200">
							<div class="card-body p-4">
								<div class="flex items-start justify-between">
									<div class="flex items-center gap-2">
										<div class="avatar placeholder">
											<div class="bg-neutral text-neutral-content w-8 rounded-full">
												{#if review.from?.name}
													<span>{review.from.name.charAt(0)}</span>
												{:else}
													<span>?</span>
												{/if}
											</div>
										</div>
										<div>
											<p class="font-medium">{review.from?.name ?? 'Anonymous'}</p>
											<p class="text-base-content/70 text-xs">{formatDate(review.date)}</p>
										</div>
									</div>
									<div class="rating rating-sm">
										{#each Array(5) as _, i}
											<input
												type="radio"
												class="mask mask-star-2 bg-orange-400"
												checked={i + 1 === review.rating}
												disabled
											/>
										{/each}
									</div>
								</div>
								<p class="mt-2">{review.text}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="card bg-base-200 rounded-lg p-6 text-center">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/30 mx-auto h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
						/>
					</svg>
					<p class="text-base-content/70 mt-4">{$t('profile.noReviews')}</p>
				</div>
			{/if}
		</div>
	{:else if $profileStore.error}
		<div class="alert alert-error alert-outline">
			<span>{$t('profile.loadError')}</span>
		</div>
	{/if}
</div>
