import { particleProgress } from "./timeline";
import type { Particle } from "./types";

export const DEFAULT_MAX_DRAW_PARTICLES = 16_000;

export interface SourceSize {
  width: number;
  height: number;
}

export interface PortraitComposition {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function portraitCompositionFor(
  width: number,
  height: number,
  source: SourceSize,
): PortraitComposition {
  const mobile = width <= 760;
  const shortLandscape = mobile && width > height;
  const widthFactor = shortLandscape ? 0.78 : mobile ? 1.10 : 0.70;
  const heightFactor = shortLandscape ? 0.92 : mobile ? 0.78 : 1.12;
  const scale = Math.max(
    (width / source.width) * widthFactor,
    (height / source.height) * heightFactor,
  );

  return {
    scale,
    offsetX: (width - source.width * scale) / 2,
    offsetY: height * 0.11 - source.height * 0.13 * scale,
  };
}

export interface PortraitParallax {
  x: number;
  y: number;
}

function isDrawableParticle(particle: Particle): boolean {
  return (
    Number.isFinite(particle.targetX) &&
    Number.isFinite(particle.targetY) &&
    Number.isFinite(particle.startX) &&
    Number.isFinite(particle.startY) &&
    Number.isFinite(particle.radius) &&
    particle.radius > 0 &&
    Number.isFinite(particle.alpha) &&
    Number.isFinite(particle.tone) &&
    Number.isFinite(particle.stretch) &&
    particle.stretch > 0 &&
    Number.isFinite(particle.delay)
  );
}

export class ParticleRenderer {
  private width = 1;
  private height = 1;
  private readonly maxDrawParticles: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: CanvasRenderingContext2D,
    maxDrawParticles = DEFAULT_MAX_DRAW_PARTICLES,
  ) {
    this.maxDrawParticles = Number.isFinite(maxDrawParticles)
      ? Math.min(
          DEFAULT_MAX_DRAW_PARTICLES,
          Math.max(0, Math.floor(maxDrawParticles)),
        )
      : 0;
  }

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
    parallax: PortraitParallax = { x: 0, y: 0 },
  ): void {
    const previousGlobalAlpha = this.context.globalAlpha;
    const previousFillStyle = this.context.fillStyle;
    this.context.save();

    try {
      this.context.clearRect(0, 0, this.width, this.height);

      if (
        !Number.isFinite(source.width) ||
        source.width <= 0 ||
        !Number.isFinite(source.height) ||
        source.height <= 0 ||
        !Number.isFinite(globalProgress)
      ) {
        return;
      }

      const { scale, offsetX, offsetY } = portraitCompositionFor(
        this.width,
        this.height,
        source,
      );

      const drawCount = Math.min(particles.length, this.maxDrawParticles);

      for (let index = 0; index < drawCount; index += 1) {
        const particle = particles[index];

        if (particle === undefined) continue;
        if (!isDrawableParticle(particle)) continue;

        const progress = particleProgress(globalProgress, particle.delay);

        if (!Number.isFinite(progress) || progress <= 0) continue;

        const x =
          particle.startX + (particle.targetX - particle.startX) * progress;
        const y =
          particle.startY + (particle.targetY - particle.startY) * progress;
        const radius = particle.radius * scale * (0.55 + progress * 0.45);
        const alpha = Math.min(1, Math.max(0, particle.alpha * progress));
        const tone = Math.min(255, Math.max(0, Math.round(particle.tone)));
        const depth = Number.isFinite(particle.depth)
          ? Math.min(1, Math.max(0, particle.depth))
          : 0;

        this.context.beginPath();
        this.context.globalAlpha = alpha;
        this.context.fillStyle = `rgb(${tone} ${tone} ${tone})`;
        this.context.ellipse(
          offsetX + x * scale + parallax.x * depth,
          offsetY + y * scale + parallax.y * depth,
          radius * particle.stretch,
          radius,
          0,
          0,
          Math.PI * 2,
        );
        this.context.fill();
      }
    } finally {
      this.context.restore();
      this.context.globalAlpha = previousGlobalAlpha;
      this.context.fillStyle = previousFillStyle;
    }
  }
}
