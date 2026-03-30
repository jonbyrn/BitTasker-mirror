import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ReviewSummaryCard from '../ReviewSummaryCard.svelte';
import type { ReviewStats } from '$lib/types/review';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	const translations: Record<string, string> = {
		'reviews.summary.title': 'Review Summary',
		'reviews.summary.average_rating': 'Average Rating',
		'reviews.summary.total_reviews': 'Total Reviews',
		'reviews.summary.reviews_received': 'Reviews received',
		'reviews.summary.rating_distribution': 'Rating Distribution',
		'reviews.summary.category_averages': 'Category Averages',
		'reviews.summary.taskee_categories': 'As a Taskee',
		'reviews.summary.tasker_categories': 'As a Tasker',
		'reviews.summary.empty_title': 'No reviews yet',
		'reviews.summary.empty_description':
			'Published reviews will appear here once this account has feedback.',
		'reviews.summary.category_unavailable':
			'Role-based category scores will appear after matching reviews are submitted.',
		'reviews.form.work_quality': 'Work Quality',
		'reviews.form.experience': 'Experience',
		'reviews.form.delivery_speed': 'Delivery Speed',
		'reviews.form.communication': 'Communication',
		'reviews.form.clarity': 'Clarity',
		'reviews.form.payment_timeliness': 'Payment Timeliness'
	};

	return {
		t: readable((key: string) => translations[key] ?? key)
	};
});

function createBaseStats(): ReviewStats {
	return {
		totalReviews: 0,
		recentReviewsCount: 0,
		averageRating: 0,
		averageQuality: 0,
		averageProfessionalism: 0,
		averageTimeliness: 0,
		ratingDistribution: {
			1: 0,
			2: 0,
			3: 0,
			4: 0,
			5: 0
		}
	};
}

describe('ReviewSummaryCard', () => {
	it('renders a real empty state instead of zero-value charts', () => {
		const { container } = render(ReviewSummaryCard, {
			props: {
				stats: createBaseStats()
			}
		});

		expect(screen.getByText('Review Summary')).toBeInTheDocument();
		expect(screen.getByText('No reviews yet')).toBeInTheDocument();
		expect(
			screen.getByText('Published reviews will appear here once this account has feedback.')
		).toBeInTheDocument();
		expect(screen.queryByText('Rating Distribution')).not.toBeInTheDocument();
		expect(screen.queryByText('Category Averages')).not.toBeInTheDocument();
		expect(container.querySelector('.stat')).toBeNull();
	});

	it('uses consistent rating tones for category bars', () => {
		const stats: ReviewStats = {
			...createBaseStats(),
			totalReviews: 6,
			averageRating: 4.2,
			ratingDistribution: {
				1: 0,
				2: 1,
				3: 1,
				4: 2,
				5: 2
			},
			averageWorkQuality: 4.8,
			averageExperience: 3.7,
			averageDeliverySpeed: 2.6
		};

		render(ReviewSummaryCard, {
			props: {
				stats,
				revieweeRole: 'taskee'
			}
		});

		expect(screen.getByTestId('category-bar-work-quality')).toHaveAttribute('data-tone', 'success');
		expect(screen.getByTestId('category-bar-experience')).toHaveAttribute('data-tone', 'warning');
		expect(screen.getByTestId('category-bar-delivery-speed')).toHaveAttribute('data-tone', 'error');
		expect(screen.getByText('Rating Distribution')).toBeInTheDocument();
		expect(screen.getByText('Category Averages')).toBeInTheDocument();
	});

	it('explains when role-based category data is unavailable', () => {
		const stats: ReviewStats = {
			...createBaseStats(),
			totalReviews: 2,
			recentReviewsCount: 1,
			averageRating: 4,
			averageQuality: 4,
			averageProfessionalism: 4,
			averageTimeliness: 4,
			ratingDistribution: {
				1: 0,
				2: 0,
				3: 0,
				4: 2,
				5: 0
			}
		};

		render(ReviewSummaryCard, {
			props: {
				stats
			}
		});

		expect(
			screen.getByText(
				'Role-based category scores will appear after matching reviews are submitted.'
			)
		).toBeInTheDocument();
	});

	it('renders both role groups when mixed review role stats are available', () => {
		const stats: ReviewStats = {
			...createBaseStats(),
			totalReviews: 8,
			recentReviewsCount: 3,
			averageRating: 4.3,
			ratingDistribution: {
				1: 0,
				2: 0,
				3: 2,
				4: 2,
				5: 4
			},
			averageWorkQuality: 4.6,
			averageExperience: 4.1,
			averageDeliverySpeed: 3.8,
			averageCommunication: 4.5,
			averageClarity: 4.2,
			averagePaymentTimeliness: 3.9
		};

		render(ReviewSummaryCard, {
			props: {
				stats
			}
		});

		expect(screen.getByText('As a Taskee')).toBeInTheDocument();
		expect(screen.getByText('As a Tasker')).toBeInTheDocument();
		expect(screen.getByTestId('category-bar-work-quality')).toBeInTheDocument();
		expect(screen.getByTestId('category-bar-communication')).toBeInTheDocument();
	});
});
