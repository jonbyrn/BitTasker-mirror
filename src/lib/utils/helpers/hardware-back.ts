/**
 * Close an in-page screen from the Android hardware back button and from browser history.
 * The listener is removed when the screen closes.
 */
export function bindHardwareBack(onBack: () => void): { back: () => void; stop: () => void } {
	let stopped = false;
	let popped = false;
	let removeApp: (() => Promise<void>) | undefined;

	const onPop = () => {
		if (popped || stopped) return;
		popped = true;
		onBack();
	};

	const back = () => {
		if (popped || stopped) return;
		popped = true;
		onBack();
		if (history.state?.buyWithCard) history.back();
	};

	try {
		history.pushState({ buyWithCard: true }, '');
		window.addEventListener('popstate', onPop);
	} catch {
		// History is unavailable. The on-screen Back button still closes the screen.
	}

	void import('@capacitor/app')
		.then(async ({ App }) => {
			if (stopped) return;
			const handle = await App.addListener('backButton', () => back());
			if (stopped) {
				await handle.remove();
				return;
			}
			removeApp = () => handle.remove();
		})
		.catch(() => {
			// A normal browser has no hardware back button.
		});

	return {
		back,
		stop: () => {
			stopped = true;
			window.removeEventListener('popstate', onPop);
			void removeApp?.();
			if (!popped && history.state?.buyWithCard) {
				popped = true;
				history.back();
			}
		}
	};
}
