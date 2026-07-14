export interface HeroElements {
  canvas: HTMLCanvasElement;
  portraitBase: HTMLImageElement;
  portraitStage: HTMLElement;
}

export function renderHero(root: HTMLElement, portraitUrl: string): HeroElements {
  root.innerHTML = `
    <section class="hero" aria-labelledby="hero-title">
      <header class="identity">
        <p class="name">赵实旷.</p>
        <p class="role">PRODUCT · INTERACTION · FUTURE EXPERIENCE</p>
        <nav aria-label="作品集栏目（内容准备中）">
          <span aria-disabled="true">About</span>
          <span aria-disabled="true">Projects</span>
          <span aria-disabled="true">Contact</span>
        </nav>
      </header>

      <div class="portrait-stage" aria-label="赵实旷肖像视觉">
        <img class="portrait-base" alt="" />
        <canvas class="portrait-canvas" aria-hidden="true"></canvas>
        <p class="portrait-error" role="status"></p>
      </div>

      <div class="headline-wrap">
        <h1 class="headline" id="hero-title">
          <span>Crafting <em>Future</em></span>
          <span>Through Objects</span>
          <span>&amp; Systems.</span>
        </h1>
        <small>From physical products to intelligent experiences</small>
      </div>

      <p class="hero-index"><strong>01</strong> / SELECTED IDENTITY</p>
    </section>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>(".portrait-canvas");
  const portraitBase = root.querySelector<HTMLImageElement>(".portrait-base");
  const portraitStage = root.querySelector<HTMLElement>(".portrait-stage");

  if (!canvas || !portraitBase || !portraitStage) {
    throw new Error("Hero markup is missing required portrait elements.");
  }

  portraitBase.src = portraitUrl;

  return { canvas, portraitBase, portraitStage };
}
