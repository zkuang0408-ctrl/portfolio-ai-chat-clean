import portraitUrl from "./assets/portrait.webp";
import { renderHero } from "./hero/render-hero";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element.");
}

renderHero(app, portraitUrl);
