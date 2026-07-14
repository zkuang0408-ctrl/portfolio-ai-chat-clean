import { describe, expect, it, vi } from "vitest";

import { easeOutQuint, particleProgress, runEntrance } from "./timeline";

describe("particle entrance timeline", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid duration %s before scheduling",
    (duration) => {
      const schedule = vi.fn(() => 1);

      expect(() =>
        runEntrance({
          duration,
          now: () => 0,
          schedule,
          cancel: vi.fn(),
          onFrame: vi.fn(),
          onComplete: vi.fn(),
        }),
      ).toThrow(RangeError);
      expect(schedule).not.toHaveBeenCalled();
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid start time %s before scheduling",
    (startTime) => {
      const schedule = vi.fn(() => 1);

      expect(() =>
        runEntrance({
          duration: 2_200,
          now: () => startTime,
          schedule,
          cancel: vi.fn(),
          onFrame: vi.fn(),
          onComplete: vi.fn(),
        }),
      ).toThrow(RangeError);
      expect(schedule).not.toHaveBeenCalled();
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "stops when a frame time is invalid: %s",
    (frameTime) => {
      let nowCallCount = 0;
      let scheduledCallback: (() => void) | undefined;
      const schedule = vi.fn((callback: () => void) => {
        scheduledCallback = callback;
        return 1;
      });
      const onFrame = vi.fn();

      runEntrance({
        duration: 2_200,
        now: () => {
          nowCallCount += 1;
          return nowCallCount === 1 ? 0 : frameTime;
        },
        schedule,
        cancel: vi.fn(),
        onFrame,
        onComplete: vi.fn(),
      });

      expect(() => scheduledCallback?.()).toThrow(RangeError);
      expect(() => scheduledCallback?.()).not.toThrow();
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(onFrame).not.toHaveBeenCalled();
    },
  );

  it("clamps eased progress to the normalized range", () => {
    expect(easeOutQuint(-1)).toBe(0);
    expect(easeOutQuint(2)).toBe(1);
  });

  it("advances particles with shorter delays before later particles", () => {
    expect(particleProgress(0.5, 0.15)).toBeGreaterThan(
      particleProgress(0.5, 0.65),
    );
    expect(particleProgress(1, 0.65)).toBe(1);
    expect(particleProgress(-1, 0.15)).toBe(0);
  });

  it("keeps progress monotonic when the clock moves backwards", () => {
    let now = 0;
    const queue: Array<() => void> = [];
    const onFrame = vi.fn();

    const stop = runEntrance({
      duration: 2_200,
      now: () => now,
      schedule: (callback) => {
        queue.push(callback);
        return queue.length;
      },
      cancel: vi.fn(),
      onFrame,
      onComplete: vi.fn(),
    });

    now = 1_000;
    queue.shift()?.();
    now = 500;
    queue.shift()?.();
    stop();

    const firstProgress = onFrame.mock.calls[0]?.[0];
    const secondProgress = onFrame.mock.calls[1]?.[0];

    expect(firstProgress).toBeCloseTo(1_000 / 2_200);
    expect(secondProgress).toBe(firstProgress);
  });

  it("runs once to completion without scheduling another frame", () => {
    let now = 0;
    let nextFrameId = 1;
    let scheduleCount = 0;
    let completedCallback: (() => void) | undefined;
    const queue: Array<{ callback: () => void; id: number }> = [];
    const onFrame = vi.fn();
    const onComplete = vi.fn();

    runEntrance({
      duration: 2_200,
      now: () => now,
      schedule: (callback) => {
        const id = nextFrameId;
        nextFrameId += 1;
        scheduleCount += 1;
        queue.push({ callback, id });
        return id;
      },
      cancel: vi.fn(),
      onFrame,
      onComplete,
    });

    for (
      let frameCount = 0;
      frameCount < 30 && queue.length > 0;
      frameCount += 1
    ) {
      const frame = queue.shift();
      expect(frame).toBeDefined();
      now += 100;
      completedCallback = frame?.callback;
      frame?.callback();
    }

    expect(onFrame).toHaveBeenLastCalledWith(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(0);
    expect(scheduleCount).toBe(22);

    completedCallback?.();

    expect(scheduleCount).toBe(22);
  });

  it("can be cancelled idempotently", () => {
    let scheduledCallback: (() => void) | undefined;
    const cancel = vi.fn();
    const onFrame = vi.fn();
    const onComplete = vi.fn();

    const stop = runEntrance({
      duration: 2_200,
      now: () => 0,
      schedule: (callback) => {
        scheduledCallback = callback;
        return 7;
      },
      cancel,
      onFrame,
      onComplete,
    });

    stop();
    stop();
    scheduledCallback?.();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(7);
    expect(onFrame).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not schedule after onFrame cancels reentrantly", () => {
    let now = 0;
    let nextFrameId = 1;
    let stop: (() => void) | undefined;
    const queue: Array<() => void> = [];
    const cancel = vi.fn();
    const onComplete = vi.fn();
    const schedule = vi.fn((callback: () => void) => {
      queue.push(callback);
      const id = nextFrameId;
      nextFrameId += 1;
      return id;
    });

    stop = runEntrance({
      duration: 2_200,
      now: () => now,
      schedule,
      cancel,
      onFrame: () => stop?.(),
      onComplete,
    });

    now = 100;
    queue.shift()?.();

    expect(queue).toHaveLength(0);
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not cancel or complete again after finishing", () => {
    let now = 0;
    let scheduledCallback: (() => void) | undefined;
    const cancel = vi.fn();
    const onComplete = vi.fn();

    const stop = runEntrance({
      duration: 2_200,
      now: () => now,
      schedule: (callback) => {
        scheduledCallback = callback;
        return 9;
      },
      cancel,
      onFrame: vi.fn(),
      onComplete,
    });

    now = 2_200;
    scheduledCallback?.();
    stop();
    stop();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});
