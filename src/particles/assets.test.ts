import { describe, expect, it } from "vitest";

import {
  PARTICLE_PORTRAIT_URL,
  RESUME_PORTRAIT_URL,
} from "./assets";

describe("portrait assets", () => {
  it("keeps the homepage particle source separate from the resume portrait", () => {
    expect(PARTICLE_PORTRAIT_URL).toContain("portrait");
    expect(RESUME_PORTRAIT_URL).toBe("/portrait-resume-retouched-v1.png");
    expect(PARTICLE_PORTRAIT_URL).not.toBe(RESUME_PORTRAIT_URL);
  });
});
