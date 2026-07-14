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
  const startedAt = options.now();
  let frameId: number;
  let stopped = false;

  const tick = (): void => {
    if (stopped) {
      return;
    }

    const elapsed = (options.now() - startedAt) / options.duration;
    const progress = Math.min(1, Math.max(0, elapsed));

    options.onFrame(progress);

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
