import { documents, profile, projects } from "../content/portfolio";

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

function renderProjects(): string {
  const projectMarkup = projects
    .map(
      (project) => `
        <article class="project-card" id="project-${project.id}">
          <figure class="project-media">
            <img src="${project.image}" alt="${project.imageAlt}" loading="lazy" decoding="async" />
          </figure>
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
      <div class="project-list">${projectMarkup}</div>
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

export function renderPortfolio(root: HTMLElement): void {
  root.insertAdjacentHTML(
    "beforeend",
    `${renderAbout()}${renderProjects()}${renderDocuments()}${renderContact()}`,
  );
}
