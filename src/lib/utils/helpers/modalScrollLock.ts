import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { appScrollContainer } from '$lib/stores/scrollContainer.store';

/**
 * Locks background scroll while schedule pickers (calendar/time) are open.
 * Ref-counted on the app scroll shell + body/html so closing one modal does not
 * break another overlay that also locked scroll.
 *
 * Also locks `[data-drawer-scroll-lock]` panels (Drawer content) — they scroll
 * independently of the app shell, so schedule modals on top of a drawer must
 * freeze the drawer panel too.
 */
export function acquireScheduleModalScrollLock(): () => void {
	if (!browser) {
		return () => {};
	}

	document.body.classList.add('overflow-hidden');
	document.documentElement.classList.add('overflow-hidden');

	const el = get(appScrollContainer);
	if (el) {
		const n = Number(el.dataset.scheduleModalLockCount ?? '0');
		if (n === 0) {
			el.dataset.scheduleModalOverflowPrev = el.style.overflowY || '';
			el.style.overflowY = 'hidden';
		}
		el.dataset.scheduleModalLockCount = String(n + 1);
	}

	const drawerCleanups: (() => void)[] = [];
	for (const panel of document.querySelectorAll<HTMLElement>('[data-drawer-scroll-lock]')) {
		const n = Number(panel.dataset.scheduleModalDrawerLockCount ?? '0');
		if (n === 0) {
			panel.dataset.scheduleModalDrawerOverflowPrev = panel.style.overflowY || '';
			panel.dataset.scheduleModalDrawerTouchPrev = panel.style.touchAction || '';
			panel.style.overflowY = 'hidden';
			panel.style.touchAction = 'none';
		}
		panel.dataset.scheduleModalDrawerLockCount = String(n + 1);
		drawerCleanups.push(() => {
			const n2 = Number(panel.dataset.scheduleModalDrawerLockCount ?? '0');
			const next = Math.max(0, n2 - 1);
			panel.dataset.scheduleModalDrawerLockCount = String(next);
			if (next === 0) {
				panel.style.overflowY = panel.dataset.scheduleModalDrawerOverflowPrev ?? '';
				panel.style.touchAction = panel.dataset.scheduleModalDrawerTouchPrev ?? '';
				delete panel.dataset.scheduleModalDrawerOverflowPrev;
				delete panel.dataset.scheduleModalDrawerTouchPrev;
				delete panel.dataset.scheduleModalDrawerLockCount;
			}
		});
	}

	return () => {
		document.body.classList.remove('overflow-hidden');
		document.documentElement.classList.remove('overflow-hidden');

		for (const fn of drawerCleanups) {
			fn();
		}

		const el2 = get(appScrollContainer);
		if (!el2) {
			return;
		}
		const n = Number(el2.dataset.scheduleModalLockCount ?? '0');
		const next = Math.max(0, n - 1);
		el2.dataset.scheduleModalLockCount = String(next);
		if (next === 0) {
			el2.style.overflowY = el2.dataset.scheduleModalOverflowPrev ?? '';
			delete el2.dataset.scheduleModalOverflowPrev;
			delete el2.dataset.scheduleModalLockCount;
		}
	};
}
