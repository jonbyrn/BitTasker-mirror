<script lang="ts">
	import type { SwiperProps } from '$lib/types/props';
	import { onDestroy, onMount } from 'svelte';
	import { Autoplay, Navigation, Pagination } from 'swiper/modules';
	import Swiper from 'swiper';
	import 'swiper/css';
	import 'swiper/css/navigation';
	import 'swiper/css/pagination';

	let {
		items = $bindable([]),
		loop = false,
		slidesPerView = 'auto',
		spaceBetween = 16,
		centeredSlides = false,
		autoPlay = false,
		autoPlayDuration = 3000,
		additionalSlides = 0,
		initialSlide = 0,
		currentIndex = $bindable(initialSlide),
		swiperStyle = '',
		children,
		dots,
		lastEl
	}: SwiperProps = $props();

	let swiper: Swiper = $state() as Swiper;

	function initSwiper() {
		if (swiper) {
			swiper.destroy(true, true);
		}

		swiper = new Swiper('.swiper', {
			init: false,
			loop,
			spaceBetween,
			slidesPerView,
			initialSlide,
			centeredSlides,
			autoHeight: true,
			allowTouchMove: true,
			allowSlideNext: true,
			allowSlidePrev: true,
			simulateTouch: true,
			slideToClickedSlide: true,
			touchEventsTarget: 'wrapper',
			pagination: {
				el: '.swiper-pagination',
				clickable: true
			},
			navigation: {
				nextEl: '.swiper-button-next',
				prevEl: '.swiper-button-prev'
			},
			autoplay: autoPlay
				? {
						pauseOnMouseEnter: true,
						disableOnInteraction: false,
						delay: autoPlayDuration
					}
				: false,
			mousewheel: {
				invert: true
			},
			breakpoints: {
				768: {
					slidesPerView:
						typeof slidesPerView === 'number' ? slidesPerView + additionalSlides : slidesPerView,
					spaceBetween: 0
				}
			},
			on: {
				slideChange: () => {
					currentIndex = swiper.realIndex;
				}
			},
			modules: [Autoplay, Navigation, Pagination]
		});

		swiper.init();
	}

	// Watch for changes in items
	$effect(() => {
		if (items) {
			// Wait for the DOM to update - Also prevents memory leaks
			setTimeout(() => {
				initSwiper();
			}, 0);
		}
	});

	onMount(() => {
		initSwiper();
		return () => {
			if (swiper) {
				swiper.destroy(true, true);
			}
		};
	});

	onDestroy(() => {
		if (swiper) {
			swiper.destroy(true, true);
		}
	});

	export const swiperMethods = {
		stopAutoPlay: () => swiper?.autoplay?.stop(),
		startAutoPlay: () => swiper?.autoplay?.start(),
		slideToIndex: (index: number) => swiper?.slideTo(index, 200, false),
		next: () => swiper?.slideNext(),
		prev: () => swiper?.slidePrev(200)
	};
</script>

<div class="swiper" style={swiperStyle}>
	<div class="swiper-wrapper">
		{#if items.length > 0}
			{#each items as item, index}
				{@render children?.({ item, index, swiper })}
			{/each}
		{/if}
		{@render lastEl?.({ swiper })}
	</div>
	<!-- <div class="swiper-pagination"></div>
	<div class="swiper-button-prev"></div>
	<div class="swiper-button-next"></div> -->
</div>
{#if !loop}
	{@render dots?.({
		currentIndex,
		pagesCount: items.length,
		slideToIndex: swiperMethods.slideToIndex
	})}
{/if}
