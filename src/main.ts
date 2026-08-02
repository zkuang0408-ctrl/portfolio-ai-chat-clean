import { resolveChatEndpoint } from "./chat/chat-endpoint";
import { startPortfolioChat } from "./chat/chat-controller";
import type { ChatLocale } from "./chat/content";
import { createSafeSessionStorage } from "./chat/session";
import { navigateToSource } from "./chat/source-navigation";
import type { ProjectPageAsset } from "./content/portfolio";
import { renderHero } from "./hero/render-hero";
import { renderNavigation } from "./navigation/render-navigation";
import { startPortrait } from "./particles/controller";
import { startProjectReaders } from "./portfolio/image-reader";
import { renderPortfolio } from "./portfolio/render-portfolio";
import "./styles.css";

const portraitUrl = "/portrait-resume-retouched-v1.png";

function selectedPageUrl(asset: ProjectPageAsset): string {
  return window.matchMedia("(max-width: 760px)").matches
    ? asset.mobile
    : asset.desktop;
}

function loadProjectPage(asset: ProjectPageAsset): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Project page unavailable"));
    image.src = selectedPageUrl(asset);
  });
}

function preloadProjectPage(asset: ProjectPageAsset): void {
  const image = new Image();
  image.src = selectedPageUrl(asset);
}

function awaitVisibleImage(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    return image.decode().catch(() => undefined);
  }
  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      image.removeEventListener("error", handleError);
      resolve();
    };
    const handleError = () => {
      image.removeEventListener("load", handleLoad);
      reject(new Error("Project page unavailable"));
    };
    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
}

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element.");
}

const locale: ChatLocale = navigator.language.toLowerCase().startsWith("zh")
  ? "zh"
  : "en";
renderNavigation(app);
const portrait = renderHero(app, portraitUrl, locale);
const portfolioRoot = document.createElement("main");
portfolioRoot.className = "portfolio-content";
app.append(portfolioRoot);
renderPortfolio(portfolioRoot, { portraitUrl });

const stopChat = startPortfolioChat(portrait.chatRoot, {
  fetch: window.fetch.bind(window),
  endpoint: resolveChatEndpoint(import.meta.env.VITE_CHAT_API_URL),
  storage: createSafeSessionStorage(() => window.sessionStorage),
  locale,
  navigateToSource: (source) =>
    navigateToSource(portfolioRoot, source, {
      document,
      open: window.open.bind(window),
    }),
});

const stopReaders = startProjectReaders(portfolioRoot, {
  load: loadProjectPage,
  preload: preloadProjectPage,
  awaitVisibleImage,
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
