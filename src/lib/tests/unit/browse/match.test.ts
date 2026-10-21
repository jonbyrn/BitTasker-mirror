import { describe, expect, it } from 'vitest';
import { availableWorkers, matchesBrowse, workerMatches } from '$lib/browse/match';
import type { StaffJob, StaffSeat } from '$lib/staffing/types';

const filters = {
	query: '',
	categoryId: '',
	maxPrice: 0,
	location: '',
	mode: '' as const,
	date: ''
};

describe('browse filters', () => {
	it('matches text, category, price, place, mode, and date', () => {
		const row = {
			title: 'Saturday floor staff',
			text: 'black shoes',
			categoryId: 'hospitality',
			price: 25,
			location: 'Austin, TX',
			mode: 'local' as const,
			date: '2026-11-02'
		};
		expect(matchesBrowse(row, { ...filters, query: 'floor' })).toBe(true);
		expect(matchesBrowse(row, { ...filters, categoryId: 'retail' })).toBe(false);
		expect(matchesBrowse(row, { ...filters, maxPrice: 20 })).toBe(false);
		expect(matchesBrowse(row, { ...filters, location: 'austin' })).toBe(true);
		expect(matchesBrowse(row, { ...filters, mode: 'remote' })).toBe(false);
		expect(matchesBrowse(row, { ...filters, date: '2026-12-01' })).toBe(false);
	});

	it('lists workers who have taken a shift and filters them', () => {
		const jobs = [
			{
				id: 'job-1',
				role: 'hospitality',
				title: 'Floor',
				requirements: '',
				location: 'Austin',
				date: '2026-11-02',
				startTime: '09:00',
				endTime: '17:00',
				days: 1,
				headcount: 1,
				hourlyRateUsd: 25,
				businessPubkey: 'a'.repeat(64),
				status: 'open',
				createdAt: 1
			}
		] as StaffJob[];
		const seats = [
			{
				id: 'seat-1',
				jobId: 'job-1',
				workerPubkey: 'b'.repeat(64),
				workerName: 'Sam',
				businessPubkey: 'a'.repeat(64),
				status: 'approved',
				workerRating: 5,
				checkInAt: '',
				checkOutAt: '',
				hoursWorked: 8,
				approvedHours: 8,
				escrowUsd: 200,
				releaseUsd: 200,
				contractId: '',
				contractStatus: '',
				disputeNote: '',
				businessRating: 0,
				businessNote: '',
				workerNote: '',
				favourite: true,
				createdAt: 1
			},
			{
				id: 'seat-2',
				jobId: 'job-1',
				workerPubkey: 'c'.repeat(64),
				workerName: 'No',
				businessPubkey: 'a'.repeat(64),
				status: 'declined',
				workerRating: 0,
				checkInAt: '',
				checkOutAt: '',
				hoursWorked: 0,
				approvedHours: 0,
				escrowUsd: 0,
				releaseUsd: 0,
				contractId: '',
				contractStatus: '',
				disputeNote: '',
				businessRating: 0,
				businessNote: '',
				workerNote: '',
				favourite: false,
				createdAt: 1
			}
		] as StaffSeat[];
		const workers = availableWorkers(jobs, seats);
		expect(workers.map((worker) => worker.name)).toEqual(['Sam']);
		expect(workers[0].roles).toEqual(['hospitality']);
		expect(workers[0].rating).toBe(5);
		expect(workerMatches(workers[0], { query: 'sam', categoryId: 'hospitality' })).toBe(true);
		expect(workerMatches(workers[0], { query: '', categoryId: 'retail' })).toBe(false);
	});
});
