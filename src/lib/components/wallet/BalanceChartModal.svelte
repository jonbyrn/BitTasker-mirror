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
		Filler
	} from 'chart.js';
	import 'chartjs-adapter-date-fns';
	import { walletStore, totalBalances } from '$lib/stores/wallet.store';
	import balanceHistoryService from '$lib/api/services/balanceHistory.service';
	import { formatSats } from '$lib/stores/wallet.store';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';
	import IconClose from '~icons/mdi/close';
	import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYear, subYears, endOfYear, format } from 'date-fns';
	import { formatStandardDate } from '$lib/utils/helpers/dateFormatter';
	import { darkMode } from '$lib/stores/theme.store';

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
	}

	let { isOpen, onClose }: Props = $props();


	let chartCanvas: HTMLCanvasElement | null = $state(null);
	let chartInstance: Chart | null = $state(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Date range options
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
		sats: number | null;
		usd: number | null;
	}

	let dailyBalances = $state<DailyBalance[]>([]);

	let balanceHistoryContext = $derived.by(() => {
		const useBscRail =
			$walletStore.activeNetwork === 'bsc' ||
			typeof $walletStore.selectedAsset === 'string' && $walletStore.selectedAsset.toUpperCase() === 'USDT';

		if (useBscRail) {
			return {
				currentAmount: $totalBalances.usdt,
				currentUsd: $totalBalances.usdt,
				provider: $walletStore.bsc.provider,
				address: $walletStore.bsc.address,
				network: 'bsc' as const,
				assetSymbol: 'USDT',
				unitLabel: 'USDT'
			};
		}

		return {
			currentAmount: $totalBalances.sats,
			currentUsd: $totalBalances.usd,
			provider: $walletStore.rsk.provider,
			address: $walletStore.rsk.address,
			network: 'rsk' as const,
			assetSymbol: 'RBTC',
			unitLabel: 'sats'
		};
	});

	function getBalanceAxisLabel(): string {
		return balanceHistoryContext.unitLabel === 'USDT'
			? 'USDT'
			: $t('wallet.balance_chart.chart.sats_axis');
	}

	function getBalanceDatasetLabel(): string {
		return balanceHistoryContext.unitLabel === 'USDT'
			? 'USDT Balance'
			: $t('wallet.balance_chart.chart.bitcoin_balance_label');
	}

	function formatBalanceUnitValue(value: number): string {
		if (balanceHistoryContext.unitLabel === 'USDT') {
			return `${Number(value).toLocaleString('en-US', {
				minimumFractionDigits: 0,
				maximumFractionDigits: 6
			})} USDT`;
		}

		return `${formatSats(Number(value))} ${$t('wallet.balance_chart.chart.tooltip_sats')}`;
	}

	// Get date range based on selection
	function getDateRange(option: DateRangeOption): { start: Date; end: Date } {
		const now = new Date();
		const today = startOfDay(now);

		switch (option) {
			case 'last_7_days':
				return {
					start: startOfDay(subDays(now, 7)),
					end: endOfDay(now)
				};
			case 'last_30_days':
				return {
					start: startOfDay(subDays(now, 30)),
					end: endOfDay(now)
				};
			case 'this_month':
				return {
					start: startOfMonth(now),
					end: endOfDay(now)
				};
			case 'last_month':
				const lastMonth = subDays(startOfMonth(now), 1);
				return {
					start: startOfMonth(lastMonth),
					end: endOfMonth(lastMonth)
				};
			case 'last_90_days':
				return {
					start: startOfDay(subDays(now, 90)),
					end: endOfDay(now)
				};
			case 'year_to_date':
				return {
					start: startOfYear(now),
					end: endOfDay(now)
				};
			case 'last_365_days':
				return {
					start: startOfDay(subDays(now, 365)),
					end: endOfDay(now)
				};
			case 'last_year':
				const lastYear = subYears(now, 1);
				return {
					start: startOfYear(lastYear),
					end: endOfYear(lastYear)
				};
			default:
				return {
					start: startOfDay(subDays(now, 7)),
					end: endOfDay(now)
				};
		}
	}

	// Fetch daily balance data
	async function fetchDailyBalances() {
		if (!isOpen) {
			return;
		}

		const context = balanceHistoryContext;

		if (!context.provider) {
			error = 'Wallet provider not available';
			return;
		}

		if (!context.address) {
			error = 'Wallet address not available';
			return;
		}

		isLoading = true;
		error = null;

		try {
			const { start, end } = getDateRange(selectedRange);
			
			const balances = await balanceHistoryService.getDailyBalances(
				start,
				end,
				context.provider,
				context.address,
				context.currentAmount,
				context.currentUsd,
				context
			);

			const usableBalances = balances.filter(
				(balance) => balance.sats !== null && balance.usd !== null
			) as Array<{ date: Date; sats: number; usd: number }>;

			if (balances.length === 0) {
				error = 'No data available for the selected date range';
				dailyBalances = [];
			} else if (usableBalances.length === 0) {
				error =
					context.unitLabel === 'USDT'
						? 'Historical balance data is temporarily unavailable for USDT on BSC.'
						: 'No data available for the selected date range';
				dailyBalances = [];
			} else {
				dailyBalances = usableBalances;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load balance data';
			dailyBalances = [];
		} finally {
			isLoading = false;
		}
	}

	// Track if this is the first load
	let isFirstLoad = $state(true);

	// Initialize chart when modal opens and canvas is ready
	$effect(() => {
		// Track isOpen and chartCanvas to trigger effect
		const open = isOpen;
		const canvas = chartCanvas;
				
		if (open && canvas && !chartInstance) {
			initializeChart();
			isFirstLoad = true;
		}
	});

	// Fetch data when chart is ready, modal is open, or date range changes
	$effect(() => {
		// Explicitly track dependencies by reading them
		const range = selectedRange;
		const open = isOpen;
		const instance = chartInstance;
		
		if (open && instance && range) {
			// Use a small delay to ensure chart is fully initialized
			const timeoutId = setTimeout(() => {
				// Re-check conditions in case they changed
				if (chartInstance && isOpen && selectedRange === range) {
					fetchDailyBalances();
					isFirstLoad = false;
				} else {
				}
			}, 150);

			return () => {
				clearTimeout(timeoutId);
			};
		}
	});

	// Update chart when data changes or language changes
	$effect(() => {
		// Track locale to update chart when language changes
		const currentLocale = $locale;
		
		if (chartInstance && dailyBalances.length > 0 && !isLoading) {
			updateChart();
		} else if (chartInstance && !isLoading && currentLocale) {
			clearChartData();
			// If chart exists but no data, still update labels when language changes
			updateChartLabels();
		}
	});
	
	// React to theme changes to update chart colors
	$effect(() => {
		$darkMode; // Track theme changes
		if (chartInstance) {
			updateChartLabels();
			chartInstance.update('none');
		}
	});
	
	// Helper function to get theme-aware colors
	function getThemeColors() {
		// Get the actual computed color from CSS variable
		// This will automatically adapt to the current theme
		const computedStyle = getComputedStyle(document.documentElement);
		let textColor = computedStyle.getPropertyValue('--color-base-content').trim();
		
		// If CSS variable is empty or invalid, use fallback based on theme
		if (!textColor || textColor === '') {
			textColor = $darkMode ? '#ffffff' : '#1a1a1a';
		}
		
		// For axis labels, use the same color as text (it will adapt to theme)
		const axisTextColor = textColor;
		
		// Grid color should be subtle and theme-aware
		const gridColor = $darkMode 
			? 'rgba(255, 255, 255, 0.1)'
			: 'rgba(0, 0, 0, 0.1)';
		
		return { textColor, axisTextColor, gridColor };
	}
	
	function updateChartLabels() {
		if (!chartInstance) return;
		
		// Get theme-aware text colors
		const { textColor, axisTextColor, gridColor } = getThemeColors();
		
		// Update axis labels
		const dateAxisLabel = $t('wallet.balance_chart.chart.date_axis');
		const usdAxisLabel = $t('wallet.balance_chart.chart.usd_axis');
		const satsAxisLabel = getBalanceAxisLabel();
		
		// Use type assertion to update scale titles
		const scales = chartInstance.options.scales as any;
		if (scales?.x) {
			scales.x.title = {
				display: true,
				text: dateAxisLabel,
				color: axisTextColor,
				font: {
					size: 13,
					weight: 'bold' as const
				}
			};
			if (scales.x.ticks) {
				scales.x.ticks.color = axisTextColor;
			}
		}
		if (scales?.y) {
			scales.y.title = {
				display: true,
				text: usdAxisLabel,
				color: axisTextColor,
				font: {
					size: 13,
					weight: 'bold' as const
				}
			};
			if (scales.y.ticks) {
				scales.y.ticks.color = axisTextColor;
			}
		}
		if (scales?.y1) {
			scales.y1.title = {
				display: true,
				text: satsAxisLabel,
				color: axisTextColor,
				font: {
					size: 13,
					weight: 'bold' as const
				}
			};
			if (scales.y1.ticks) {
				scales.y1.ticks.color = axisTextColor;
			}
		}
		
		// Update grid colors
		if (scales?.x?.grid) {
			scales.x.grid.color = gridColor;
		}
		if (scales?.y?.grid) {
			scales.y.grid.color = gridColor;
		}
		
		// Update legend colors
		if (chartInstance.options.plugins?.legend?.labels) {
			(chartInstance.options.plugins.legend.labels as any).color = textColor;
		}
		
		// Update dataset labels
		const bitcoinBalanceLabel = getBalanceDatasetLabel();
		const totalUsdLabel = $t('wallet.balance_chart.chart.total_usd_label');
		
		if (chartInstance.data.datasets[0]) {
			chartInstance.data.datasets[0].label = bitcoinBalanceLabel;
		}
		if (chartInstance.data.datasets[1]) {
			chartInstance.data.datasets[1].label = totalUsdLabel;
		}
		
		chartInstance.update('none');
	}

	function clearChartData() {
		if (!chartInstance) return;

		chartInstance.data = {
			datasets: []
		};
		chartInstance.update('none');
	}

	function initializeChart() {
		if (!chartCanvas) {
			return;
		}

		// Get theme-aware text colors
		const { textColor, axisTextColor, gridColor } = getThemeColors();
		
		// Get translations for chart labels
		const dateAxisLabel = $t('wallet.balance_chart.chart.date_axis');
		const usdAxisLabel = $t('wallet.balance_chart.chart.usd_axis');
		const satsAxisLabel = getBalanceAxisLabel();
		
		chartInstance = new Chart(chartCanvas, {
			type: 'bar',
			data: {
				datasets: []
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'index' as const,
					intersect: false
				},
				plugins: {
					legend: {
						display: true,
						position: 'top' as const,
						labels: {
							color: textColor,
							font: {
								size: 12,
								weight: 'bold' as const
							}
						}
					},
					tooltip: {
						backgroundColor: 'rgba(0, 0, 0, 0.8)',
						titleColor: '#ffffff',
						bodyColor: '#ffffff',
						borderColor: 'rgba(255, 255, 255, 0.1)',
						borderWidth: 1,
						padding: 12,
						displayColors: true,
						callbacks: {
							title: function(context) {
								// Format date without time
								if (context.length > 0 && context[0].parsed.x) {
									const date = new Date(context[0].parsed.x);
									const currentLocale = $locale || 'en';
									return formatStandardDate(date, currentLocale);
								}
								return '';
							},
							label: function(context) {
								const datasetLabel = context.dataset.label || '';
								const value = context.parsed.y;
								const tooltipNA = $t('wallet.balance_chart.chart.tooltip_na');
								if (value === null || value === undefined) {
									return `${datasetLabel}: ${tooltipNA}`;
								}
								
								if (context.dataset.yAxisID === 'y1') {
									return `${datasetLabel}: ${formatBalanceUnitValue(Number(value))}`;
								} else if (datasetLabel.includes('USD')) {
									return `${datasetLabel}: $${Number(value).toFixed(2)}`;
								}
								return `${datasetLabel}: ${value}`;
							}
						}
					}
				},
				scales: {
					x: {
						type: 'time',
						time: {
							unit: 'day',
							displayFormats: {
								day: 'MMM d'
							}
						},
						title: {
							display: true,
							text: dateAxisLabel,
							color: axisTextColor,
							font: {
								size: 13,
								weight: 'bold' as const
							}
						},
						ticks: {
							color: axisTextColor,
							font: {
								size: 11
							}
						},
						grid: {
							color: gridColor
						}
					},
					y: {
						type: 'linear',
						position: 'left',
						title: {
							display: true,
							text: usdAxisLabel,
							color: axisTextColor,
							font: {
								size: 13,
								weight: 'bold' as const
							}
						},
						ticks: {
							color: axisTextColor,
							font: {
								size: 11
							},
							callback: function(value) {
								return `$${Number(value).toFixed(2)}`;
							}
						},
						grid: {
							color: gridColor
						}
					},
					y1: {
						type: 'linear',
						position: 'right',
						title: {
							display: true,
							text: satsAxisLabel,
							color: axisTextColor,
							font: {
								size: 13,
								weight: 'bold' as const
							}
						},
						ticks: {
							color: axisTextColor,
							font: {
								size: 11
							},
							callback: function(value) {
								if (balanceHistoryContext.unitLabel === 'USDT') {
									return Number(value).toLocaleString('en-US', {
										minimumFractionDigits: 0,
										maximumFractionDigits: 6
									});
								}
								return formatSats(Number(value));
							}
						},
						grid: {
							drawOnChartArea: false
						}
					}
				}
			}
		});
	}

	function updateChart() {
		if (!chartInstance) return;

		const chartBalances = dailyBalances.filter(
			(balance): balance is { date: Date; sats: number; usd: number } =>
				balance.sats !== null && balance.usd !== null
		);

		if (chartBalances.length === 0) {
			console.warn('[BalanceChartModal] No balance data to display');
			return;
		}

		// Prepare data - Chart.js time scale expects {x: Date, y: number} format
		const chartData = chartBalances.map(b => ({
			x: b.date, // Date object for time scale
			y: b.sats
		}));

		const usdChartData = chartBalances.map(b => ({
			x: b.date, // Date object for time scale
			y: b.usd
		}));

		// Get translations for dataset labels
		const bitcoinBalanceLabel = getBalanceDatasetLabel();
		const totalUsdLabel = $t('wallet.balance_chart.chart.total_usd_label');
		
		chartInstance.data = {
			datasets: [
				{
					type: 'bar',
					label: bitcoinBalanceLabel,
					data: chartData as any, // Type assertion for Chart.js time scale
					backgroundColor: '#FF9315', // Bitcoin orange
					yAxisID: 'y1',
					order: 2
				},
				{
					type: 'line',
					label: totalUsdLabel,
					data: usdChartData as any, // Type assertion for Chart.js time scale
					borderColor: '#10b981', // Green
					backgroundColor: 'rgba(16, 185, 129, 0.1)', // Green with opacity for fill
					fill: true,
					tension: 0.4,
					yAxisID: 'y',
					order: 1,
					pointRadius: 0,
					pointHoverRadius: 5
				}
			]
		};

		chartInstance.update('none'); // Use 'none' mode for smoother updates
	}

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
			isFirstLoad = true; // Reset first load flag when modal closes
		}
	});
</script>

{#if isOpen}
	<!-- BalanceChartModal: isOpen={isOpen} -->
	<div class="modal modal-open">
		<div
			class="modal-box max-w-4xl max-h-[85vh] p-0 bg-base-100 flex flex-col"
		>
			<div class="flex flex-col flex-1 min-h-0">
				<!-- Header -->
				<div class="flex items-center justify-between p-4 border-b border-base-300 shrink-0">
					<h3 class="text-lg font-bold">{$t('wallet.balance_chart.title')}</h3>
					<button
						class="btn btn-sm btn-circle btn-ghost"
						onclick={() => {
							triggerHaptic(ImpactStyle.Light);
							onClose();
						}}
						aria-label={$t('common.close')}
					>
						<IconClose class="h-5 w-5" />
					</button>
				</div>

				<!-- Content -->
				<div class="flex-1 flex flex-col p-6 min-h-0 overflow-auto">
					<!-- Date Range Selector -->
					<div class="mb-4">
						<label for="date-range-select" class="label">
							<span class="label-text font-semibold">{$t('wallet.balance_chart.date_range')}</span>
						</label>
						<select
							id="date-range-select"
							class="select select-bordered w-full rounded-lg"
							bind:value={selectedRange}
							onchange={(e) => {
								const newValue = (e.target as HTMLSelectElement).value as DateRangeOption;
								// bind:value should update selectedRange, but ensure it's set
								selectedRange = newValue;
								
								// If chart isn't initialized yet, try to initialize it first
								if (!chartInstance && chartCanvas && isOpen) {
									initializeChart();
								}
								
								// Fetch data if chart is ready
								if (chartInstance && isOpen) {
									fetchDailyBalances();
								}
							}}
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
					<div class="flex-1 min-h-0 relative">
						{#if isLoading}
							<div class="absolute inset-0 flex items-center justify-center bg-base-100 z-10">
								<div class="flex flex-col items-center gap-4">
									<span class="loading loading-spinner loading-lg"></span>
									<p class="text-base-content/70">{$t('common.loading')}</p>
								</div>
							</div>
						{:else if error}
							<div class="absolute inset-0 flex items-center justify-center bg-base-100 z-10">
								<div class="alert alert-error">
									<span>{error}</span>
								</div>
							</div>
						{:else if dailyBalances.length === 0}
							<div class="absolute inset-0 flex items-center justify-center bg-base-100 z-10">
								<div class="text-base-content/70">{$t('wallet.balance_chart.no_data')}</div>
							</div>
						{/if}
						<!-- Always render canvas so chart can be initialized -->
						<div class="h-full min-h-[400px]">
							<canvas bind:this={chartCanvas}></canvas>
						</div>
					</div>
				</div>
			</div>
		</div>
		<!-- Modal backdrop -->
		<form method="dialog" class="modal-backdrop">
			<button onclick={() => {
				triggerHaptic(ImpactStyle.Light);
				onClose();
			}}>close</button>
		</form>
	</div>
{/if}
