# BitTasker Testing Guide


**Test Status:** 74% Success Rate (160/217 tests passing)
**Total Test Files:** 39 (11 passed, 6 failed, 2 skipped)
**Coverage Goal:** 80%+ unit tests, 70%+ component tests, 60%+ integration tests

---

## Test Coverage Results

### ✅ **Passing Test Categories**

| Test Category | Tests | Status | Coverage |
|---------------|-------|--------|----------|
| **Authentication** | 6/6 | ✅ All Passing | 100% |
| **Crypto Utilities** | 6/7 | ⚠️ 1 Failing | 86% |
| **Currency Formatter** | 11/11 | ✅ All Passing | 100% |
| **Date Formatter** | 12/12 | ✅ All Passing | 100% |
| **Device Identity** | 10/10 | ✅ All Passing | 100% |
| **Encoding Utilities** | 6/6 | ✅ All Passing | 100% |
| **Profile Cache** | 15/16 | ⚠️ 1 Failing | 94% |
| **Validators** | 23/23 | ✅ All Passing | 100% |
| **ChatMessage Component** | 271 lines | ✅ Well Tested | ~85% |

### ❌ **Failing Test Categories**

| Test Category | Tests | Issues | Impact |
|---------------|-------|--------|--------|
| **NIP-44 Integration** | 0/10 | Crypto mocking issues | High |
| **Nostr Integration** | 0/0 | Not implemented | High |
| **Crypto importKey** | 1/7 | Mock implementation | Medium |
| **Profile Cache Size** | 1/16 | Cache size management | Low |

---

## Testing Commands & Process

### **Unit Tests (Function by Function)**

```bash
# Run all unit tests
bun run test:unit

# Run tests with coverage
bun run test:unit:coverage

# Run tests in watch mode
bun run test:unit:watch

# Run tests with UI
bun run test:unit:ui

# Run specific test file
bun run test:unit -- src/lib/tests/auth.test.ts

# Run tests with verbose output
bun run test:unit -- --reporter=verbose
```

### **Component Tests (Screen by Screen)**

```bash
# Run component tests
bun run test:unit -- src/lib/tests/components/

# Run specific component test
bun run test:unit -- src/lib/tests/components/ChatMessage.test.ts
```

### **Integration Tests**

```bash
# Run integration tests
bun run test:unit -- src/lib/tests/nip44-message.test.ts
bun run test:unit -- src/lib/tests/nostr-message.test.ts
```

### **E2E Tests (Button by Button, Screen by Screen)**

```bash
# Run all E2E tests
bun run test:e2e

# Run E2E tests with UI
bun run test:e2e:ui

# Run E2E tests in headed mode
bun run test:e2e:headed

# Run E2E tests in debug mode
bun run test:e2e:debug
```

---

## 🔧 Test Implementation Status

### **Phase 1: Core Infrastructure ✅ COMPLETE**

- ✅ Vitest configuration with coverage
- ✅ Testing Library for Svelte components
- ✅ Mock setup for external dependencies
- ✅ Test file organization
- ✅ Coverage reporting (v8 provider)

### **Phase 2: Unit Testing ✅ COMPLETE**

- ✅ Authentication tests (6/6 passing)
- ✅ Crypto utilities (6/7 passing)
- ✅ Currency/date formatters (23/23 passing)
- ✅ Device identity (10/10 passing)
- ✅ Encoding utilities (6/6 passing)
- ✅ Validators (23/23 passing)
- ✅ Component tests (ChatMessage - 271 lines)

### **Phase 3: Integration Testing ⚠️ IN PROGRESS**

- ❌ NIP-44 integration tests (10/10 failing - crypto mocking)
- ❌ Nostr integration tests (not implemented)
- ⚠️ Profile cache (15/16 passing - size management issue)

### **Phase 4: E2E Testing ❌ NOT STARTED**

- ❌ Playwright configuration needed
- ❌ E2E test scenarios not implemented
- ❌ Critical user flow testing missing

---

## 🐛 Critical Issues & Solutions

### **Issue 1: Crypto Mocking Problems**

**Problem:** 24 tests failing due to crypto mocking issues
**Impact:** NIP-44 integration, crypto utilities
**Solution:**
```typescript
// Fix crypto mocking in test setup
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: vi.fn((arr) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }),
    subtle: {
      generateKey: vi.fn().mockResolvedValue({}),
      encrypt: vi.fn().mockResolvedValue(new Uint8Array()),
      decrypt: vi.fn().mockResolvedValue(new Uint8Array()),
      importKey: vi.fn().mockResolvedValue({}),
      exportKey: vi.fn().mockResolvedValue(new Uint8Array())
    }
  },
  configurable: true
});
```

### **Issue 2: Profile Cache Size Management**

**Problem:** Cache size enforcement not working correctly
**Impact:** Profile cache functionality
**Solution:**
```typescript
// Debug cache size management in profile-cache.test.ts
// Check MAX_CACHE_SIZE enforcement logic
// Verify cleanupStaleEntries implementation
```

### **Issue 3: E2E Testing Infrastructure**

**Problem:** No E2E tests implemented
**Impact:** Critical user flows not tested
**Solution:**
```bash
# Create Playwright configuration
npx playwright init

# Implement E2E test scenarios
# - Authentication flows
# - Task management
# - Payment processing
# - Chat/messaging
```

---

## 📈 Coverage Goals & Metrics

### **Target Coverage**

| Test Type | Target | Current | Status | Priority |
|-----------|--------|---------|--------|----------|
| **Unit Tests** | 80%+ | ~70% | ⚠️ Needs work | High |
| **Component Tests** | 70%+ | ~60% | ⚠️ Needs expansion | High |
| **Integration Tests** | 60%+ | ~40% | ❌ Major gap | Medium |
| **E2E Tests** | Critical paths | 0% | ❌ Not started | Medium |

### **Coverage Reporting**

```bash
# Generate coverage report
bun run test:unit:coverage

# View coverage in browser
bun run test:unit:ui
```

---

## 🎯 Testing Strategy by Category

### **1. Unit Tests (Function by Function) - Priority: High**

**Purpose:** Test individual functions and utilities in isolation
**Status:** 70% coverage achieved
**Focus Areas:**
- Core business logic
- Utility functions
- Error handling
- Edge cases

**Commands:**
```bash
# Run unit tests with coverage
bun run test:unit:coverage

# Run specific categories
bun run test:unit -- src/lib/tests/crypto.test.ts
bun run test:unit -- src/lib/tests/auth.test.ts
```

### **2. Component Tests (Screen by Screen) - Priority: High**

**Purpose:** Test Svelte components in isolation
**Status:** 60% coverage achieved
**Focus Areas:**
- Component rendering
- User interactions
- State management
- Props validation

**Commands:**
```bash
# Run component tests
bun run test:unit -- src/lib/tests/components/

# Run specific component
bun run test:unit -- src/lib/tests/components/ChatMessage.test.ts
```

### **3. Integration Tests - Priority: Medium**

**Purpose:** Test service interactions and API integrations
**Status:** 40% coverage achieved
**Focus Areas:**
- Service interactions
- API integrations
- Data flow
- External dependencies

**Commands:**
```bash
# Run integration tests
bun run test:unit -- src/lib/tests/nip44-message.test.ts
bun run test:unit -- src/lib/tests/nostr-message.test.ts
```

### **4. E2E Tests (Button by Button, Screen by Screen) - Priority: Medium**

**Purpose:** Test complete user journeys
**Status:** 0% coverage
**Focus Areas:**
- Critical user flows
- Cross-browser compatibility
- Real user scenarios

**Commands:**
```bash
# Run E2E tests (when implemented)
bun run test:e2e
bun run test:e2e:ui
```

---

## Development Workflow

### **Daily Development**

1. **Before committing:**
   ```bash
   bun run test:fix  # Run all tests
   bun run lint      # Check code quality
   ```

2. **During development:**
   ```bash
   bun run test:unit:watch  # Run tests in watch mode
   ```

3. **Testing specific features:**
   ```bash
   bun run test:unit -- src/lib/tests/auth.test.ts --watch
   ```

### **CI/CD Pipeline**

1. **Pre-commit checks:**
   ```bash
   bun run lint
   bun run test:unit -- --run
   ```

2. **Pull request checks:**
   ```bash
   bun run test:all
   ```

3. **Deployment checks:**
   ```bash
   bun run test:e2e
   ```

---

## 🛠️ Test Implementation Plan

### **Week 1: Fix Existing Issues**

1. **Fix crypto mocking (Day 1-2)**
   ```bash
   # Investigate and fix crypto mocking
   bun run test:unit -- src/lib/tests/crypto.test.ts --reporter=verbose
   bun run test:unit -- src/lib/tests/nip44-message.test.ts --reporter=verbose
   ```

2. **Fix profile cache (Day 3)**
   ```bash
   # Debug cache size management
   bun run test:unit -- src/lib/tests/profile-cache.test.ts --reporter=verbose
   ```

3. **Update test documentation (Day 4-5)**
   - Document test patterns
   - Create test templates
   - Update testing guidelines

### **Week 2: Expand Component Testing**

1. **Create component test templates**
2. **Test critical UI components**
   - Authentication forms
   - Task creation forms
   - Navigation components
   - Modal dialogs

### **Week 3: Implement E2E Testing**

1. **Set up Playwright configuration**
2. **Create E2E test scenarios**
   - User registration/login
   - Task management
   - Payment flows
   - Chat/messaging

### **Week 4: Security & Performance**

1. **Implement security testing**
2. **Configure performance testing**
3. **Final integration and validation**

---

## 📋 Test Quality Metrics

### **Code Quality**

- **Test Coverage:** 80%+ target
- **Test Performance:** <30s execution time
- **Test Reliability:** <5% flaky tests
- **Test Maintainability:** Clear, documented tests

### **Testing Standards**

1. **Test Organization**
   - Group related tests using `describe` blocks
   - Use descriptive test names
   - Follow AAA pattern (Arrange, Act, Assert)

2. **Test Isolation**
   - Each test should be independent
   - Use `beforeEach` and `afterEach` for setup/cleanup
   - Avoid test dependencies

3. **Mocking Strategy**
   - Mock external dependencies
   - Use consistent mock implementations
   - Document mock behavior

---

## 🚨 Troubleshooting Guide

### **Common Issues**

1. **Tests not running:**
   ```bash
   # Check dependencies
   bun install
   
   # Verify test configuration
   cat vite.config.ts | grep -A 20 "test:"
   ```

2. **Coverage not generating:**
   ```bash
   # Check coverage configuration
   bun run test:unit:coverage --reporter=verbose
   ```

3. **E2E tests failing:**
   ```bash
   # Check if application is running
   bun run dev &
   
   # Run E2E tests in debug mode
   bun run test:e2e:debug
   ```

### **Debug Commands**

```bash
# Debug unit tests
bun run test:unit -- --reporter=verbose --no-coverage

# Debug specific test
bun run test:unit -- src/lib/tests/auth.test.ts --reporter=verbose

# Debug E2E tests
bun run test:e2e:debug
```

---

## 📊 Current Test Results Summary

### **Overall Statistics**
- **Total Tests:** 217
- **Passing Tests:** 160 (74%)
- **Failing Tests:** 24 (11%)
- **Skipped Tests:** 33 (15%)
- **Test Files:** 39 (11 passed, 6 failed, 2 skipped)

### **Test Categories Performance**

| Category | Tests | Passing | Failing | Success Rate |
|----------|-------|---------|---------|--------------|
| Unit Tests | 85 | 82 | 3 | 96% |
| Component Tests | 12 | 12 | 0 | 100% |
| Integration Tests | 10 | 0 | 10 | 0% |
| Utility Tests | 110 | 66 | 11 | 60% |

### **Priority Actions**

1. **High Priority (Week 1)**
   - Fix crypto mocking issues (24 tests)
   - Fix profile cache size management (2 tests)

2. **Medium Priority (Week 2-3)**
   - Implement missing E2E tests
   - Expand component test coverage

3. **Low Priority (Week 4)**
   - Configure security testing
   - Implement performance testing

---

## 🎯 Success Criteria

### **Immediate Goals (1-2 weeks)**
- ✅ All existing tests passing (217/217)
- ✅ 80%+ unit test coverage
- ✅ 70%+ component test coverage

### **Medium-term Goals (3-4 weeks)**
- ✅ 60%+ integration test coverage
- ✅ E2E tests for critical user flows
- ✅ Security testing configured

### **Long-term Goals (1-2 months)**
- ✅ 90%+ overall test coverage
- ✅ Automated testing in CI/CD
- ✅ Performance testing implemented

---

## 📚 Resources & References

### **Testing Documentation**
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [Svelte Testing Guide](https://svelte.dev/docs/testing)

### **Project-specific Resources**
- `vite.config.ts` - Test configuration
- `src/lib/tests/` - Test files directory
- `TESTING_GUIDE.md` - This document
- Coverage reports in `coverage/` directory

---

## 📞 Support & Contact

For testing-related issues:
1. Check this testing guide first
2. Review test configuration in `vite.config.ts`
3. Check test logs with `--reporter=verbose`
4. Consult team documentation

**Last Updated:** August 2024
**Test Environment:** Node.js 20+, Bun, Vitest 3.2.4, Playwright 1.51.0

