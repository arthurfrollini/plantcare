/**
 * Pins the clock for a test: only `Date` is fake. Timers, microtasks, animation frames and
 * `performance` stay real, so React, promises and animations behave as they do in the app.
 * Call `jest.setSystemTime` to move the clock later, and `jest.useRealTimers()` in `afterEach`.
 */
export function setToday(date: Date) {
  jest.useFakeTimers({
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  jest.setSystemTime(date);
}
