import { type ChatLocale } from "../chat/content";
import { renderChat, type ChatElements } from "../chat/render-chat";

export interface HeroElements {
  canvas: HTMLCanvasElement;
  portraitBase: HTMLImageElement;
  portraitStage: HTMLElement;
  chatRoot: HTMLElement;
  chat: ChatElements;
}

export function renderHero(
  root: HTMLElement,
  portraitUrl: string,
  locale: ChatLocale = "zh",
): HeroElements {
  root.innerHTML = `
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-scene">
        <header class="identity">
          <p class="name">赵实旷.</p>
          <p class="role">PRODUCT · INTERACTION · FUTURE EXPERIENCE</p>
          <nav aria-label="主要栏目">
            <a href="#about">About</a>
            <a href="#projects">Projects</a>
            <a href="#contact">Contact</a>
          </nav>
        </header>

        <div class="portrait-stage" aria-label="赵实旷肖像视觉">
          <img class="portrait-base" alt="" aria-hidden="true" />
          <canvas class="portrait-canvas" aria-hidden="true"></canvas>
          <p class="portrait-error" role="status">Portrait visualization unavailable.</p>
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
      </div>

      <aside class="hero-chat" data-chat-root></aside>
    </section>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>(".portrait-canvas");
  const portraitBase = root.querySelector<HTMLImageElement>(".portrait-base");
  const portraitStage = root.querySelector<HTMLElement>(".portrait-stage");
  const chatRoot = root.querySelector<HTMLElement>("[data-chat-root]");

  if (!canvas || !portraitBase || !portraitStage || !chatRoot) {
    throw new Error("Hero markup is missing required portrait elements.");
  }

  portraitBase.src = portraitUrl;
  const chat = renderChat(chatRoot, locale);

  return { canvas, portraitBase, portraitStage, chatRoot, chat };
}
