import { describe, expect, it, vi } from "vitest";

import { easeOutQuint, particleProgress, runEntrance } from "./timeline";

describe("particle entrance timeline", () => {
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

  it("runs once to completion without scheduling another frame", () => {
    let now = 0;
    let nextFrameId = 1;
    let scheduleCount = 0;
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

    while (queue.length > 0) {
      const frame = queue.shift();
      expect(frame).toBeDefined();
      now += 100;
      frame?.callback();
    }

    expect(onFrame).toHaveBeenLastCalledWith(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(0);
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
