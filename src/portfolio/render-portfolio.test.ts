import { expect, test } from "vitest";

import { renderPortfolio } from "./render-portfolio";

test("renders accessible resume, project, document, and contact sections", () => {
  const root = document.createElement("main");

  renderPortfolio(root);

  expect(root.querySelector("#about h2")?.textContent).toContain("About");
  expect(root.querySelectorAll("#projects article")).toHaveLength(6);
  expect(root.querySelectorAll("#projects img[alt]")).toHaveLength(6);
  expect(root.querySelectorAll(".project-tags li").length).toBeGreaterThanOrEqual(
    18,
  );
  expect(root.querySelectorAll(".documents a[download]")).toHaveLength(2);
  expect(
    root.querySelector<HTMLAnchorElement>(
      'a[href="mailto:zkuang0408@gmail.com"]',
    ),
  ).not.toBeNull();
  expect(root.textContent).toContain("同济大学设计创意学院");
});

test("does not render false case-study links", () => {
  const root = document.createElement("main");

  renderPortfolio(root);

  expect(root.querySelectorAll("#projects article a")).toHaveLength(0);
  expect(root.querySelectorAll("#projects article button")).toHaveLength(0);
});
