import { expect, test } from "vitest";

import { projects } from "../content/portfolio";
import { renderPortfolio } from "./render-portfolio";

test("renders accessible resume, project, document, and contact sections", () => {
  const root = document.createElement("main");

  renderPortfolio(root, { portraitUrl: "/portrait-resume-retouched-v1.png" });

  expect(root.querySelector("#resume h2")?.textContent).toContain("赵实旷");
  expect(root.querySelector("#about")).toBeNull();
  expect(root.querySelectorAll("#projects article")).toHaveLength(6);
  const readers = root.querySelectorAll<HTMLElement>("[data-project-reader]");
  expect(readers).toHaveLength(6);
  expect(root.querySelectorAll("#projects .project-media img")).toHaveLength(6);

  const first = readers[0];
  expect(first?.dataset.pdfUrl).toBe("/projects/pdfs/inkseat.pdf");
  expect(first?.dataset.expectedPages).toBe("18");
  expect(first?.querySelectorAll("canvas")).toHaveLength(0);
  expect(first?.querySelectorAll("picture")).toHaveLength(1);
  const image = first?.querySelector<HTMLImageElement>("[data-page-image]");
  const mobile = first?.querySelector<HTMLSourceElement>(
    'source[media="(max-width: 760px)"]',
  );
  expect(image?.getAttribute("src")).toBe(projects[0]?.pdf.pages[0]?.desktop);
  expect(image?.getAttribute("loading")).toBe("lazy");
  expect(image?.getAttribute("decoding")).toBe("async");
  expect(mobile?.getAttribute("srcset")).toBe(
    projects[0]?.pdf.pages[0]?.mobile,
  );
  expect(
    first?.querySelector("[data-open-original-pdf]")?.getAttribute("href"),
  ).toBe("/projects/pdfs/inkseat.pdf");
  expect(first?.querySelectorAll("button[data-page-action]")).toHaveLength(2);
  expect(first?.querySelector("[data-current-page]")?.textContent).toBe("01");
  expect(first?.querySelector("[data-total-pages]")?.textContent).toBe("18");
  expect(first?.querySelector("svg polyline")?.getAttribute("points")).toBe(
    "25,9 3,35 25,61",
  );
  expect(root.querySelectorAll(".project-tags li").length).toBeGreaterThanOrEqual(
    18,
  );
  expect(root.querySelectorAll(".documents a[download]")).toHaveLength(2);
  expect(
    root.querySelector<HTMLAnchorElement>(
      'a[href="mailto:zkuang0408@gmail.com"]',
    ),
  ).not.toBeNull();
  expect(
    root.querySelector<HTMLAnchorElement>('#contact a[href="mailto:2643414752@qq.com"]'),
  ).not.toBeNull();
  expect(root.textContent).toContain("同济大学设计创意学院");
});

test("renders accessible controls and matching metadata for every project reader", () => {
  const root = document.createElement("main");

  renderPortfolio(root);

  const readers = root.querySelectorAll<HTMLElement>("[data-project-reader]");

  projects.forEach((project, index) => {
    const reader = readers[index];
    const previous = reader?.querySelector<HTMLButtonElement>(
      'button[data-page-action="previous"]',
    );
    const next = reader?.querySelector<HTMLButtonElement>(
      'button[data-page-action="next"]',
    );
    const previousIcon = previous?.querySelector("svg");
    const nextIcon = next?.querySelector("svg");
    const originalPdf = reader?.querySelector<HTMLAnchorElement>(
      "[data-open-original-pdf]",
    );
    const openReader = reader?.querySelector<HTMLButtonElement>("[data-open-reader]");
    const closeReader = reader?.querySelector<HTMLButtonElement>("[data-close-reader]");

    expect(reader?.dataset.pdfUrl).toBe(project.pdf.href);
    expect(reader?.dataset.projectId).toBe(project.id);
    expect(reader?.dataset.expectedPages).toBe(String(project.pdf.pageCount));
    expect(reader?.dataset.projectTitle).toBe(project.title);
    expect(reader?.getAttribute("tabindex")).toBe("0");
    expect(reader?.getAttribute("role")).toBe("group");
    expect(reader?.getAttribute("aria-label")).toBe(
      `${project.title} complete PDF`,
    );
    expect(
      reader?.querySelector<HTMLImageElement>("[data-page-image]")?.alt,
    ).toBe(`${project.pdf.title} — page 1 of ${project.pdf.pageCount}`);
    expect(reader?.querySelectorAll("picture")).toHaveLength(1);
    expect(project.pdf.pages).toHaveLength(project.pdf.pageCount);
    expect(reader?.querySelector("[data-current-page]")?.textContent).toBe("01");
    expect(reader?.querySelector("[data-total-pages]")?.textContent).toBe(
      String(project.pdf.pageCount),
    );
    expect(
      reader?.querySelector('[data-reader-status][aria-live="polite"]')
        ?.textContent,
    ).toBe("Loading project");
    expect(reader?.querySelector("button[data-reader-retry]")?.textContent).toBe(
      "Retry",
    );
    expect(reader?.querySelector<HTMLElement>("[data-reader-error]")?.hidden).toBe(
      true,
    );
    expect(originalPdf?.getAttribute("href")).toBe(project.pdf.href);
    expect(originalPdf?.getAttribute("target")).toBe("_blank");
    expect(originalPdf?.getAttribute("rel")).toBe("noopener");
    expect(previous?.getAttribute("aria-label")).toBe(
      `Previous page of ${project.title}`,
    );
    expect(previous?.getAttribute("type")).toBe("button");
    expect(next?.getAttribute("aria-label")).toBe(
      `Next page of ${project.title}`,
    );
    expect(next?.getAttribute("type")).toBe("button");
    expect(openReader?.getAttribute("aria-label")).toBe(`Open ${project.title} reader`);
    expect(closeReader?.getAttribute("aria-label")).toBe(`Close ${project.title} reader`);
    expect(previousIcon?.getAttribute("viewBox")).toBe("0 0 40 70");
    expect(previousIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(nextIcon?.getAttribute("viewBox")).toBe("0 0 40 70");
    expect(nextIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(previousIcon?.querySelector("polyline")?.getAttribute("points")).toBe(
      "25,9 3,35 25,61",
    );
    expect(nextIcon?.querySelector("polyline")?.getAttribute("points")).toBe(
      "15,9 37,35 15,61",
    );
  });
});

test("does not render false case-study links", () => {
  const root = document.createElement("main");

  renderPortfolio(root);

  expect(root.querySelectorAll("#projects .project-copy a")).toHaveLength(0);
  expect(root.querySelectorAll("#projects .project-copy button")).toHaveLength(0);
});

test("renders the approved selector order and matching editorial chapters", () => {
  const root = document.createElement("main");

  renderPortfolio(root);

  expect(
    Array.from(
      root.querySelectorAll<HTMLElement>("[data-project-selector]"),
      (card) => card.dataset.projectSelector,
    ),
  ).toEqual([
    "inkseat",
    "emovue",
    "evolution-fruit",
    "atempo",
    "urosense",
    "first-fly",
  ]);
  expect(root.querySelectorAll("[data-project-chapter]")).toHaveLength(6);
  expect(root.querySelector("#project-inkseat")?.getAttribute("data-project-chapter"))
    .toBe("inkseat");
  expect(root.querySelectorAll(".project-selector__media picture")).toHaveLength(6);
  expect(root.querySelector("[data-project-selector]")?.textContent).toContain("INKSeat");
});
