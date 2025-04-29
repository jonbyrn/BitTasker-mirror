<script lang="ts">
	import type { SwiperProps } from '$lib/types/props';
	import { onDestroy, onMount } from 'svelte';
	import { Autoplay, Navigation, Pagination } from 'swiper/modules';
	import Swiper from 'swiper';
	import 'swiper/css';
	import 'swiper/css/navigation';
	import 'swiper/css/pagination';

	let {
		items = [],
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

	const swiper = new Swiper('.swiper', {
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

	onMount(() => {
		swiper.init();
		return () => {
			swiper.destroy();
		};
	});

	onDestroy(() => {
		swiper.destroy();
	});

	export const swiperMethods = {
		stopAutoPlay: () => swiper.autoplay.stop(),
		startAutoPlay: () => swiper.autoplay.start(),
		slideToIndex: (index: number) => swiper.slideTo(index, 200, false),
		next: () => swiper.slideNext(),
		prev: () => swiper.slidePrev(200)
	};
</script>

<div class="swiper" style={swiperStyle}>
	<div class="swiper-wrapper">
		{#each items as item, index}
			{@render children?.({ item, index, swiper })}
		{/each}
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
