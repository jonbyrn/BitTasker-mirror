---
name: test-driven-development
description: 'Use when implementing any feature or bugfix, before writing implementation code. Enforces strict Red-Green-Refactor TDD cycle.'
---

# Test-Driven Development (TDD)

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. No exceptions.

## Red-Green-Refactor

### RED — Write Failing Test

Write one minimal test showing what should happen. Clear name, tests real behavior, one thing per test.

```typescript
test('retries failed operations 3 times', async () => {
	let attempts = 0;
	const operation = () => {
		attempts++;
		if (attempts < 3) throw new Error('fail');
		return 'success';
	};
	const result = await retryOperation(operation);
	expect(result).toBe('success');
	expect(attempts).toBe(3);
});
```

### Verify RED — Watch It Fail

**MANDATORY.** Run the test and confirm it fails for the RIGHT reason (feature missing, not a typo).

### GREEN — Minimal Code

Write simplest code to pass. Don't add features, refactor other code, or over-engineer.

### Verify GREEN — Watch It Pass

Test passes, other tests still pass, output clean.

### REFACTOR — Clean Up

After green only: remove duplication, improve names, extract helpers. Keep tests green.

## BitTasker Testing

```bash
# Run targeted tests first
npm run test:unit:components
npm run test:unit:stores
npm run test:unit:api

# Full suite only after targeted pass
npm run test:ci
```

## Red Flags — STOP

- Code written before test
- Test passes immediately (didn't see it fail)
- Rationalizing "just this once" or "too simple to test"
- Keeping existing code as "reference" while writing tests

**All of these mean: Delete code. Start over with TDD.**
