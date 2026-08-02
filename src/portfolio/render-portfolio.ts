import {
  documents,
  profile,
  projects,
  type Project,
} from "../content/portfolio";
import { renderResume } from "../resume/render-resume";

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

function renderSectionHeading(index: string, eyebrow: string, title: string): string {
  return `
    <header class="section-heading">
      <p class="section-index"><span>${index}</span> / ${eyebrow}</p>
      <h2>${title}</h2>
    </header>
  `;
}

function renderAbout(): string {
  const capabilities = profile.capabilities
    .map(
      ({ title, items }) => `
        <article class="capability">
          <h3>${title}</h3>
          <ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>
        </article>
      `,
    )
    .join("");

  return `
    <section class="portfolio-section about" id="about" aria-labelledby="about-title">
      ${renderSectionHeading("02", "ABOUT", '<span id="about-title">About — Designing between</span> <em>objects &amp; intelligence.</em>')}
      <div class="about-grid">
        <div class="about-copy">
          <p class="about-lead">${profile.introduction}</p>
          <div class="education">
            <p class="education-label">Education</p>
            <h3>${profile.education.school}</h3>
            <p>${profile.education.program}</p>
            <time>${profile.education.period}</time>
          </div>
        </div>
        <div class="capability-list" aria-label="能力领域">${capabilities}</div>
      </div>
    </section>
  `;
}

function renderProjectReader(project: Project): string {
  const projectTitle = escapeHtml(project.title);
  const pdfTitle = escapeHtml(project.pdf.title);
  const pdfUrl = escapeHtml(project.pdf.href);
  const expectedPages = String(project.pdf.pageCount);
  const firstPage = project.pdf.pages[0];
  if (!firstPage) {
    throw new Error(`Missing first generated page for ${project.id}`);
  }
  const firstMobile = escapeHtml(firstPage.mobile);
  const firstDesktop = escapeHtml(firstPage.desktop);

  return `
    <figure
      class="project-media project-reader"
      data-project-reader
      data-project-id="${escapeHtml(project.id)}"
      data-pdf-url="${pdfUrl}"
      data-expected-pages="${expectedPages}"
      data-project-title="${projectTitle}"
      tabindex="0"
      role="group"
      aria-label="${projectTitle} complete PDF"
    >
      <div class="project-reader-stage" data-reader-stage>
        <picture data-page-picture>
          <source
            data-page-mobile
            media="(max-width: 760px)"
            srcset="${firstMobile}"
          />
          <img
            data-page-image
            src="${firstDesktop}"
            alt="${pdfTitle} — page 1 of ${expectedPages}"
            loading="lazy"
            decoding="async"
          />
        </picture>
        <p data-reader-status aria-live="polite">Loading project</p>
        <div data-reader-error hidden>
          <p>Unable to load this project.</p>
          <button type="button" data-reader-retry>Retry</button>
        </div>
        <button
          class="project-reader-chevron project-reader-chevron--previous"
          type="button"
          data-page-action="previous"
          aria-label="Previous page of ${projectTitle}"
        >
          <svg viewBox="0 0 40 70" aria-hidden="true">
            <polyline points="25,9 3,35 25,61"></polyline>
          </svg>
        </button>
        <button
          class="project-reader-chevron project-reader-chevron--next"
          type="button"
          data-page-action="next"
          aria-label="Next page of ${projectTitle}"
        >
          <svg viewBox="0 0 40 70" aria-hidden="true">
            <polyline points="15,9 37,35 15,61"></polyline>
          </svg>
        </button>
      </div>
      <figcaption class="project-reader-meta">
        <span class="project-reader-counter">
          <strong data-current-page>01</strong><span> / </span><span data-total-pages>${expectedPages}</span>
        </span>
        <a
          data-open-original-pdf
          href="${pdfUrl}"
          target="_blank"
          rel="noopener"
        >Open complete PDF</a>
      </figcaption>
    </figure>
  `;
}

function renderProjects(): string {
  const selectorMarkup = projects
    .map((project) => {
      const firstPage = project.pdf.pages[0];
      if (!firstPage) throw new Error(`Missing selector image for ${project.id}`);
      return `
        <a
          class="project-selector"
          href="#project-${escapeHtml(project.id)}"
          data-project-selector="${escapeHtml(project.id)}"
        >
          <span class="project-selector__media">
            <picture>
              <source media="(max-width: 760px)" srcset="${escapeHtml(firstPage.mobile)}" />
              <img src="${escapeHtml(firstPage.desktop)}" alt="" loading="lazy" decoding="async" />
            </picture>
          </span>
          <span class="project-selector__meta">
            <small>${escapeHtml(project.number)} · ${escapeHtml(project.type)}</small>
            <strong>${escapeHtml(project.title)}</strong>
          </span>
        </a>
      `;
    })
    .join("");
  const projectMarkup = projects
    .map(
      (project) => `
        <article
          class="project-card"
          id="project-${project.id}"
          data-project-chapter="${escapeHtml(project.id)}"
        >
          ${renderProjectReader(project)}
          <div class="project-copy">
            <p class="project-number" aria-hidden="true">${project.number}</p>
            <p class="project-type">${project.type}</p>
            <h3>${project.title}</h3>
            <p class="project-summary">${project.summary}</p>
            <p class="project-role"><span>Role</span>${project.role}</p>
            <ul class="project-tags" aria-label="项目标签">
              ${project.tags.map((tag) => `<li>${tag}</li>`).join("")}
            </ul>
          </div>
        </article>
      `,
    )
    .join("");

  return `
    <section class="portfolio-section projects" id="projects" aria-labelledby="projects-title">
      ${renderSectionHeading("03", "SELECTED WORK", '<span id="projects-title">Selected</span> <em>projects.</em>')}
      <nav class="project-selector-rail" aria-label="选择项目">${selectorMarkup}</nav>
      <div class="project-list project-chapters">${projectMarkup}</div>
    </section>
  `;
}

function renderDocuments(): string {
  const links = documents
    .map(
      (document) => `
        <a href="${document.href}" download="${document.filename}">
          <span>${document.label}</span>
          <strong>${document.format}</strong>
        </a>
      `,
    )
    .join("");

  return `
    <aside class="documents" aria-labelledby="documents-title">
      <p class="documents-kicker">Portfolio files</p>
      <h2 id="documents-title">View the complete process.</h2>
      <div class="document-links">${links}</div>
    </aside>
  `;
}

function renderContact(): string {
  return `
    <section class="portfolio-section contact" id="contact" aria-labelledby="contact-title">
      ${renderSectionHeading("04", "CONTACT", '<span id="contact-title">Let\'s build what</span> <em>comes next.</em>')}
      <div class="contact-grid">
        <p>欢迎交流产品、交互、AI 应用与未来体验方向的设计合作。</p>
        <div class="contact-meta">
          <a href="mailto:${profile.email}">${profile.email}</a>
          <span>${profile.location}</span>
        </div>
      </div>
      <footer class="site-footer">
        <span>${profile.name} · ${profile.discipline}</span>
        <span>© 2026</span>
      </footer>
    </section>
  `;
}

export interface RenderPortfolioOptions {
  readonly portraitUrl?: string;
}

export function renderPortfolio(
  root: HTMLElement,
  options: RenderPortfolioOptions = {},
): void {
  const portraitUrl = options.portraitUrl ?? "/portrait-resume-retouched-v1.png";
  root.insertAdjacentHTML(
    "beforeend",
    `${renderResume(profile, portraitUrl)}${renderProjects()}${renderDocuments()}${renderContact()}`,
  );
}
