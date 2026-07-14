import { particleProgress } from "./timeline";
import type { Particle } from "./types";

export interface SourceSize {
  width: number;
  height: number;
}

export class ParticleRenderer {
  private width = 1;
  private height = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
  ) {}

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.width = Number.isFinite(width) ? Math.max(1, width) : 1;
    this.height = Number.isFinite(height) ? Math.max(1, height) : 1;
    const ratio = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
    const dpr = Math.min(2, Math.max(1, ratio));

    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(
    particles: readonly Particle[],
    globalProgress: number,
    source: SourceSize,
  ): void {
    this.context.clearRect(0, 0, this.width, this.height);

    const scale = Math.min(
      this.width / source.width,
      this.height / source.height,
    );
    const offsetX = (this.width - source.width * scale) / 2;
    const offsetY = (this.height - source.height * scale) / 2;

    for (const particle of particles) {
      const progress = particleProgress(globalProgress, particle.delay);

      if (progress <= 0) continue;

      const x = particle.startX + (particle.targetX - particle.startX) * progress;
      const y = particle.startY + (particle.targetY - particle.startY) * progress;
      const radius = particle.radius * scale * (0.55 + progress * 0.45);

      this.context.beginPath();
      this.context.globalAlpha = particle.alpha * progress;
      this.context.fillStyle = `rgb(${particle.tone} ${particle.tone} ${particle.tone})`;
      this.context.ellipse(
        offsetX + x * scale,
        offsetY + y * scale,
        radius * particle.stretch,
        radius,
        0,
        0,
        Math.PI * 2,
      );
      this.context.fill();
    }

    this.context.globalAlpha = 1;
  }
}
