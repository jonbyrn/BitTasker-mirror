---
name: capacitor-testing
description: 'Testing strategies for Capacitor mobile apps. Use for mocking native plugins, platform-specific tests, and mobile-specific edge cases.'
---

# Capacitor Testing (Svelte 5 + Vitest)

## Platform Mocking

```typescript
// src/lib/mocks/capacitor.ts or test setup
import { vi } from 'vitest';

// Mock @capacitor/core
vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: vi.fn(() => true),
		getPlatform: vi.fn(() => 'ios'),
		isPluginAvailable: vi.fn(() => true)
	},
	registerPlugin: vi.fn()
}));

// Mock common plugins as needed
vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined)
	}
}));
```

## Platform Test Helpers

```typescript
import { Capacitor } from '@capacitor/core';
import { vi } from 'vitest';

export function mockPlatform(platform: 'ios' | 'android' | 'web') {
	vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
	vi.mocked(Capacitor.isNativePlatform).mockReturnValue(platform !== 'web');
}

// Usage
describe('Platform behavior', () => {
	it('uses iOS-specific behavior on iOS', () => {
		mockPlatform('ios');
		// Test iOS path
	});
	it('falls back on web', () => {
		mockPlatform('web');
		// Test web fallback
	});
});
```

## Svelte Component Testing

```typescript
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import MyComponent from './MyComponent.svelte';

test('renders with platform-specific content', async () => {
	mockPlatform('ios');
	render(MyComponent);
	expect(screen.getByText('iOS Feature')).toBeInTheDocument();
});
```

## Key Rules

- **Mock at the plugin boundary** — never mock Capacitor internals deeper than `@capacitor/core`
- **Test all 3 platforms** — web (browser), iOS, Android — especially for platform-gated features
- **Native plugin calls must have web fallbacks** — test both paths
- **Platform detection is synchronous** — `Capacitor.getPlatform()` and `isNativePlatform()` return immediately
- **Plugin availability is async** — `Capacitor.isPluginAvailable()` returns a promise
