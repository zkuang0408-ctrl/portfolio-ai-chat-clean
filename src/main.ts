import portraitUrl from "./assets/portrait.webp";
import { renderHero } from "./hero/render-hero";
import { startPortrait } from "./particles/controller";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element.");
}

const portrait = renderHero(app, portraitUrl);

void startPortrait({
  canvas: portrait.canvas,
  portraitBase: portrait.portraitBase,
  portraitStage: portrait.portraitStage,
});
