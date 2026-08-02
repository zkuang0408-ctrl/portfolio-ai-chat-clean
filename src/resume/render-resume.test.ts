import { expect, test } from "vitest";

import { profile } from "../content/portfolio";
import { renderResume } from "./render-resume";

test("renders the approved public landscape resume without private details", () => {
  const host = document.createElement("div");
  host.innerHTML = renderResume(profile, "/portrait-resume-retouched-v1.png");
  const resume = host.querySelector<HTMLElement>("#resume");

  expect(resume).not.toBeNull();
  expect(resume?.querySelector(".resume-panel")).not.toBeNull();
  expect(resume?.querySelector<HTMLImageElement>(".resume-portrait")?.src).toContain(
    "portrait-resume-retouched-v1.png",
  );
  expect(resume?.querySelectorAll("[data-resume-section]").length).toBeGreaterThan(3);
  expect(resume?.textContent).toContain("zkuang0408@gmail.com");
  expect(resume?.textContent).toContain("2643414752@qq.com");
  expect(resume?.textContent).toContain("Shanghai, China");
  expect(resume?.textContent).not.toMatch(/\+?86|189\d{8}|上海市.+(?:路|号)/);
  expect(
    resume?.querySelector<HTMLAnchorElement>(".resume-download")?.getAttribute("href"),
  ).toBe("/documents/zhao-shikuang-resume-public.pdf");
});

test("uses semantic headings and mail actions in the resume", () => {
  const host = document.createElement("div");
  host.innerHTML = renderResume(profile, "/portrait.png");

  expect(host.querySelector("#resume-title")?.textContent).toBe("赵实旷");
  expect(host.querySelectorAll('#resume a[href^="mailto:"]')).toHaveLength(2);
  expect(host.querySelector(".resume-portrait")?.getAttribute("alt")).toContain("赵实旷");
});
