import { expect, type Locator, type Page } from '@playwright/test';

export class TasksPage {
	constructor(private readonly page: Page) {}

	get searchInput(): Locator {
		return this.page.getByTestId('tasks-search-input');
	}

	get searchIcon(): Locator {
		return this.page.getByTestId('tasks-search-icon');
	}

	get filtersButton(): Locator {
		return this.page.getByTestId('tasks-filters-button');
	}

	get saveSearchButton(): Locator {
		return this.page.getByTestId('tasks-save-search-button');
	}

	get viewToggleButton(): Locator {
		return this.page.getByTestId('tasks-view-toggle-button');
	}

	get controls(): Locator {
		return this.page.getByTestId('tasks-controls');
	}

	get actionsNav(): Locator {
		return this.page.getByTestId('tasks-actions-nav');
	}

	get scrollContainer(): Locator {
		return this.page.getByTestId('tasks-scroll-container');
	}

	get scrollToTopButton(): Locator {
		return this.page.getByTestId('tasks-scroll-to-top-button');
	}

	get loadingState(): Locator {
		return this.page.getByTestId('tasks-loading-state');
	}

	get listSkeleton(): Locator {
		return this.page.getByTestId('tasks-list-skeleton');
	}

	get errorState(): Locator {
		return this.page.getByTestId('tasks-error-state');
	}

	get errorAlert(): Locator {
		return this.page.getByTestId('tasks-error-alert');
	}

	get noResultsState(): Locator {
		return this.page.getByTestId('tasks-no-results-state');
	}

	get filterDrawer(): Locator {
		return this.page.getByTestId('tasks-filter-drawer');
	}

	get filterDrawerBackdrop(): Locator {
		return this.page.getByTestId('tasks-filter-drawer-backdrop');
	}

	get filterDrawerCloseButton(): Locator {
		return this.page.getByTestId('tasks-filter-drawer-close');
	}

	get taskDrawer(): Locator {
		return this.page.getByTestId('tasks-task-drawer');
	}

	get taskDrawerBackdrop(): Locator {
		return this.page.getByTestId('tasks-task-drawer-backdrop');
	}

	get taskDrawerCloseButton(): Locator {
		return this.page.getByTestId('tasks-task-drawer-close');
	}

	get taskCards(): Locator {
		return this.page.getByTestId('tasks-task-card');
	}

	get firstTaskCard(): Locator {
		return this.taskCards.first();
	}

	get viewTaskButtons(): Locator {
		return this.page.getByTestId('task-card-view-button');
	}

	get firstViewTaskButton(): Locator {
		return this.viewTaskButtons.first();
	}

	get bidButtons(): Locator {
		return this.page.getByTestId('task-card-bid-button');
	}

	get firstEnabledBidButton(): Locator {
		return this.page.locator('[data-testid="task-card-bid-button"]:not([disabled])').first();
	}

	get mapColumn(): Locator {
		return this.page.getByTestId('tasks-map-column').first();
	}

	get mobileMapView(): Locator {
		return this.page.getByTestId('tasks-mobile-map-view');
	}

	async gotoLoggedOut(): Promise<void> {
		await this.page.context().clearCookies();
		await this.page.goto('/tasks', { waitUntil: 'load' });
		await this.waitForShellReady();
	}

	async waitForShellReady(timeout = 12_000): Promise<void> {
		await expect(this.searchInput).toBeVisible({ timeout });
		await expect(this.filtersButton).toBeVisible({ timeout });
	}

	async waitForPrimaryState(timeout = 8_000): Promise<void> {
		await expect
			.poll(
				async () => {
					if (await this.firstTaskCard.isVisible().catch(() => false)) return 'tasks';
					if (await this.noResultsState.isVisible().catch(() => false)) return 'no-results';
					if (await this.errorState.isVisible().catch(() => false)) return 'error';
					if (await this.errorAlert.isVisible().catch(() => false)) return 'error-alert';
					if (await this.loadingState.isVisible().catch(() => false)) return 'loading';
					return 'none';
				},
				{ timeout }
			)
			.not.toBe('none');
	}

	async openFilterDrawer(): Promise<void> {
		await this.filtersButton.click();
		await expect(this.filterDrawer).toBeVisible({ timeout: 12_000 });
	}

	async closeFilterDrawer(): Promise<void> {
		if (await this.filterDrawerCloseButton.isVisible().catch(() => false)) {
			await this.filterDrawerCloseButton.click();
		} else if (await this.filterDrawerBackdrop.isVisible().catch(() => false)) {
			await this.filterDrawerBackdrop.click({ force: true });
		} else {
			await this.page.keyboard.press('Escape');
		}
		await expect(this.filterDrawer).toBeHidden({ timeout: 12_000 });
	}

	async openTaskDrawerFromFirstCard(): Promise<boolean> {
		const hasButton = await this.firstViewTaskButton.isVisible().catch(() => false);
		if (!hasButton) return false;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			await this.firstViewTaskButton.click({ noWaitAfter: true, timeout: 8_000 });
			const opened = await expect
				.poll(async () => this.taskDrawer.isVisible().catch(() => false), { timeout: 6_000 })
				.toBe(true)
				.then(() => true)
				.catch(() => false);
			if (opened) {
				return true;
			}
		}
		return false;
	}

	async closeTaskDrawer(): Promise<void> {
		if (await this.taskDrawerCloseButton.isVisible().catch(() => false)) {
			await this.taskDrawerCloseButton.click();
		} else if (await this.taskDrawerBackdrop.isVisible().catch(() => false)) {
			await this.taskDrawerBackdrop.click({ force: true });
		} else {
			await this.page.keyboard.press('Escape');
		}
		await expect(this.taskDrawer).toBeHidden({ timeout: 12_000 });
	}
}
