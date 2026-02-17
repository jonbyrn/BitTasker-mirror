import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	getInfo: vi.fn().mockResolvedValue({ platform: 'web' }),
	setOverlaysWebView: vi.fn().mockResolvedValue(undefined),
	setBackgroundColor: vi.fn().mockResolvedValue(undefined),
	setStyle: vi.fn().mockResolvedValue(undefined),
	hide: vi.fn().mockResolvedValue(undefined),
	show: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@capacitor/device', () => ({
	Device: { getInfo: () => mocks.getInfo() }
}));

vi.mock('@capacitor/status-bar', () => ({
	StatusBar: {
		setOverlaysWebView: (opts: unknown) => mocks.setOverlaysWebView(opts),
		setBackgroundColor: (opts: unknown) => mocks.setBackgroundColor(opts),
		setStyle: (opts: unknown) => mocks.setStyle(opts),
		hide: () => mocks.hide(),
		show: () => mocks.show()
	},
	Style: { Default: 'DEFAULT', Dark: 'DARK', Light: 'LIGHT' }
}));

describe('statusBar', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.getInfo.mockResolvedValue({ platform: 'web' });
		vi.resetModules();
	});

	describe('initializeStatusBar', () => {
		it('should not call StatusBar when platform is web', async () => {
			const { initializeStatusBar } = await import('$lib/utils/helpers/statusBar');
			await initializeStatusBar();
			expect(mocks.setOverlaysWebView).not.toHaveBeenCalled();
			expect(mocks.setBackgroundColor).not.toHaveBeenCalled();
			expect(mocks.setStyle).not.toHaveBeenCalled();
		});

		it('should call setOverlaysWebView, setBackgroundColor, and setStyle when platform is native', async () => {
			mocks.getInfo.mockResolvedValue({ platform: 'ios' });
			const { initializeStatusBar } = await import('$lib/utils/helpers/statusBar');
			await initializeStatusBar();
			expect(mocks.setOverlaysWebView).toHaveBeenCalledWith({ overlay: false });
			expect(mocks.setBackgroundColor).toHaveBeenCalledWith({ color: '#00000000' });
			expect(mocks.setStyle).toHaveBeenCalledWith({ style: 'DEFAULT' });
		});
	});

	describe('setStatusBarStyleDark', () => {
		it('should not call StatusBar when platform is web', async () => {
			const { setStatusBarStyleDark } = await import('$lib/utils/helpers/statusBar');
			await setStatusBarStyleDark();
			expect(mocks.setStyle).not.toHaveBeenCalled();
		});

		it('should call StatusBar.setStyle with Dark when platform is native', async () => {
			mocks.getInfo.mockResolvedValue({ platform: 'android' });
			const { setStatusBarStyleDark } = await import('$lib/utils/helpers/statusBar');
			await setStatusBarStyleDark();
			expect(mocks.setStyle).toHaveBeenCalledWith({ style: 'DARK' });
		});
	});

	describe('setStatusBarStyleLight', () => {
		it('should call StatusBar.setStyle with Light when platform is native', async () => {
			mocks.getInfo.mockResolvedValue({ platform: 'ios' });
			const { setStatusBarStyleLight } = await import('$lib/utils/helpers/statusBar');
			await setStatusBarStyleLight();
			expect(mocks.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
		});
	});

	describe('hideStatusBar', () => {
		it('should not call StatusBar.hide when platform is web', async () => {
			const { hideStatusBar } = await import('$lib/utils/helpers/statusBar');
			await hideStatusBar();
			expect(mocks.hide).not.toHaveBeenCalled();
		});

		it('should call StatusBar.hide when platform is native', async () => {
			mocks.getInfo.mockResolvedValue({ platform: 'android' });
			const { hideStatusBar } = await import('$lib/utils/helpers/statusBar');
			await hideStatusBar();
			expect(mocks.hide).toHaveBeenCalled();
		});
	});

	describe('showStatusBar', () => {
		it('should call StatusBar.show when platform is native', async () => {
			mocks.getInfo.mockResolvedValue({ platform: 'ios' });
			const { showStatusBar } = await import('$lib/utils/helpers/statusBar');
			await showStatusBar();
			expect(mocks.show).toHaveBeenCalled();
		});
	});
});
