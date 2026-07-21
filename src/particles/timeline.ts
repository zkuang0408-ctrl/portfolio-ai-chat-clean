export interface TimelineOptions {
  duration: number;
  now: () => number;
  schedule: (callback: () => void) => number;
  cancel: (id: number) => void;
  onFrame: (progress: number) => void;
  onComplete: () => void;
}

export function easeOutQuint(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));

  return 1 - (1 - clamped) ** 5;
}

export function particleProgress(global: number, delay: number): number {
  if (global >= 1) {
    return 1;
  }

  const local = (global - delay) / Math.max(0.001, 1 - delay);

  return easeOutQuint(local);
}

export function runEntrance(options: TimelineOptions): () => void {
  if (!Number.isFinite(options.duration) || options.duration <= 0) {
    throw new RangeError("Timeline duration must be a positive finite number.");
  }

  const startedAt = options.now();

  if (!Number.isFinite(startedAt)) {
    throw new RangeError("Timeline start time must be finite.");
  }

  let frameId: number;
  let lastProgress = 0;
  let stopped = false;

  const tick = (): void => {
    if (stopped) {
      return;
    }

    const currentTime = options.now();

    if (!Number.isFinite(currentTime)) {
      stopped = true;
      throw new RangeError("Timeline frame time must be finite.");
    }

    const elapsed = (currentTime - startedAt) / options.duration;
    const candidate = Math.min(1, Math.max(0, elapsed));
    const progress = Math.max(lastProgress, candidate);

    lastProgress = progress;

    options.onFrame(progress);

    if (stopped) {
      return;
    }

    if (progress >= 1) {
      stopped = true;
      options.onComplete();
      return;
    }

    frameId = options.schedule(tick);
  };

  frameId = options.schedule(tick);

  return () => {
    if (stopped) {
      return;
    }

    stopped = true;
    options.cancel(frameId);
  };
}
