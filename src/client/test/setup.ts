import '@testing-library/jest-dom/vitest';

// happy-dom has no ResizeObserver; Radix components measure themselves on mount.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}
