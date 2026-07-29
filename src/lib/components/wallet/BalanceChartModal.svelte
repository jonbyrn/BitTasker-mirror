<script lang="ts">
	import { onDestroy } from 'svelte';
	import { t, locale } from 'svelte-i18n';
	import {
		Chart,
		CategoryScale,
		LinearScale,
		TimeScale,
		BarController,
		LineController,
		BarElement,
		LineElement,
		PointElement,
		Tooltip,
		Legend,
		Filler,
		type ChartData
	} from 'chart.js';
	import 'chartjs-adapter-date-fns';
	import { walletStore, totalBalances } from '$lib/stores/wallet.store';
	import { formatSats } from '$lib/stores/wallet.store';
	import {
		startOfDay,
		endOfDay,
		subDays,
		startOfMonth,
		endOfMonth,
		startOfYear,
		subYears,
		endOfYear
	} from 'date-fns';
	import { formatStandardDate } from '$lib/utils/helpers/dateFormatter';
	import { darkMode } from '$lib/stores/theme.store';
	import balanceHistoryService from '$lib/api/services/balanceHistory.service';
	import IconClose from '~icons/mdi/close';

	type ChartScales = Record<
		string,
		{
			title?: Record<string, unknown>;
			ticks?: { color?: string };
			grid?: { color?: string };
		}
	>;

	// Register Chart.js components
	Chart.register(
		CategoryScale,
		LinearScale,
		TimeScale,
		BarController,
		LineController,
		BarElement,
		LineElement,
		PointElement,
		Tooltip,
		Legend,
		Filler
	);

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		overrideAddress?: string;
		overrideSats?: number;
		overrideUsd?: number;
	}

	let {
		isOpen,
		onClose,
		overrideAddress = '',
		overrideSats = 0,
		overrideUsd = 0
	}: Props = $props();

	let chartCanvas: HTMLCanvasElement | null = $state(null);
	let chartInstance: Chart | null = $state(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	type DateRangeOption =
		| 'last_7_days'
		| 'last_30_days'
		| 'this_month'
		| 'last_month'
		| 'last_90_days'
		| 'year_to_date'
		| 'last_365_days'
		| 'last_year';

	let selectedRange: DateRangeOption = $state('last_7_days');

	interface DailyBalance {
		date: Date;
		sats: number;
		usd: number;
		usdt0: number;
	}

	let dailyBalances = $state<DailyBalance[]>([]);

	function getDateRange(option: DateRangeOption): { start: Date; end: Date } {
		const now = new Date();
		switch (option) {
			case 'last_7_days':
				return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
			case 'last_30_days':
				return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
			case 'this_month':
				return { start: startOfMonth(now), end: endOfDay(now) };
			case 'last_month': {
				const lastMonth = subDays(startOfMonth(now), 1);
				return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
			}
			case 'last_90_days':
				return { start: startOfDay(subDays(now, 90)), end: endOfDay(now) };
			case 'year_to_date':
				return { start: startOfYear(now), end: endOfDay(now) };
			case 'last_365_days':
				return { start: startOfDay(subDays(now, 365)), end: endOfDay(now) };
			case 'last_year': {
				const lastYear = subYears(now, 1);
				return { start: startOfYear(lastYear), end: endOfYear(lastYear) };
			}
			default:
				return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
		}
	}

	async function fetchDailyBalances() {
		if (!isOpen) return;

		const address = overrideAddress || $walletStore.rsk.address;
		if (!address) {
			error = $t('wallet.balance_chart.error_no_address');
			return;
		}

		const provider = $walletStore.rsk.provider;
		isLoading = true;
		error = null;

		try {
			const { start, end } = getDateRange(selectedRange);
			const balances = await balanceHistoryService.getDailyBalances(
				start,
				end,
				provider,
				address,
				overrideAddress ? overrideSats : $totalBalances.sats,
				overrideAddress ? overrideUsd : $totalBalances.usd
			);

			if (balances.length === 0) {
				error = $t('wallet.balance_chart.no_data');
			} else {
				dailyBalances = balances;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : $t('wallet.balance_chart.error_load_failed');
			dailyBalances = [];
		} finally {
			isLoading = false;
		}
	}

	/** Get theme-aware colors from CSS variables */
	function getThemeColors() {
		const computedStyle = getComputedStyle(document.documentElement);
		let textColor = computedStyle.getPropertyValue('--color-base-content').trim();
		if (!textColor) {
			textColor = $darkMode ? '#ffffff' : '#1a1a1a';
		}
		const gridColor = $darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
		return { textColor, gridColor };
	}

	/** Build the shared scale config — used by both initializeChart and updateChartLabels */
	function buildScaleConfig() {
		const { textColor, gridColor } = getThemeColors();
		const dateAxisLabel = $t('wallet.balance_chart.chart.date_axis');
		const usdAxisLabel = $t('wallet.balance_chart.chart.usd_axis');
		const satsAxisLabel = $t('wallet.balance_chart.chart.sats_axis');
		const titleFont = { size: 13, weight: 'bold' as const };

		return {
			scales: {
				x: {
					type: 'time' as const,
					time: { unit: 'day' as const, displayFormats: { day: 'MMM d' } },
					title: { display: true, text: dateAxisLabel, color: textColor, font: titleFont },
					ticks: { color: textColor, font: { size: 11 } },
					grid: { color: gridColor }
				},
				y: {
					type: 'linear' as const,
					position: 'left' as const,
					title: { display: true, text: usdAxisLabel, color: textColor, font: titleFont },
					ticks: {
						color: textColor,
						font: { size: 11 },
						callback: (value: string | number) =>
							'$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
					},
					grid: { color: gridColor }
				},
				y1: {
					type: 'linear' as const,
					position: 'right' as const,
					title: { display: true, text: satsAxisLabel, color: textColor, font: titleFont },
					ticks: {
						color: textColor,
						font: { size: 11 },
						callback: (value: string | number) => {
							const n = Number(value);
							return n >= 1000 ? Math.round(n / 1000) + 'k' : n.toLocaleString();
						}
					},
					grid: { drawOnChartArea: false }
				}
			},
			plugins: {
				legend: {
					display: true,
					position: 'top' as const,
					labels: { color: textColor, font: { size: 12, weight: 'bold' as const } }
				}
			}
		};
	}

	/** Apply current theme + translations to an existing chart instance */
	function applyChartTheme() {
		if (!chartInstance) return;
		const { textColor } = getThemeColors();
		const config = buildScaleConfig();

		// Update scales
		const scales = chartInstance.options.scales as ChartScales;
		for (const key of ['x', 'y', 'y1'] as const) {
			const src = config.scales[key];
			if (scales?.[key]) {
				scales[key].title = src.title as Record<string, unknown>;
				if (scales[key].ticks) scales[key].ticks!.color = textColor;
			}
			if (scales?.[key]?.grid && 'grid' in src) {
				scales[key].grid = src.grid as { color?: string };
			}
		}

		// Update legend
		if (chartInstance.options.plugins?.legend?.labels) {
			(chartInstance.options.plugins.legend.labels as Record<string, unknown>).color = textColor;
		}

		// Update dataset labels
		const labels = [
			$t('wallet.balance_chart.chart.bitcoin_balance_label'),
			$t('wallet.balance_chart.chart.total_usd_label'),
			$t('wallet.balance_chart.chart.usdt_label')
		];
		for (let i = 0; i < labels.length; i++) {
			if (chartInstance.data.datasets[i]) {
				chartInstance.data.datasets[i].label = labels[i];
			}
		}

		chartInstance.update('none');
	}

	function initializeChart() {
		if (!chartCanvas) return;

		const config = buildScaleConfig();

		chartInstance = new Chart(chartCanvas, {
			type: 'bar',
			data: { datasets: [] },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: { mode: 'index' as const, intersect: false },
				plugins: {
					...config.plugins,
					tooltip: {
						backgroundColor: 'rgba(0, 0, 0, 0.8)',
						titleColor: '#ffffff',
						bodyColor: '#ffffff',
						borderColor: 'rgba(255, 255, 255, 0.1)',
						borderWidth: 1,
						padding: 12,
						displayColors: true,
						callbacks: {
							title(context) {
								if (context.length > 0 && context[0].parsed.x) {
									return formatStandardDate(new Date(context[0].parsed.x), $locale || 'en');
								}
								return '';
							},
							label(context) {
								const datasetLabel = context.dataset.label || '';
								const value = context.parsed.y;
								const tooltipNA = $t('wallet.balance_chart.chart.tooltip_na');
								const tooltipSats = $t('wallet.balance_chart.chart.tooltip_sats');

								if (value === null || value === undefined) return `${datasetLabel}: ${tooltipNA}`;
								if (datasetLabel.includes('sats') || datasetLabel.includes('Sats')) {
									return `${datasetLabel}: ${formatSats(Number(value))} ${tooltipSats}`;
								}
								if (datasetLabel.includes('USD') || datasetLabel.includes('$')) {
									return `${datasetLabel}: $${Number(value).toFixed(2)}`;
								}
								return `${datasetLabel}: ${value}`;
							}
						}
					}
				},
				scales: config.scales
			}
		});
	}

	function updateChart() {
		if (!chartInstance || dailyBalances.length === 0) return;

		const bitcoinLabel = $t('wallet.balance_chart.chart.bitcoin_balance_label');
		const totalUsdLabel = $t('wallet.balance_chart.chart.total_usd_label');
		const usdtLabel = $t('wallet.balance_chart.chart.usdt_label');

		chartInstance.data = {
			datasets: [
				{
					type: 'bar',
					label: bitcoinLabel,
					data: dailyBalances.map((b) => ({ x: b.date, y: b.sats })),
					backgroundColor: '#FF9315',
					yAxisID: 'y1',
					order: 3
				},
				{
					type: 'bar',
					label: usdtLabel,
					data: dailyBalances.map((b) => ({ x: b.date, y: b.usdt0 })),
					backgroundColor: '#10b981',
					yAxisID: 'y',
					order: 2
				},
				{
					type: 'line',
					label: totalUsdLabel,
					data: dailyBalances.map((b) => ({ x: b.date, y: b.usd + b.usdt0 })),
					borderColor: '#10b981',
					backgroundColor: 'rgba(16, 185, 129, 0.1)',
					fill: true,
					tension: 0.4,
					yAxisID: 'y',
					order: 1,
					pointRadius: 0,
					pointHoverRadius: 5
				}
			]
		} as unknown as ChartData;

		chartInstance.update('none');
	}

	// Initialize chart when canvas is ready
	$effect(() => {
		if (isOpen && chartCanvas && !chartInstance) {
			initializeChart();
		}
	});

	// Fetch data when chart is ready and range changes
	$effect(() => {
		const range = selectedRange;
		if (isOpen && chartInstance && range) {
			fetchDailyBalances();
		}
	});

	// Update chart theme/labels when data, locale, or theme changes
	$effect(() => {
		const _locale = $locale;
		const _dark = $darkMode;
		if (chartInstance && dailyBalances.length > 0 && !isLoading) {
			updateChart();
		} else if (chartInstance) {
			applyChartTheme();
		}
	});

	// Cleanup on destroy
	onDestroy(() => {
		if (chartInstance) {
			chartInstance.destroy();
			chartInstance = null;
		}
	});

	// Reset when modal closes
	$effect(() => {
		if (!isOpen) {
			if (chartInstance) {
				chartInstance.destroy();
				chartInstance = null;
			}
			dailyBalances = [];
			error = null;
			isLoading = false;
		}
	});
</script>

{#if isOpen}
	<div class="modal modal-open">
		<div class="modal-box bg-base-100 flex max-h-[85vh] max-w-4xl flex-col p-0">
			<div class="flex min-h-0 flex-1 flex-col">
				<!-- Header -->
				<div class="border-base-300 flex shrink-0 items-center justify-between border-b p-4">
					<h3 class="text-lg font-bold">{$t('wallet.balance_chart.title')}</h3>
					<button
						class="btn btn-sm btn-circle btn-ghost"
						onclick={onClose}
						aria-label={$t('common.close')}
					>
						<IconClose class="h-5 w-5" />
					</button>
				</div>

				<!-- Content -->
				<div class="flex min-h-0 flex-1 flex-col overflow-auto p-6">
					<!-- Date Range Selector -->
					<div class="mb-4">
						<label for="date-range-select" class="label">
							<span class="label-text font-semibold">{$t('wallet.balance_chart.date_range')}</span>
						</label>
						<select
							id="date-range-select"
							class="select select-bordered w-full rounded-lg"
							bind:value={selectedRange}
						>
							<option value="last_7_days">{$t('wallet.balance_chart.last_7_days')}</option>
							<option value="last_30_days">{$t('wallet.balance_chart.last_30_days')}</option>
							<option value="this_month">{$t('wallet.balance_chart.this_month')}</option>
							<option value="last_month">{$t('wallet.balance_chart.last_month')}</option>
							<option value="last_90_days">{$t('wallet.balance_chart.last_90_days')}</option>
							<option value="year_to_date">{$t('wallet.balance_chart.year_to_date')}</option>
							<option value="last_365_days">{$t('wallet.balance_chart.last_365_days')}</option>
							<option value="last_year">{$t('wallet.balance_chart.last_year')}</option>
						</select>
					</div>

					<!-- Chart Container -->
					<div class="relative min-h-0 flex-1">
						{#if isLoading}
							<div class="bg-base-100 absolute inset-0 z-10 flex items-center justify-center">
								<div class="flex flex-col items-center gap-4">
									<span class="loading loading-spinner loading-lg"></span>
									<p class="text-base-content/70">{$t('common.loading')}</p>
								</div>
							</div>
						{:else if error}
							<div class="bg-base-100 absolute inset-0 z-10 flex items-center justify-center">
								<div class="alert alert-error">
									<span>{error}</span>
								</div>
							</div>
						{:else if dailyBalances.length === 0}
							<div class="bg-base-100 absolute inset-0 z-10 flex items-center justify-center">
								<div class="text-base-content/70">{$t('wallet.balance_chart.no_data')}</div>
							</div>
						{/if}
						<div class="h-full min-h-[400px]">
							<canvas bind:this={chartCanvas}></canvas>
						</div>
					</div>
				</div>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button onclick={onClose}>close</button>
		</form>
	</div>
{/if}
