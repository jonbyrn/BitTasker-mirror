/**
 * Format a date to a relative time string (e.g., "2m", "5h", "2d")
 * @param date - The date to format
 * @returns Relative time string in short format
 */
export function formatTimeAgo(date: Date): string {
	try {
		const now = new Date();
		const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (isNaN(diffInSeconds)) {
			return 'Invalid';
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
			return 'now';
		} else if (diffInSeconds < hour) {
			const minutes = Math.floor(diffInSeconds / minute);
			return `${minutes}m`;
		} else if (diffInSeconds < day) {
			const hours = Math.floor(diffInSeconds / hour);
			return `${hours}h`;
		} else if (diffInSeconds < week) {
			const days = Math.floor(diffInSeconds / day);
			return `${days}d`;
		} else if (diffInSeconds < month) {
			const weeks = Math.floor(diffInSeconds / week);
			return `${weeks}w`;
		} else if (diffInSeconds < year) {
			const months = Math.floor(diffInSeconds / month);
			return `${months}mo`;
		} else {
			const years = Math.floor(diffInSeconds / year);
			return `${years}y`;
		}
	} catch (error) {
		console.error('Error calculating time ago:', error);
		return 'Invalid';
	}
}
