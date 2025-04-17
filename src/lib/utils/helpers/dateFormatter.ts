/**
 * Format a date to a readable string
 * @param date - The date to format
 * @returns Formatted date string in locale format
 */
export function formatDate(date: Date): string {
	try {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	} catch (error) {
		console.error('Error formatting date:', error);
		return 'Invalid date';
	}
}

/**
 * Convert a date to a relative time string (e.g., "2 days ago")
 * @param date - The date to format
 * @returns Relative time string
 */
export function timeAgo(date: Date): string {
	try {
		const now = new Date();
		const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (isNaN(diffInSeconds)) {
			return 'Invalid date';
		}

		// Define time intervals
		const minute = 60;
		const hour = minute * 60;
		const day = hour * 24;
		const week = day * 7;
		const month = day * 30;
		const year = day * 365;

		// Calculate the appropriate time ago format
		if (diffInSeconds < minute) {
			return diffInSeconds === 1 ? '1 second ago' : `${diffInSeconds} seconds ago`;
		} else if (diffInSeconds < hour) {
			const minutes = Math.floor(diffInSeconds / minute);
			return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
		} else if (diffInSeconds < day) {
			const hours = Math.floor(diffInSeconds / hour);
			return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
		} else if (diffInSeconds < week) {
			const days = Math.floor(diffInSeconds / day);
			return days === 1 ? '1 day ago' : `${days} days ago`;
		} else if (diffInSeconds < month) {
			const weeks = Math.floor(diffInSeconds / week);
			return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
		} else if (diffInSeconds < year) {
			const months = Math.floor(diffInSeconds / month);
			return months === 1 ? '1 month ago' : `${months} months ago`;
		} else {
			const years = Math.floor(diffInSeconds / year);
			return years === 1 ? '1 year ago' : `${years} years ago`;
		}
	} catch (error) {
		console.error('Error calculating time ago:', error);
		return 'Unknown time ago';
	}
}
