import type { Profile } from "../content/portfolio";

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

export function renderResume(profile: Profile, portraitUrl: string): string {
  const sections = profile.resumeSections
    .map(
      (section) => `
        <section class="resume-entry" data-resume-section>
          <p class="resume-entry__label">${escapeHtml(section.label)}</p>
          <h3>${escapeHtml(section.title)}</h3>
          <ul>
            ${section.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ul>
        </section>
      `,
    )
    .join("");

  const emails = profile.emails
    .map(
      (email) =>
        `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`,
    )
    .join("");

  return `
    <section class="resume" id="resume" aria-labelledby="resume-title">
      <div class="resume-panel">
        <aside class="resume-identity">
          <img
            class="resume-portrait"
            src="${escapeHtml(portraitUrl)}"
            alt="赵实旷黑白肖像"
            loading="lazy"
            decoding="async"
          />
          <div class="resume-identity__copy">
            <h2 id="resume-title">${escapeHtml(profile.name)}</h2>
            <p>${escapeHtml(profile.discipline)}</p>
            <div class="resume-contact">${emails}<span>${escapeHtml(profile.location)}</span></div>
          </div>
        </aside>
        <div class="resume-body">
          <div class="resume-body__header">
            <p>PROFILE / SELECTED EXPERIENCE</p>
            <a class="resume-download" href="${escapeHtml(profile.resumeHref)}" download>
              下载公开简历 PDF
            </a>
          </div>
          <div class="resume-entries">${sections}</div>
        </div>
      </div>
    </section>
  `;
}
