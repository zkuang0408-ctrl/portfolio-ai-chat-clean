import { expect, test } from "vitest";

import { renderNavigation } from "./render-navigation";

test("renders one persistent navigation contract for desktop and mobile", () => {
  const root = document.createElement("div");

  const navigation = renderNavigation(root);

  expect(navigation.root).toBe(root.querySelector("[data-site-nav]"));
  expect(root.querySelector("[data-site-brand]")?.textContent).toBe("赵实旷");
  expect(
    Array.from(
      root.querySelectorAll<HTMLAnchorElement>("[data-site-nav] nav a"),
      (link) => [link.textContent, link.hash],
    ),
  ).toEqual([
    ["简介", "#resume"],
    ["作品", "#projects"],
    ["联系", "#contact"],
  ]);
  expect(navigation.openChat.textContent).toBe("Ask AI");
  expect(navigation.openChat.type).toBe("button");
  expect(navigation.openChat.getAttribute("aria-controls")).toBe("portfolio-chat");
});
