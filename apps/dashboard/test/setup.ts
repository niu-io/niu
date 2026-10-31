import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { clearSessionCache } from '../app/lib/query-cache';
import { resetActiveRouteLoads } from '../app/lib/route-data';
import { resetActiveSessionSnapshot } from '../app/shell/router-context';

configure({ asyncUtilTimeout: 4000 });

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    class TestResizeObserver implements ResizeObserver {
      observe(_target: Element, _options?: ResizeObserverOptions) {}
      unobserve(_target: Element) {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
  }
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute('open', ''); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
});

beforeEach(() => {
  clearSessionCache();
  resetActiveRouteLoads();
  resetActiveSessionSnapshot();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
