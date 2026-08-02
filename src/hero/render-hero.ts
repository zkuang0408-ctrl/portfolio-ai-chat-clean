import { type ChatLocale } from "../chat/content";
import { renderChat, type ChatElements } from "../chat/render-chat";

export interface HeroElements {
  canvas: HTMLCanvasElement;
  portraitBase: HTMLImageElement;
  portraitMask: HTMLImageElement;
  portraitStage: HTMLElement;
  chatRoot: HTMLElement;
  chat: ChatElements;
}

export function renderHero(
  root: HTMLElement,
  portraitUrl: string,
  portraitMaskUrl: string,
  locale: ChatLocale = "zh",
): HeroElements {
  root.insertAdjacentHTML("beforeend", `
    <section class="hero" id="top" aria-labelledby="hero-title">
      <div class="hero-scene">
        <div class="hero-copy">
          <p class="role">PRODUCT · INTERACTION · FUTURE EXPERIENCE</p>
          <h1 class="headline" id="hero-title">
            <span>Crafting <em>Future</em></span>
            <span>Through Objects</span>
            <span>&amp; Systems.</span>
          </h1>
          <p class="hero-supporting" data-hero-supporting>从实体产品到智能系统，以研究、交互与原型塑造未来体验。</p>
        </div>

        <div class="portrait-stage" role="img" aria-label="赵实旷的粒子肖像">
          <img class="portrait-base" alt="" aria-hidden="true" hidden />
          <img class="portrait-mask" alt="" aria-hidden="true" hidden />
          <canvas class="portrait-canvas" aria-hidden="true"></canvas>
          <p class="portrait-error" role="status">Portrait visualization unavailable.</p>
        </div>

        <p class="hero-index"><strong>01</strong> / SELECTED IDENTITY</p>
      </div>

      <aside class="hero-chat" data-chat-root></aside>
    </section>
  `);

  const canvas = root.querySelector<HTMLCanvasElement>(".portrait-canvas");
  const portraitBase = root.querySelector<HTMLImageElement>(".portrait-base");
  const portraitMask = root.querySelector<HTMLImageElement>(".portrait-mask");
  const portraitStage = root.querySelector<HTMLElement>(".portrait-stage");
  const chatRoot = root.querySelector<HTMLElement>("[data-chat-root]");

  if (!canvas || !portraitBase || !portraitMask || !portraitStage || !chatRoot) {
    throw new Error("Hero markup is missing required portrait elements.");
  }

  portraitBase.src = portraitUrl;
  portraitMask.src = portraitMaskUrl;
  const chat = renderChat(chatRoot, locale);

  return { canvas, portraitBase, portraitMask, portraitStage, chatRoot, chat };
}
