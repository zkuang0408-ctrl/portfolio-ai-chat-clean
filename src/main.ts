import portraitUrl from "./assets/portrait.webp";
import { startPortfolioChat } from "./chat/chat-controller";
import type { ChatLocale } from "./chat/content";
import { createSafeSessionStorage } from "./chat/session";
import { navigateToSource } from "./chat/source-navigation";
import { renderHero } from "./hero/render-hero";
import { startPortrait } from "./particles/controller";
import {
  startProjectReaders,
  type PdfReaderDependencies,
} from "./portfolio/pdf-reader";
import { loadPdfDocument } from "./portfolio/pdf-runtime";
import { renderPortfolio } from "./portfolio/render-portfolio";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element.");
}

const locale: ChatLocale = navigator.language.toLowerCase().startsWith("zh")
  ? "zh"
  : "en";
const portrait = renderHero(app, portraitUrl, locale);
const portfolioRoot = document.createElement("main");
portfolioRoot.className = "portfolio-content";
app.append(portfolioRoot);
renderPortfolio(portfolioRoot);

const stopChat = startPortfolioChat(portrait.chatRoot, {
  fetch: window.fetch.bind(window),
  storage: createSafeSessionStorage(() => window.sessionStorage),
  locale,
  navigateToSource: (source) =>
    navigateToSource(portfolioRoot, source, {
      document,
      open: window.open.bind(window),
    }),
});

const stopReaders = startProjectReaders(portfolioRoot, {
  loadDocument:
    loadPdfDocument as PdfReaderDependencies["loadDocument"],
  measureWidth: (stage) => stage.clientWidth,
  outputScale: () => window.devicePixelRatio || 1,
  requestFrame: window.requestAnimationFrame.bind(window),
  cancelFrame: window.cancelAnimationFrame.bind(window),
  reducedMotion: () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
});
function handlePageHide(event: PageTransitionEvent): void {
  if (event.persisted) {
    return;
  }
  stopChat();
  stopReaders();
  window.removeEventListener("pagehide", handlePageHide);
}
window.addEventListener("pagehide", handlePageHide);

void startPortrait({
  canvas: portrait.canvas,
  portraitBase: portrait.portraitBase,
  portraitStage: portrait.portraitStage,
});
