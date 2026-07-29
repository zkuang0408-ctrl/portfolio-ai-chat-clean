import { existsSync, readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, test } from "vitest";
import atempoJson from "./projects/atempo.json";
import emovueJson from "./projects/emovue.json";
import evolutionFruitJson from "./projects/evolution-fruit.json";
import firstFlyJson from "./projects/first-fly.json";
import inkseatJson from "./projects/inkseat.json";
import urosenseJson from "./projects/urosense.json";
import glossaryJson from "./glossary.json";
import {
  authoredGlossary,
  authoredProjects,
  buildIntentAliases,
  buildPageKnowledgeMap,
  resolveProjectManifestValidation,
} from "./index";
import { buildAuthoredChunks } from "./build-authored-chunks";
import { knowledgeSources } from "../manifest";
import { validateProjectDossier } from "./validate";
import type { KnowledgeSource } from "../types";
import type {
  AuthoredGlossary,
  AuthoredProjectDossier,
  KnowledgeClaim,
  KnowledgeIntent,
} from "./types";

const projectId = "minimal-project";
const intents = [
  "overview", "problem", "research", "solution", "architecture", "interaction",
  "technology", "form", "value", "comparison", "contribution",
] as const satisfies readonly KnowledgeIntent[];

const contributionReviewUrl = new URL(
  "../../../../docs/knowledge/portfolio-contribution-review" + ".md",
  import.meta.url,
);

const expectedCandidateEvidenceByProject = {
  inkseat: {
    "inkseat.contribution.system-analysis": [3, 4, 5, 6],
    "inkseat.contribution.information-architecture": [8, 10, 11, 17],
    "inkseat.contribution.recommendation-logic": [8, 9],
    "inkseat.contribution.terminal-interface": [11, 15, 16],
  },
  emovue: {
    "emovue.contribution.product-positioning": [],
    "emovue.contribution.form-exploration": [],
    "emovue.contribution.interaction-flow": [],
    "emovue.contribution.app-interface": [],
    "emovue.contribution.packaging": [],
  },
  "evolution-fruit": {
    "evolution-fruit.contribution.concept": [],
    "evolution-fruit.contribution.parametric-model": [],
    "evolution-fruit.contribution.visual-generation": [],
    "evolution-fruit.contribution.physical-making": [],
  },
  atempo: {
    "atempo.contribution.research": [4, 6, 7],
    "atempo.contribution.interaction": [10, 11],
    "atempo.contribution.data-translation": [13],
    "atempo.contribution.technology-prototype": [15],
    "atempo.contribution.form-design": [17, 18],
  },
  urosense: {
    "urosense.contribution.field-research": [3, 4, 5],
    "urosense.contribution.system-architecture": [12, 13],
    "urosense.contribution.measurement-flow": [14, 16],
    "urosense.contribution.installation": [21],
    "urosense.contribution.form-design": [17, 18, 19, 20],
  },
  "first-fly": {
    "first-fly.contribution.concept": [10, 11],
    "first-fly.contribution.user-research": [12, 13],
    "first-fly.contribution.journey": [14],
    "first-fly.contribution.spatial-form": [15, 16, 17, 18, 19, 20],
    "first-fly.contribution.ar-interaction": [21, 23],
  },
} as const;

function reviewClaimBlock(review: string, claimId: string): string {
  const start = review.indexOf(`#### ${claimId}`);
  expect(start, `review includes ${claimId}`).toBeGreaterThanOrEqual(0);
  const end = review.indexOf("#### ", start + 1);
  return review.slice(start, end === -1 ? undefined : end);
}

function minimalDossier(): AuthoredProjectDossier {
  const claim = {
    id: "overview-claim",
    text: "A public document fact.",
    provenance: "document_fact" as const,
    evidence: [{ sourceId: projectId, page: 1 }],
    intents: ["overview"] as const,
    topics: ["summary"],
    public: true,
  };
  return {
    projectId,
    title: "Minimal project",
    aliases: ["minimal"],
    oneLine: "One line summary.",
    pageCount: 1,
    claims: [claim],
    sectionClaims: intents.reduce<AuthoredProjectDossier["sectionClaims"]>(
      (sections, intent) => ({ ...sections, [intent]: intent === "overview" ? [claim.id] : [] }),
      {} as AuthoredProjectDossier["sectionClaims"],
    ),
    pages: [{ page: 1, role: "cover", informationDensity: "low", visualSummary: "A cover.", entities: ["project"], relationships: ["introduces project"], claimIds: [claim.id] }],
    commonQuestions: [{ question: "What is it?", locale: "en", intents: ["overview"], preferredClaimIds: [claim.id] }],
  };
}

function validate(candidate: unknown): AuthoredProjectDossier {
  return validateProjectDossier(candidate, { expectedProjectId: projectId, expectedPageCount: 1 });
}

function expectPublicSectionClaimReferences(dossier: AuthoredProjectDossier): void {
  const claimsById = new Map(dossier.claims.map((claim) => [claim.id, claim]));
  for (const [section, claimIds] of Object.entries(dossier.sectionClaims)) {
    for (const claimId of claimIds) {
      const claim = claimsById.get(claimId);
      expect(claim, `${section} section claim ${claimId} resolves`).toBeDefined();
      expect(claim?.public, `${section} section claim ${claimId} is public`).toBe(true);
      if (intents.includes(section as KnowledgeIntent)) {
        expect(claim?.intents, `${section} section claim ${claimId} declares its section intent`)
          .toContain(section);
      }
    }
  }
}

function expectIntentAlignedPublicQuestionClaims(dossier: AuthoredProjectDossier): void {
  const claimsById = new Map(dossier.claims.map((claim) => [claim.id, claim]));
  for (const question of dossier.commonQuestions) {
    for (const claimId of question.preferredClaimIds) {
      const claim = claimsById.get(claimId);
      expect(
        claim?.public,
        `question "${question.question}" preferred claim ${claimId} is public`,
      ).toBe(true);
      expect(
        claim?.intents.some((intent) => question.intents.includes(intent)),
        `question "${question.question}" preferred claim ${claimId} is intent-aligned`,
      ).toBe(true);
    }
  }
}

function expectConservativeOwnerStatement(
  dossier: AuthoredProjectDossier,
  claimId: string,
): void {
  const ownerStatement = dossier.claims.find(({ id }) => id === claimId);
  expect(ownerStatement).toMatchObject({
    id: claimId,
    provenance: "owner_statement",
    evidence: [],
    intents: ["contribution"],
    public: true,
  });
  expect(ownerStatement?.text).toContain("核心贡献者");
  expect(ownerStatement?.text).toContain("实质性");
  expect(ownerStatement?.text).toContain("团队成果");
  const forbiddenPhrases = [
    "sole",
    "lead",
    "主导",
    "负责人",
    "个人完成",
    "全部完成",
    "唯一",
    "独立完成",
  ];
  for (const phrase of forbiddenPhrases) {
    expect(ownerStatement?.text.toLowerCase(), `${claimId} omits "${phrase}"`)
      .not.toContain(phrase.toLowerCase());
  }
}

function expectEvidencePagesBacklinked(dossier: AuthoredProjectDossier): void {
  const pagesByNumber = new Map(dossier.pages.map((page) => [page.page, page]));
  for (const claim of dossier.claims) {
    for (const evidence of claim.evidence) {
      expect(
        pagesByNumber.get(evidence.page)?.claimIds,
        `${claim.id} is backlinked from evidence page ${evidence.page}`,
      ).toContain(claim.id);
    }
  }
}

function expectConservativeCoreContributor(
  dossier: AuthoredProjectDossier,
  claimId: string,
): void {
  const ownerStatement = dossier.claims.find(({ id }) => id === claimId);
  expect(ownerStatement).toMatchObject({
    id: claimId,
    provenance: "owner_statement",
    evidence: [],
    intents: ["contribution"],
    public: true,
  });
  expect(ownerStatement?.text).toContain("赵实旷");
  expect(ownerStatement?.text).toContain("核心贡献者");
  expect(ownerStatement?.text).toContain("承担了较多工作");
  for (const phrase of [
    "sole", "lead", "主导", "负责人", "个人完成", "全部完成", "唯一", "独立完成",
  ]) {
    expect(ownerStatement?.text.toLowerCase(), `${claimId} omits "${phrase}"`)
      .not.toContain(phrase.toLowerCase());
  }
}

describe("authored knowledge contracts", () => {
  test("provides a reviewer-facing contribution review document", () => {
    expect(existsSync(contributionReviewUrl), contributionReviewUrl.href).toBe(true);
  });

  test("keeps every candidate private, evidenced, out of chunks, and synchronized to the review", () => {
    const review = readFileSync(contributionReviewUrl, "utf8");
    const projectHeadings = [
      "INKSeat",
      "EMOVUE",
      "Fruit & Evolution",
      "Atempo",
      "UroSense",
      "First Fly",
    ];
    let previousHeadingPosition = -1;
    for (const title of projectHeadings) {
      const position = review.indexOf(`## ${title}`);
      expect(position, `review includes ${title}`).toBeGreaterThan(previousHeadingPosition);
      previousHeadingPosition = position;
    }

    const candidates = authoredProjects.flatMap((dossier) => dossier.claims.filter(
      ({ provenance }) => provenance === "candidate_contribution",
    ));
    expect(candidates).toHaveLength(28);
    expect(candidates.every(({ public: isPublic }) => !isPublic)).toBe(true);

    for (const dossier of authoredProjects) {
      const expected = expectedCandidateEvidenceByProject[
        dossier.projectId as keyof typeof expectedCandidateEvidenceByProject
      ];
      expect(expected, `${dossier.projectId} has an expected candidate map`).toBeDefined();
      const projectCandidates = dossier.claims.filter(
        ({ provenance }) => provenance === "candidate_contribution",
      );
      expect(projectCandidates.map(({ id }) => id)).toStrictEqual(Object.keys(expected));

      const ownerStatements = dossier.claims.filter(
        ({ provenance }) => provenance === "owner_statement",
      );
      expect(ownerStatements, `${dossier.projectId} has one owner statement`).toHaveLength(1);
      expect(ownerStatements[0]).toMatchObject({
        provenance: "owner_statement",
        public: true,
        evidence: [],
      });
      expect(review).toContain(`Claim ID：\`${ownerStatements[0]!.id}\``);
      expect(review).toContain(ownerStatements[0]!.text);

      const source = knowledgeSources.find(({ id }) => id === dossier.projectId);
      expect(source?.publicHref, `${dossier.projectId} has a public PDF viewer`).toBeTruthy();
      for (const candidate of projectCandidates) {
        const expectedPages = (
          expected as Readonly<Record<string, readonly number[]>>
        )[candidate.id];
        if (expectedPages === undefined) {
          throw new Error(`Missing expected evidence pages for ${candidate.id}`);
        }
        expect(candidate.evidence.map(({ page }) => page)).toStrictEqual(expectedPages);
        const block = reviewClaimBlock(review, candidate.id);
        expect(block).toContain(candidate.text);
        expect(block).toContain("当前状态：`待确认`");
        expect(block).toContain("公开状态：`否`");
        if (expectedPages.length === 0) {
          expect(block).toContain("evidence pages：无");
        } else {
          for (const page of expectedPages) {
            expect(block).toContain(`[p.${page}](${source!.publicHref}#page=${page})`);
          }
        }
      }
    }

    expect((review.match(/状态：`已确认`/gu) ?? [])).toHaveLength(6);
    const chunks = buildAuthoredChunks(authoredProjects);
    const candidateChunkIds = authoredProjects.flatMap((dossier) => dossier.claims
      .filter(({ provenance }) => provenance === "candidate_contribution")
      .map(({ id }) => `${dossier.projectId}:claim:${id}`));
    expect(chunks.map(({ id }) => id)).not.toEqual(expect.arrayContaining(candidateChunkIds));
  });

  test("keeps contribution candidates distinguishable from public evidence", () => {
    expectTypeOf<KnowledgeClaim["provenance"]>().toEqualTypeOf<
      | "document_fact"
      | "document_synthesis"
      | "owner_statement"
      | "candidate_contribution"
    >();
    expectTypeOf<KnowledgeClaim["public"]>().toEqualTypeOf<boolean>();
  });

  test("uses a closed intent vocabulary", () => {
    expectTypeOf<KnowledgeIntent>().toEqualTypeOf<
      | "overview"
      | "problem"
      | "research"
      | "solution"
      | "architecture"
      | "interaction"
      | "technology"
      | "form"
      | "value"
      | "comparison"
      | "contribution"
    >();
  });

  test("requires a page annotation for every dossier page", () => {
    expectTypeOf<AuthoredProjectDossier["pages"][number]["page"]>()
      .toEqualTypeOf<number>();
  });
});

describe("validateProjectDossier", () => {
  test("returns a valid minimal dossier unchanged", () => {
    const dossier = minimalDossier();
    expect(validate(dossier)).toStrictEqual(dossier);
  });

  test("rejects public candidate contributions", () => {
    const dossier = minimalDossier();
    const candidate: unknown = { ...dossier, claims: [{ ...dossier.claims[0], provenance: "candidate_contribution", public: true }] };
    expect(() => validate(candidate)).toThrow("candidate contribution cannot be public");
  });

  test("rejects evidence for an invalid page", () => {
    const dossier = minimalDossier();
    const candidate: unknown = { ...dossier, claims: [{ ...dossier.claims[0], evidence: [{ sourceId: projectId, page: 2 }] }] };
    expect(() => validate(candidate)).toThrow("invalid evidence page");
  });

  test("requires annotations for every page", () => {
    const candidate: unknown = { ...minimalDossier(), pages: [] };
    expect(() => validate(candidate)).toThrow("must annotate every page");
  });

  test("rejects a mismatched project or page count", () => {
    expect(() => validate({ ...minimalDossier(), projectId: "wrong" })).toThrow();
    expect(() => validate({ ...minimalDossier(), pageCount: 2 })).toThrow();
  });

  test("rejects duplicate claim IDs", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, claims: [...dossier.claims, { ...dossier.claims[0] }] })).toThrow();
  });

  test("requires exactly all section intent keys", () => {
    const dossier = minimalDossier();
    const { overview: _overview, ...withoutOverview } = dossier.sectionClaims;
    expect(() => validate({ ...dossier, sectionClaims: withoutOverview })).toThrow();
    expect(() => validate({ ...dossier, sectionClaims: { ...dossier.sectionClaims, extra: [] } })).toThrow();
  });

  test("rejects unknown references from pages, sections, and questions", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, pages: [{ ...dossier.pages[0], claimIds: ["missing"] }] })).toThrow();
    expect(() => validate({ ...dossier, sectionClaims: { ...dossier.sectionClaims, overview: ["missing"] } })).toThrow();
    expect(() => validate({ ...dossier, commonQuestions: [{ ...dossier.commonQuestions[0], preferredClaimIds: ["missing"] }] })).toThrow();
  });

  test("rejects private claims referenced by sections", () => {
    const dossier = minimalDossier();
    const privateClaim = {
      ...dossier.claims[0],
      id: "private-claim",
      provenance: "candidate_contribution" as const,
      evidence: [],
      intents: ["problem"] as const,
      public: false,
    };
    expect(() => validate({
      ...dossier,
      claims: [...dossier.claims, privateClaim],
      sectionClaims: { ...dossier.sectionClaims, problem: [privateClaim.id] },
    })).toThrow("Section problem cannot reference private claim private-claim");
  });

  test("rejects section claims that do not declare the section intent", () => {
    const dossier = minimalDossier();
    expect(() => validate({
      ...dossier,
      sectionClaims: { ...dossier.sectionClaims, problem: [dossier.claims[0]!.id] },
    })).toThrow("Section problem claim overview-claim must declare problem intent");
  });

  test("rejects private preferred claims in common questions", () => {
    const dossier = minimalDossier();
    const privateClaim = {
      ...dossier.claims[0],
      id: "private-claim",
      provenance: "candidate_contribution" as const,
      evidence: [],
      intents: ["contribution"] as const,
      public: false,
    };
    const candidate = {
      ...dossier,
      claims: [...dossier.claims, privateClaim],
      commonQuestions: [{
        ...dossier.commonQuestions[0],
        preferredClaimIds: [privateClaim.id],
      }],
    };
    expect(() => validate(candidate)).toThrow(
      "Common question What is it? cannot reference private claim private-claim",
    );
  });

  test("rejects every intent-misaligned preferred claim in common questions", () => {
    const dossier = minimalDossier();
    const problemClaim = {
      ...dossier.claims[0],
      id: "problem-claim",
      intents: ["problem"] as const,
    };
    expect(() => validate({
      ...dossier,
      claims: [...dossier.claims, problemClaim],
      pages: [{
        ...dossier.pages[0],
        claimIds: [dossier.claims[0]!.id, problemClaim.id],
      }],
      commonQuestions: [{
        ...dossier.commonQuestions[0],
        preferredClaimIds: [dossier.claims[0]!.id, problemClaim.id],
      }],
    })).toThrow(
      "Common question What is it? preferred claim problem-claim must share a question intent",
    );
  });

  test("rejects claim evidence pages without a page backlink", () => {
    const dossier = minimalDossier();
    expect(() => validate({
      ...dossier,
      pages: [{ ...dossier.pages[0], claimIds: [] }],
    })).toThrow("Claim overview-claim evidence page 1 must backlink from page claimIds");
  });

  test("rejects page claim IDs without matching claim evidence", () => {
    const dossier = minimalDossier();
    const pageTwo = {
      ...dossier.pages[0],
      page: 2,
      role: "detail",
      claimIds: [dossier.claims[0]!.id],
    };
    expect(() => validateProjectDossier({
      ...dossier,
      pageCount: 2,
      pages: [dossier.pages[0], pageTwo],
    }, {
      expectedProjectId: projectId,
      expectedPageCount: 2,
    })).toThrow("Page 2 claim overview-claim must cite page 2 as evidence");
  });

  test("requires evidence for document claims", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], evidence: [] }] })).toThrow();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], provenance: "document_synthesis", evidence: [] }] })).toThrow();
  });

  test("allows owner statements without evidence", () => {
    const dossier = minimalDossier();
    expect(() => validate({
      ...dossier,
      claims: [{
        ...dossier.claims[0],
        provenance: "owner_statement",
        evidence: [],
      }],
      pages: [{ ...dossier.pages[0], claimIds: [] }],
    })).not.toThrow();
  });

  test("rejects unknown closed-union values", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], provenance: "unknown" }] })).toThrow();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], intents: ["unknown"] }] })).toThrow();
    expect(() => validate({ ...dossier, pages: [{ ...dossier.pages[0], informationDensity: "unknown" }] })).toThrow();
    expect(() => validate({ ...dossier, commonQuestions: [{ ...dossier.commonQuestions[0], locale: "unknown" }] })).toThrow();
  });

  test("rejects normalized duplicate aliases and questions", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, aliases: ["Minimal", "ｍｉｎｉｍａｌ!"] })).toThrow();
    expect(() => validate({ ...dossier, commonQuestions: [...dossier.commonQuestions, { ...dossier.commonQuestions[0], question: "What— is it?!" }] })).toThrow();
  });

  test("rejects orphan public claims and an overview without a public claim", () => {
    const dossier = minimalDossier();
    const extra = { ...dossier.claims[0], id: "orphan" };
    expect(() => validate({ ...dossier, claims: [...dossier.claims, extra] })).toThrow();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], public: false }] })).toThrow();
  });

  test("checks dossier privacy after structural validation", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, title: "phone: +1 555 010 2048" })).toThrow("Private contact data detected");
  });

  test("rejects unknown dossier keys", () => {
    expect(() => validate({ ...minimalDossier(), unexpected: true })).toThrow();
  });

  test("rejects a non-object dossier", () => {
    expect(() => validate(null)).toThrow();
  });

  test("rejects nonpositive expected and authored page counts", () => {
    const dossier = minimalDossier();
    expect(() => validateProjectDossier(dossier, { expectedProjectId: projectId, expectedPageCount: 0 })).toThrow();
    expect(() => validate({ ...dossier, pageCount: 0 })).toThrow();
  });

  test("rejects empty authored strings", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, title: " " })).toThrow();
    expect(() => validate({ ...dossier, pages: [{ ...dossier.pages[0], role: " " }] })).toThrow();
    expect(() => validate({ ...dossier, pages: [{ ...dossier.pages[0], visualSummary: " " }] })).toThrow();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], id: " " }] })).toThrow();
  });

  test("requires page numbers to be complete and ordered", () => {
    const dossier = minimalDossier();
    const pageTwo = { ...dossier.pages[0], page: 2 };
    const twoPageDossier = { ...dossier, pageCount: 2, pages: [dossier.pages[0], pageTwo] };
    const options = { expectedProjectId: projectId, expectedPageCount: 2 };
    expect(() => validateProjectDossier({ ...twoPageDossier, pages: [dossier.pages[0], dossier.pages[0]] }, options)).toThrow("must annotate every page");
    expect(() => validateProjectDossier({ ...twoPageDossier, pages: [pageTwo, dossier.pages[0]] }, options)).toThrow("must annotate every page");
  });

  test("reports malformed annotated pages as missing annotations", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, pages: [{ ...dossier.pages[0], page: 1.5 }] })).toThrow("must annotate every page");
  });

  test("rejects evidence from a different project", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], evidence: [{ sourceId: "another-project", page: 1 }] }] })).toThrow();
  });

  test("copies validated intent arrays instead of retaining caller-owned arrays", () => {
    const dossier = minimalDossier();
    const sourceIntents = ["overview"];
    const candidate = { ...dossier, claims: [{ ...dossier.claims[0], intents: sourceIntents }] };
    const validated = validate(candidate);
    sourceIntents.push("problem");
    expect(validated.claims[0]?.intents).toStrictEqual(["overview"]);
  });

  test("rejects sparse intent arrays", () => {
    const dossier = minimalDossier();
    const sparseIntents = new Array<string>(1);
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], intents: sparseIntents }] })).toThrow();
  });

  test("rejects punctuation-only aliases and questions", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, aliases: ["---"] })).toThrow();
    expect(() => validate({ ...dossier, commonQuestions: [{ ...dossier.commonQuestions[0], question: "???" }] })).toThrow();
  });
});

describe("INKSeat authored dossier", () => {
  const inkseat = validateProjectDossier(inkseatJson, {
    expectedProjectId: "inkseat",
    expectedPageCount: 18,
  });

  test("annotates all 18 pages in canonical order", () => {
    expect(inkseat.pages).toHaveLength(18);
    expect(inkseat.pages.map(({ page }) => page)).toStrictEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
    expect(
      inkseat.pages.map(({ page, role, informationDensity }) => [
        page,
        role,
        informationDensity,
      ]),
    ).toStrictEqual([
      [1, "overview", "high"],
      [2, "contents", "low"],
      [3, "cabin-trend", "high"],
      [4, "in-flight-advertising", "high"],
      [5, "contradiction-analysis", "high"],
      [6, "market-gap", "high"],
      [7, "e-paper-feasibility", "high"],
      [8, "system-architecture", "high"],
      [9, "explainable-recommendation", "high"],
      [10, "content-library-and-personas", "high"],
      [11, "backend-and-interface", "high"],
      [12, "demonstration", "low"],
      [13, "demonstration", "medium"],
      [14, "demonstration", "low"],
      [15, "form-and-viewing-relationship", "high"],
      [16, "structure-and-cmf", "high"],
      [17, "whole-flight-journey", "high"],
      [18, "closing", "low"],
    ]);
    expect(inkseat.pages.find(({ page }) => page === 1)).toMatchObject({
      role: "overview",
      informationDensity: "high",
    });
    expect(inkseat.pages.find(({ page }) => page === 8)).toMatchObject({
      role: "system-architecture",
      informationDensity: "high",
    });
    expect(inkseat.pages.find(({ page }) => page === 14)).toMatchObject({
      role: "demonstration",
      informationDensity: "low",
    });
  });

  test("maps evidence-supported claims to the key overview, architecture, and demonstration pages", () => {
    expect(inkseat.pages.find(({ page }) => page === 1)?.claimIds).toContain(
      "inkseat.overview",
    );
    expect(inkseat.pages.find(({ page }) => page === 8)?.claimIds).toContain(
      "inkseat.architecture",
    );
    const pageFourteenClaimIds =
      inkseat.pages.find(({ page }) => page === 14)?.claimIds ?? [];
    expect(pageFourteenClaimIds).not.toContain("inkseat.overview");
    expect(pageFourteenClaimIds).not.toContain("inkseat.problem");
    expect(pageFourteenClaimIds).not.toContain("inkseat.architecture");
  });

  test("indexes overview, architecture, and comparison sections", () => {
    expect(inkseat.sectionClaims.overview).toContain("inkseat.overview");
    expect(inkseat.sectionClaims.architecture).toContain("inkseat.architecture");
    expect(inkseat.sectionClaims.comparison).toEqual(
      expect.arrayContaining(["inkseat.architecture", "inkseat.journey"]),
    );
    expect(
      inkseat.claims.find(({ id }) => id === "inkseat.architecture")?.intents,
    ).toEqual(expect.arrayContaining(["architecture", "comparison"]));
  });

  test("keeps draft contribution candidates private and identifies the owner-confirmed contribution", () => {
    const contributionCandidates = inkseat.claims.filter(
      ({ provenance }) => provenance === "candidate_contribution",
    );
    expect(contributionCandidates).toHaveLength(4);
    expect(contributionCandidates.every(({ public: isPublic }) => !isPublic)).toBe(true);
    expect(inkseat.claims.find(({ id }) => id === "inkseat.core-contributor")).toMatchObject({
      provenance: "owner_statement",
      evidence: [],
      public: true,
    });
  });

  test("keeps the strict validator migration minimal and bidirectionally linked", () => {
    expect(inkseat.claims.find(({ id }) => id === "inkseat.feasibility")?.intents)
      .toContain("research");
    expect(inkseat.claims.find(({ id }) => id === "inkseat.architecture")?.intents)
      .toContain("value");
    expect(inkseat.sectionClaims.contribution).toStrictEqual([
      "inkseat.core-contributor",
    ]);
    expectEvidencePagesBacklinked(inkseat);
  });

  test("routes the two canonical Chinese questions to their preferred claims", () => {
    expect(inkseat.commonQuestions.find(({ question }) => question === "inkseat是什么作品")).toMatchObject({
      intents: ["overview"],
      preferredClaimIds: ["inkseat.overview"],
    });
    expect(inkseat.commonQuestions.find(({ question }) => question === "INKSeat的系统架构是什么")).toMatchObject({
      intents: ["architecture"],
      preferredClaimIds: ["inkseat.architecture"],
    });
  });
});

describe("EMOVUE authored dossier", () => {
  const emovue = validateProjectDossier(emovueJson, {
    expectedProjectId: "emovue",
    expectedPageCount: 19,
  });

  test("keeps the approved identity and complete canonical page map", () => {
    expect(emovue).toMatchObject({
      projectId: "emovue",
      title: "EMOVUE",
      oneLine: "a neck-worn emotion-sensing camera concept that uses physiological-signal changes to trigger recording and AI-assisted organization/editing",
      pageCount: 19,
    });
    expect(emovue.aliases).toEqual(
      expect.arrayContaining([
        "emo vue",
        "情绪感知穿戴相机",
        "emotion-sensing wearable camera",
      ]),
    );
    expect(
      emovue.pages.map(({ page, role, informationDensity }) => [
        page,
        role,
        informationDensity,
      ]),
    ).toStrictEqual([
      [1, "overview", "high"],
      [2, "research", "high"],
      [3, "positioning-and-persona", "high"],
      [4, "customer-journey", "medium"],
      [5, "mood-board", "medium"],
      [6, "concept-sketches", "medium"],
      [7, "ai-form-exploration", "medium"],
      [8, "product-and-functions", "high"],
      [9, "product-details", "high"],
      [10, "exploded-view", "high"],
      [11, "companion-app", "high"],
      [12, "app-functions", "high"],
      [13, "emotional-preview", "high"],
      [14, "wearing-and-charging", "high"],
      [15, "technical-prototype", "high"],
      [16, "human-factors", "high"],
      [17, "packaging", "medium"],
      [18, "presentation", "low"],
      [19, "closing", "low"],
    ]);
  });

  test("publishes exactly the approved evidence-backed and owner claims", () => {
    expect(emovue.claims.filter(({ public: isPublic }) => isPublic).map(({ id }) => id)).toStrictEqual([
      "emovue.overview",
      "emovue.problem",
      "emovue.positioning",
      "emovue.product",
      "emovue.app",
      "emovue.wearing",
      "emovue.technical-prototype",
      "emovue.human-factors",
      "emovue.packaging",
      "emovue.core-contributor",
    ]);
    expect(emovue.claims.find(({ id }) => id === "emovue.product")?.evidence).toStrictEqual([
      { sourceId: "emovue", page: 8 },
      { sourceId: "emovue", page: 9 },
      { sourceId: "emovue", page: 10 },
    ]);
    expect(emovue.claims.find(({ id }) => id === "emovue.product")?.topics).toEqual(
      expect.arrayContaining([
        "可调滑轨",
        "磁吸或结构连接",
        "PPG/心率",
        "EDA/皮肤电",
        "控制板",
        "麦克风",
        "相机构件",
      ]),
    );
    expect(emovue.pages.find(({ page }) => page === 9)?.claimIds).toContain(
      "emovue.product",
    );
    expect(emovue.pages.find(({ page }) => page === 10)?.claimIds).toContain(
      "emovue.product",
    );
    expect(emovue.claims.find(({ id }) => id === "emovue.technical-prototype")?.evidence).toContainEqual({
      sourceId: "emovue",
      page: 15,
    });
    expect(emovue.claims.find(({ id }) => id === "emovue.positioning")?.intents)
      .toContain("value");
  });

  test("indexes only public claims that declare their section intent", () => {
    expectPublicSectionClaimReferences(emovue);
  });

  test("routes every question through an intent-aligned public preferred claim", () => {
    expectIntentAlignedPublicQuestionClaims(emovue);
  });

  test("keeps contribution candidates private and the owner statement conservative", () => {
    const candidates = emovue.claims.filter(
      ({ provenance }) => provenance === "candidate_contribution",
    );
    expect(candidates.map(({ id }) => id)).toStrictEqual([
      "emovue.contribution.product-positioning",
      "emovue.contribution.form-exploration",
      "emovue.contribution.interaction-flow",
      "emovue.contribution.app-interface",
      "emovue.contribution.packaging",
    ]);
    expect(candidates.every(({ public: isPublic }) => !isPublic)).toBe(true);
    expectConservativeOwnerStatement(emovue, "emovue.core-contributor");
  });

  test("routes canonical EMOVUE questions to the required claims", () => {
    expect(emovue.commonQuestions).toHaveLength(12);
    expect(emovue.commonQuestions.find(({ question }) => question === "EMOVUE是什么作品")).toMatchObject({
      intents: ["overview"],
      preferredClaimIds: ["emovue.overview"],
    });
    expect(emovue.commonQuestions.find(({ question }) => question === "EMOVUE如何自动捕捉情绪瞬间")).toMatchObject({
      intents: ["technology", "solution"],
      preferredClaimIds: ["emovue.technical-prototype", "emovue.product"],
    });
  });
});

describe("Fruit & Evolution authored dossier", () => {
  const fruit = validateProjectDossier(evolutionFruitJson, {
    expectedProjectId: "evolution-fruit",
    expectedPageCount: 25,
  });

  test("keeps the approved identity and complete canonical page map", () => {
    expect(fruit).toMatchObject({
      projectId: "evolution-fruit",
      title: "Fruit & Evolution",
      oneLine: "generative food-design project translating fruit evolution and climate logic into algorithmic descriptions, parametric forms, and physical edible prototypes",
      pageCount: 25,
    });
    expect(fruit.aliases).toEqual(
      expect.arrayContaining([
        "果实与演化",
        "果实演化",
        "fruit evolution",
        "参数化食物设计",
      ]),
    );
    expect(
      fruit.pages.map(({ page, role, informationDensity }) => [
        page,
        role,
        informationDensity,
      ]),
    ).toStrictEqual([
      [1, "overview", "high"],
      [2, "process", "high"],
      [3, "evolution-inspiration", "high"],
      [4, "morphology-study", "medium"],
      [5, "morphology-patterns", "medium"],
      [6, "concept-logic", "high"],
      [7, "fruit-environment-concept", "medium"],
      [8, "process-recap", "low"],
      [9, "algorithm-platform", "medium"],
      [10, "algorithm-input", "high"],
      [11, "climate-knowledge-workflow", "high"],
      [12, "morphology-output", "high"],
      [13, "flavor-output", "high"],
      [14, "process-recap", "low"],
      [15, "parametric-exploration", "medium"],
      [16, "parametric-model", "high"],
      [17, "evolution-path", "high"],
      [18, "algorithm-driven-family", "high"],
      [19, "process-recap", "low"],
      [20, "mold-making", "high"],
      [21, "material-preparation", "medium"],
      [22, "jelly-display", "medium"],
      [23, "jelly-display", "medium"],
      [24, "taro-display", "medium"],
      [25, "closing", "low"],
    ]);
  });

  test("publishes exactly the approved evidence-backed and owner claims", () => {
    expect(fruit.claims.filter(({ public: isPublic }) => isPublic).map(({ id }) => id)).toStrictEqual([
      "evolution-fruit.overview",
      "evolution-fruit.inspiration",
      "evolution-fruit.system",
      "evolution-fruit.algorithm",
      "evolution-fruit.parametric-model",
      "evolution-fruit.physical-making",
      "evolution-fruit.value",
      "evolution-fruit.core-contributor",
    ]);
    expect(fruit.claims.find(({ id }) => id === "evolution-fruit.algorithm")?.evidence).toContainEqual({
      sourceId: "evolution-fruit",
      page: 10,
    });
    expect(fruit.claims.find(({ id }) => id === "evolution-fruit.system")?.evidence).toStrictEqual([
      { sourceId: "evolution-fruit", page: 6 },
      { sourceId: "evolution-fruit", page: 7 },
      { sourceId: "evolution-fruit", page: 10 },
      { sourceId: "evolution-fruit", page: 11 },
      { sourceId: "evolution-fruit", page: 12 },
      { sourceId: "evolution-fruit", page: 13 },
    ]);
    expect(fruit.pages.find(({ page }) => page === 7)?.claimIds).toContain(
      "evolution-fruit.system",
    );
    expect(fruit.claims.find(({ id }) => id === "evolution-fruit.parametric-model")?.evidence).toContainEqual({
      sourceId: "evolution-fruit",
      page: 16,
    });
    expect(fruit.claims.find(({ id }) => id === "evolution-fruit.system")?.intents)
      .toEqual(expect.arrayContaining(["research", "interaction"]));
    expect(fruit.claims.find(({ id }) => id === "evolution-fruit.physical-making")?.intents)
      .toEqual(expect.arrayContaining(["value", "comparison"]));
  });

  test("indexes only public claims that declare their section intent", () => {
    expectPublicSectionClaimReferences(fruit);
  });

  test("routes every question through an intent-aligned public preferred claim", () => {
    expectIntentAlignedPublicQuestionClaims(fruit);
  });

  test("keeps contribution candidates private and the owner statement conservative", () => {
    const candidates = fruit.claims.filter(
      ({ provenance }) => provenance === "candidate_contribution",
    );
    expect(candidates.map(({ id }) => id)).toStrictEqual([
      "evolution-fruit.contribution.concept",
      "evolution-fruit.contribution.parametric-model",
      "evolution-fruit.contribution.visual-generation",
      "evolution-fruit.contribution.physical-making",
    ]);
    expect(candidates.every(({ public: isPublic }) => !isPublic)).toBe(true);
    expectConservativeOwnerStatement(fruit, "evolution-fruit.core-contributor");
  });

  test("routes canonical Fruit & Evolution questions to the required claims", () => {
    expect(fruit.commonQuestions).toHaveLength(12);
    expect(fruit.commonQuestions.find(({ question }) => question === "Fruit & Evolution是什么作品")).toMatchObject({
      intents: ["overview"],
      preferredClaimIds: ["evolution-fruit.overview"],
    });
    expect(fruit.commonQuestions.find(({ question }) => question === "Fruit & Evolution如何生成果实形态")).toMatchObject({
      intents: ["technology", "form"],
      preferredClaimIds: [
        "evolution-fruit.algorithm",
        "evolution-fruit.parametric-model",
      ],
    });
  });
});

describe("Atempo authored dossier", () => {
  const atempo = validateProjectDossier(atempoJson, {
    expectedProjectId: "atempo",
    expectedPageCount: 20,
  });

  test("keeps the approved identity and complete canonical page map", () => {
    expect(atempo).toMatchObject({
      projectId: "atempo",
      title: "Atempo",
      oneLine: "利用桌面充电过渡窗口、呼吸与灯光反馈，旨在帮助用户从任务状态切换至恢复状态的桌面节律交互系统概念",
      pageCount: 20,
    });
    expect(atempo.aliases).toEqual(expect.arrayContaining([
      "a tempo",
      "桌面节律交互系统",
      "desktop rhythm interaction system",
    ]));
    expect(
      atempo.pages.map(({ page, role, informationDensity }) => [
        page,
        role,
        informationDensity,
      ]),
    ).toStrictEqual([
      [1, "overview", "high"],
      [2, "contents", "low"],
      [3, "research-section", "low"],
      [4, "problem", "high"],
      [5, "opportunity-section", "low"],
      [6, "competitive-analysis", "high"],
      [7, "intervention-window", "high"],
      [8, "product-definition", "high"],
      [9, "interaction-section", "low"],
      [10, "scenario", "high"],
      [11, "interaction-flow", "high"],
      [12, "biofeedback-rationale", "high"],
      [13, "data-translation", "high"],
      [14, "technology-section", "low"],
      [15, "technology-architecture", "high"],
      [16, "product-section", "low"],
      [17, "user-journey", "high"],
      [18, "form-and-appearance", "high"],
      [19, "citations", "high"],
      [20, "closing", "low"],
    ]);
  });

  test("publishes exactly the approved claims and page-anchored evidence", () => {
    expect(atempo.claims.filter(({ public: isPublic }) => isPublic).map(({ id }) => id))
      .toStrictEqual([
        "atempo.overview",
        "atempo.problem",
        "atempo.opportunity",
        "atempo.scenario",
        "atempo.interaction",
        "atempo.biofeedback",
        "atempo.data-translation",
        "atempo.technology",
        "atempo.form",
        "atempo.core-contributor",
      ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.overview")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 1 },
      { sourceId: "atempo", page: 8 },
    ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.problem")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 4 },
    ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.opportunity")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 6 },
      { sourceId: "atempo", page: 7 },
    ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.scenario")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 10 },
    ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.interaction")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 11 },
    ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.biofeedback")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 12 },
    ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.data-translation")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 13 },
    ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.technology")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 15 },
    ]);
    expect(atempo.claims.find(({ id }) => id === "atempo.form")?.evidence).toStrictEqual([
      { sourceId: "atempo", page: 17 },
      { sourceId: "atempo", page: 18 },
    ]);
    expect(atempo.pages.find(({ page }) => page === 13)?.claimIds)
      .toContain("atempo.data-translation");
  });

  test("frames recovery as a design goal instead of an achieved causal effect", () => {
    const overview = atempo.claims.find(({ id }) => id === "atempo.overview");
    expect(atempo.oneLine).toBe(
      "利用桌面充电过渡窗口、呼吸与灯光反馈，旨在帮助用户从任务状态切换至恢复状态的桌面节律交互系统概念",
    );
    expect(overview?.text).toBe(
      "Atempo 是一个桌面节律交互系统概念：它利用任务结束后把设备放回桌面充电的过渡窗口，以非接触呼吸感知、双弧运动与环境灯光反馈，尝试帮助用户从任务状态转向恢复状态，作为作品的设计目标。",
    );
    expect(atempo.oneLine).not.toContain("反馈帮助用户");
    expect(overview?.text).not.toContain("灯光反馈，帮助用户");
  });

  test("keeps the biofeedback rationale and technology description conservative", () => {
    const biofeedback = atempo.claims.find(({ id }) => id === "atempo.biofeedback");
    expect(biofeedback?.text).toContain("作品中的设计依据");
    expect(biofeedback?.text).toContain("0.1 Hz");
    expect(biofeedback?.text).not.toMatch(/医疗有效|临床有效|治疗|已证明/);
    expect(atempo.claims.find(({ id }) => id === "atempo.technology")?.topics)
      .toEqual(expect.arrayContaining([
        "毫米波雷达",
        "滤波与状态机",
        "相位模型",
        "ESP32-S3",
        "灯光引擎",
      ]));
  });

  test("indexes only intent-aligned public claims and covers data translation in comparison", () => {
    expectPublicSectionClaimReferences(atempo);
    expect(atempo.sectionClaims).toEqual(expect.objectContaining({
      comparison: expect.arrayContaining(["atempo.data-translation"]),
    }));
    expect(atempo.claims.find(({ id }) => id === "atempo.data-translation")?.intents)
      .toEqual(expect.arrayContaining(["architecture", "comparison"]));
  });

  test("keeps exact private contribution candidates and a conservative owner statement", () => {
    const candidates = atempo.claims.filter(
      ({ provenance }) => provenance === "candidate_contribution",
    );
    expect(candidates.map(({ id }) => id)).toStrictEqual([
      "atempo.contribution.research",
      "atempo.contribution.interaction",
      "atempo.contribution.data-translation",
      "atempo.contribution.technology-prototype",
      "atempo.contribution.form-design",
    ]);
    expect(candidates.every(({ public: isPublic }) => !isPublic)).toBe(true);
    expectConservativeCoreContributor(atempo, "atempo.core-contributor");
  });

  test("routes at least twelve unique questions through aligned public claims", () => {
    expect(atempo.commonQuestions.length).toBeGreaterThanOrEqual(12);
    expectIntentAlignedPublicQuestionClaims(atempo);
    expect(atempo.commonQuestions.find(({ question }) => question === "Atempo是什么作品"))
      .toMatchObject({
        intents: ["overview"],
        preferredClaimIds: ["atempo.overview"],
      });
    expect(atempo.commonQuestions.find(
      ({ question }) => question === "Atempo如何把呼吸变成反馈",
    )).toMatchObject({
      intents: ["interaction", "architecture"],
      preferredClaimIds: ["atempo.biofeedback", "atempo.data-translation"],
    });
  });

  test("backlinks every evidence page to its claim", () => {
    expectEvidencePagesBacklinked(atempo);
  });
});

describe("UroSense authored dossier", () => {
  const urosense = validateProjectDossier(urosenseJson, {
    expectedProjectId: "urosense",
    expectedPageCount: 25,
  });

  test("keeps the approved identity and complete canonical page map", () => {
    expect(urosense).toMatchObject({
      projectId: "urosense",
      title: "UroSense",
      oneLine: "心内科病房场景下尽量保护隐私、减少人工转移的自主尿量检测附件概念",
      pageCount: 25,
    });
    expect(urosense.aliases).toEqual(expect.arrayContaining([
      "uro sense",
      "智能尿量检测附件",
      "urine measurement attachment",
    ]));
    expect(
      urosense.pages.map(({ page, role, informationDensity }) => [
        page,
        role,
        informationDensity,
      ]),
    ).toStrictEqual([
      [1, "overview", "high"],
      [2, "design-origin-section", "low"],
      [3, "field-research", "high"],
      [4, "research-focus", "high"],
      [5, "urine-diary", "high"],
      [6, "workflow-problem", "medium"],
      [7, "transfer-problem", "high"],
      [8, "patient-context", "high"],
      [9, "design-principles", "medium"],
      [10, "concept-introduction", "low"],
      [11, "concept-positioning", "medium"],
      [12, "product-structure", "high"],
      [13, "exploded-structure", "high"],
      [14, "measurement-flow", "high"],
      [15, "cleaning-scenario", "low"],
      [16, "measurement-flow", "high"],
      [17, "reference-products", "medium"],
      [18, "form-render", "low"],
      [19, "dimension-drawing", "medium"],
      [20, "dimension-drawing", "medium"],
      [21, "installation", "medium"],
      [22, "future-section", "low"],
      [23, "future-directions", "medium"],
      [24, "form-detail", "low"],
      [25, "closing", "low"],
    ]);
  });

  test("publishes exactly the approved claims and page-anchored evidence", () => {
    expect(urosense.claims.filter(({ public: isPublic }) => isPublic).map(({ id }) => id))
      .toStrictEqual([
        "urosense.overview",
        "urosense.research",
        "urosense.problem",
        "urosense.principles",
        "urosense.structure",
        "urosense.measurement-flow",
        "urosense.installation",
        "urosense.future",
        "urosense.core-contributor",
      ]);
    expect(urosense.claims.find(({ id }) => id === "urosense.overview")?.evidence)
      .toStrictEqual([
        { sourceId: "urosense", page: 1 },
        { sourceId: "urosense", page: 9 },
        { sourceId: "urosense", page: 10 },
      ]);
    expect(urosense.claims.find(({ id }) => id === "urosense.research")?.evidence)
      .toStrictEqual([
        { sourceId: "urosense", page: 3 },
        { sourceId: "urosense", page: 4 },
        { sourceId: "urosense", page: 5 },
      ]);
    expect(urosense.claims.find(({ id }) => id === "urosense.problem")?.evidence)
      .toStrictEqual([
        { sourceId: "urosense", page: 6 },
        { sourceId: "urosense", page: 7 },
        { sourceId: "urosense", page: 8 },
      ]);
    expect(urosense.claims.find(({ id }) => id === "urosense.principles")?.evidence)
      .toStrictEqual([{ sourceId: "urosense", page: 9 }]);
    expect(urosense.claims.find(({ id }) => id === "urosense.structure")?.evidence)
      .toStrictEqual([
        { sourceId: "urosense", page: 12 },
        { sourceId: "urosense", page: 13 },
        { sourceId: "urosense", page: 17 },
        { sourceId: "urosense", page: 18 },
        { sourceId: "urosense", page: 19 },
        { sourceId: "urosense", page: 20 },
        { sourceId: "urosense", page: 24 },
      ]);
    expect(urosense.claims.find(({ id }) => id === "urosense.measurement-flow")?.evidence)
      .toStrictEqual([
        { sourceId: "urosense", page: 14 },
        { sourceId: "urosense", page: 16 },
      ]);
    expect(urosense.claims.find(({ id }) => id === "urosense.installation")?.evidence)
      .toStrictEqual([{ sourceId: "urosense", page: 21 }]);
    expect(urosense.claims.find(({ id }) => id === "urosense.future")?.evidence)
      .toStrictEqual([{ sourceId: "urosense", page: 23 }]);
    expect(urosense.pages.find(({ page }) => page === 14)?.claimIds)
      .toContain("urosense.measurement-flow");
  });

  test("makes the visible structure and form pages publicly reachable without medical inference", () => {
    const structure = urosense.claims.find(({ id }) => id === "urosense.structure");
    expect(structure).toMatchObject({
      public: true,
      intents: expect.arrayContaining(["architecture", "technology", "form"]),
      topics: expect.arrayContaining([
        "形态探索",
        "爆炸结构",
        "尺寸图",
        "整体渲染",
        "扶手识别区",
      ]),
    });
    expect(structure?.text).toContain("螺丝固定附件");
    expect(structure?.text).toContain("扶手识别区读取患者腕带");
    for (const page of [13, 17, 18, 19, 20, 24]) {
      expect(
        urosense.pages.find((candidate) => candidate.page === page)?.claimIds,
        `UroSense page ${page} exposes the public structure claim`,
      ).toContain("urosense.structure");
    }
    expect(urosense.sectionClaims.form).toContain("urosense.structure");
  });

  test("keeps medical and future claims at concept level", () => {
    const publicText = urosense.claims
      .filter(({ public: isPublic }) => isPublic)
      .map(({ text }) => text)
      .join("\n");
    expect(publicText).not.toMatch(
      /已经?通过临床验证|测量精度.{0,8}(达到|为)|医疗器械(批准|获批)|已(部署|落地|投入临床)/,
    );
    expect(urosense.claims.find(({ id }) => id === "urosense.future")?.text)
      .toContain("未来可能性");
  });

  test("indexes only intent-aligned public claims and covers measurement flow in comparison", () => {
    expectPublicSectionClaimReferences(urosense);
    expect(urosense.sectionClaims.comparison)
      .toContain("urosense.measurement-flow");
    expect(urosense.claims.find(({ id }) => id === "urosense.measurement-flow")?.intents)
      .toEqual(expect.arrayContaining(["architecture", "comparison"]));
  });

  test("keeps exact private contribution candidates and a conservative owner statement", () => {
    const candidates = urosense.claims.filter(
      ({ provenance }) => provenance === "candidate_contribution",
    );
    expect(candidates.map(({ id }) => id)).toStrictEqual([
      "urosense.contribution.field-research",
      "urosense.contribution.system-architecture",
      "urosense.contribution.measurement-flow",
      "urosense.contribution.installation",
      "urosense.contribution.form-design",
    ]);
    expect(candidates.every(({ public: isPublic }) => !isPublic)).toBe(true);
    expectConservativeCoreContributor(urosense, "urosense.core-contributor");
  });

  test("routes at least twelve unique questions through aligned public claims", () => {
    expect(urosense.commonQuestions.length).toBeGreaterThanOrEqual(12);
    expectIntentAlignedPublicQuestionClaims(urosense);
    expect(urosense.commonQuestions.find(({ question }) => question === "UroSense是什么作品"))
      .toMatchObject({
        intents: ["overview"],
        preferredClaimIds: ["urosense.overview"],
      });
    expect(urosense.commonQuestions.find(
      ({ question }) => question === "UroSense如何完成尿量测量",
    )).toMatchObject({
      intents: ["architecture", "interaction"],
      preferredClaimIds: ["urosense.measurement-flow", "urosense.structure"],
    });
    expect(urosense.commonQuestions.find(
      ({ question }) => question === "UroSense的附件形态与结构如何设计",
    )).toMatchObject({
      intents: ["form", "architecture"],
      preferredClaimIds: ["urosense.structure"],
    });
  });

  test("keeps bilingual installation and form-structure entry points normalized unique", () => {
    expect(urosense.commonQuestions).toHaveLength(14);
    expect(urosense.commonQuestions.find(
      ({ question }) => question === "UroSense如何安装在坐便器上",
    )).toMatchObject({
      locale: "zh",
      intents: ["form", "interaction"],
      preferredClaimIds: ["urosense.installation"],
    });
    expect(urosense.commonQuestions.find(
      ({ question }) => question === "How is UroSense installed on a toilet?",
    )).toMatchObject({
      locale: "en",
      intents: ["form", "interaction"],
      preferredClaimIds: ["urosense.installation"],
    });
    expect(urosense.commonQuestions.find(
      ({ question }) => question === "UroSense的附件形态与结构如何设计",
    )).toMatchObject({
      locale: "zh",
      intents: ["form", "architecture"],
      preferredClaimIds: ["urosense.structure"],
    });
    expect(urosense.commonQuestions.find(
      ({ question }) => question === "How are UroSense's attachment form and structure designed?",
    )).toMatchObject({
      locale: "en",
      intents: ["form", "architecture"],
      preferredClaimIds: ["urosense.structure"],
    });
    const normalizedQuestions = urosense.commonQuestions.map(({ question }) =>
      question.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, ""));
    expect(new Set(normalizedQuestions).size).toBe(normalizedQuestions.length);
  });

  test("backlinks every evidence page to its claim", () => {
    expectEvidencePagesBacklinked(urosense);
  });
});

describe("First Fly authored dossier", () => {
  const firstFly = validateProjectDossier(firstFlyJson, {
    expectedProjectId: "first-fly",
    expectedPageCount: 28,
  });

  test("keeps the approved identity and complete canonical page map", () => {
    expect(firstFly).toMatchObject({
      projectId: "first-fly",
      title: "First Fly",
      oneLine: "面向 2035 短途出行的未来沉浸式飞行体验概念，以俯卧第一人称身体姿态、座椅运动反馈和 AR 景观营造飞行感",
      pageCount: 28,
    });
    expect(firstFly.aliases).toEqual(expect.arrayContaining([
      "firstfly",
      "第一飞行",
      "沉浸式飞行体验",
      "immersive flight experience",
    ]));
    expect(
      firstFly.pages.map(({ page, role, informationDensity }) => [
        page,
        role,
        informationDensity,
      ]),
    ).toStrictEqual([
      [1, "overview", "high"],
      [2, "premise-divider", "low"],
      [3, "premise", "high"],
      [4, "research-section", "medium"],
      [5, "mobility-forecast", "high"],
      [6, "ar-landscape", "medium"],
      [7, "ergonomics-and-cabin", "high"],
      [8, "future-mobility-synthesis", "high"],
      [9, "scene-theme", "medium"],
      [10, "design-concept", "high"],
      [11, "route-concept", "high"],
      [12, "users-section", "low"],
      [13, "user-groups", "high"],
      [14, "journey", "high"],
      [15, "form-iteration", "medium"],
      [16, "form-principles", "medium"],
      [17, "posture-and-space", "high"],
      [18, "comfort-design", "medium"],
      [19, "structure-exploded", "medium"],
      [20, "cmf", "high"],
      [21, "motion-and-ar", "high"],
      [22, "motion-study", "low"],
      [23, "ar-experience", "high"],
      [24, "cabin-layout", "medium"],
      [25, "dimensions", "high"],
      [26, "cabin-render", "medium"],
      [27, "cabin-detail", "low"],
      [28, "closing", "low"],
    ]);
  });

  test("publishes exactly the approved claims and page-anchored evidence", () => {
    expect(firstFly.claims.filter(({ public: isPublic }) => isPublic).map(({ id }) => id))
      .toStrictEqual([
        "first-fly.overview",
        "first-fly.premise",
        "first-fly.research",
        "first-fly.concept",
        "first-fly.users",
        "first-fly.journey",
        "first-fly.form",
        "first-fly.motion",
        "first-fly.ar",
        "first-fly.core-contributor",
      ]);
    expect(firstFly.claims.find(({ id }) => id === "first-fly.overview")?.evidence)
      .toStrictEqual([
        { sourceId: "first-fly", page: 1 },
        { sourceId: "first-fly", page: 10 },
        { sourceId: "first-fly", page: 11 },
      ]);
    expect(firstFly.claims.find(({ id }) => id === "first-fly.premise")?.evidence)
      .toStrictEqual([{ sourceId: "first-fly", page: 3 }]);
    expect(firstFly.claims.find(({ id }) => id === "first-fly.research")?.evidence)
      .toStrictEqual(Array.from({ length: 6 }, (_, index) => ({
        sourceId: "first-fly",
        page: index + 4,
      })));
    expect(firstFly.claims.find(({ id }) => id === "first-fly.concept")?.evidence)
      .toStrictEqual([
        { sourceId: "first-fly", page: 10 },
        { sourceId: "first-fly", page: 11 },
      ]);
    expect(firstFly.claims.find(({ id }) => id === "first-fly.users")?.evidence)
      .toStrictEqual([
        { sourceId: "first-fly", page: 12 },
        { sourceId: "first-fly", page: 13 },
      ]);
    expect(firstFly.claims.find(({ id }) => id === "first-fly.journey")?.evidence)
      .toStrictEqual([{ sourceId: "first-fly", page: 14 }]);
    expect(firstFly.claims.find(({ id }) => id === "first-fly.form")?.evidence)
      .toStrictEqual([
        ...Array.from({ length: 6 }, (_, index) => ({
          sourceId: "first-fly",
          page: index + 15,
        })),
        ...Array.from({ length: 4 }, (_, index) => ({
          sourceId: "first-fly",
          page: index + 24,
        })),
      ]);
    expect(firstFly.claims.find(({ id }) => id === "first-fly.motion")?.evidence)
      .toStrictEqual([{ sourceId: "first-fly", page: 21 }]);
    expect(firstFly.claims.find(({ id }) => id === "first-fly.ar")?.evidence)
      .toStrictEqual([{ sourceId: "first-fly", page: 23 }]);
    expect(firstFly.pages.find(({ page }) => page === 10)?.claimIds)
      .toContain("first-fly.concept");
  });

  test("makes cabin layout, dimensions, render, and detail publicly reachable through form", () => {
    const form = firstFly.claims.find(({ id }) => id === "first-fly.form");
    expect(form).toMatchObject({
      public: true,
      topics: expect.arrayContaining([
        "客舱布局",
        "产品尺寸",
        "整体渲染",
        "局部细节",
      ]),
    });
    expect(form?.text).toContain("210 cm 长、158 cm 高、68 cm 宽");
    for (const page of [24, 25, 26, 27]) {
      expect(
        firstFly.pages.find((candidate) => candidate.page === page)?.claimIds,
        `First Fly page ${page} exposes the public form claim`,
      ).toContain("first-fly.form");
    }
  });

  test("keeps the 2035 experience explicitly conceptual", () => {
    const publicText = firstFly.claims
      .filter(({ public: isPublic }) => isPublic)
      .map(({ text }) => text)
      .join("\n");
    expect(publicText).toContain("未来概念");
    expect(publicText).not.toMatch(/已(部署|落地|投入运营|完成验证)|经过验证/);
  });

  test("describes page eleven as Xinjiang and Altay route semantics without Southern Song content", () => {
    const pageEleven = firstFly.pages.find(({ page }) => page === 11);
    const visibleSemantics = [
      pageEleven?.visualSummary,
      ...(pageEleven?.entities ?? []),
      ...(pageEleven?.relationships ?? []),
    ].join("\n");
    expect(visibleSemantics).not.toContain("南宋");
    expect(visibleSemantics).toContain("新疆");
    expect(visibleSemantics).toContain("阿勒泰");
  });

  test("indexes only intent-aligned public claims and covers the system in comparison", () => {
    expectPublicSectionClaimReferences(firstFly);
    expect(firstFly.sectionClaims.comparison).toEqual(expect.arrayContaining([
      "first-fly.concept",
      "first-fly.motion",
      "first-fly.ar",
    ]));
  });

  test("keeps exact private contribution candidates and a conservative owner statement", () => {
    const candidates = firstFly.claims.filter(
      ({ provenance }) => provenance === "candidate_contribution",
    );
    expect(candidates.map(({ id }) => id)).toStrictEqual([
      "first-fly.contribution.concept",
      "first-fly.contribution.user-research",
      "first-fly.contribution.journey",
      "first-fly.contribution.spatial-form",
      "first-fly.contribution.ar-interaction",
    ]);
    expect(candidates.every(({ public: isPublic }) => !isPublic)).toBe(true);
    expectConservativeCoreContributor(firstFly, "first-fly.core-contributor");
  });

  test("routes at least twelve unique questions through aligned public claims", () => {
    expect(firstFly.commonQuestions.length).toBeGreaterThanOrEqual(12);
    expectIntentAlignedPublicQuestionClaims(firstFly);
    expect(firstFly.commonQuestions.find(({ question }) => question === "First Fly是什么作品"))
      .toMatchObject({
        intents: ["overview"],
        preferredClaimIds: ["first-fly.overview"],
      });
    expect(firstFly.commonQuestions.find(
      ({ question }) => question === "First Fly如何营造飞行体验",
    )).toMatchObject({
      intents: ["solution", "interaction"],
      preferredClaimIds: ["first-fly.concept", "first-fly.motion", "first-fly.ar"],
    });
  });

  test("backlinks every evidence page to its claim", () => {
    expectEvidencePagesBacklinked(firstFly);
  });
});

describe("reviewed authored knowledge loader", () => {
  const expectedProjectIds = [
    "inkseat",
    "emovue",
    "evolution-fruit",
    "atempo",
    "urosense",
    "first-fly",
  ] as const;
  const expectedIntentAliases = {
    overview: ["是什么", "介绍", "项目概览", "what is", "introduce", "overview"],
    problem: ["问题", "痛点", "设计机会", "problem", "pain point", "opportunity"],
    research: ["调研", "洞察", "研究", "research", "insight"],
    solution: ["方案", "产品定义", "solution", "concept"],
    architecture: [
      "系统",
      "架构",
      "工作原理",
      "architecture",
      "system",
      "how it works",
    ],
    interaction: ["交互", "流程", "旅程", "interaction", "flow", "journey"],
    technology: ["技术", "原型", "传感器", "technology", "prototype", "sensor"],
    form: ["造型", "结构", "材料", "form", "structure", "material"],
    value: ["价值", "意义", "商业模式", "value", "impact", "business model"],
    comparison: [
      "对比",
      "哪个项目",
      "系统思考",
      "compare",
      "which project",
      "system thinking",
    ],
    contribution: ["负责", "贡献", "做了什么", "role", "contribution"],
  } as const satisfies Readonly<Record<KnowledgeIntent, readonly string[]>>;

  test("loads all six dossiers in portfolio order and validates 135 annotated pages", () => {
    expect(authoredProjects.map(({ projectId }) => projectId)).toStrictEqual(
      expectedProjectIds,
    );
    expect(authoredProjects.reduce((total, dossier) => total + dossier.pageCount, 0))
      .toBe(135);
    expect(authoredProjects.every(
      (dossier) => dossier.pages.length === dossier.pageCount,
    )).toBe(true);
  });

  function projectManifestSource(
    overrides: Partial<KnowledgeSource> = {},
  ): KnowledgeSource {
    return {
      id: "sample-project",
      kind: "project-pdf",
      title: "Sample project",
      aliases: [],
      tags: [],
      projectId: "sample-project",
      pageCount: 3,
      ...overrides,
    };
  }

  test("distinguishes zero and multiple project manifest matches", () => {
    expect(() => resolveProjectManifestValidation("sample-project", [])).toThrow(
      "Project manifest sample-project: expected 1 project-pdf match, found 0",
    );
    expect(() => resolveProjectManifestValidation("sample-project", [
      projectManifestSource(),
      projectManifestSource({ title: "Duplicate entry" }),
    ])).toThrow(
      "Project manifest sample-project: expected 1 project-pdf match, found 2",
    );
  });

  test("reports a unique project manifest entry with a missing pageCount", () => {
    const { pageCount: _pageCount, ...withoutPageCount } = projectManifestSource();
    expect(() => resolveProjectManifestValidation(
      "sample-project",
      [withoutPageCount],
    )).toThrow(
      "Project manifest sample-project: found 1 match; missing field pageCount",
    );
  });

  test("reports invalid projectId and pageCount manifest fields separately", () => {
    expect(() => resolveProjectManifestValidation("sample-project", [
      projectManifestSource({ projectId: "wrong-project" }),
    ])).toThrow(
      "Project manifest sample-project: found 1 match; invalid field projectId",
    );
    expect(() => resolveProjectManifestValidation("sample-project", [
      projectManifestSource({ pageCount: 0 }),
    ])).toThrow(
      "Project manifest sample-project: found 1 match; invalid field pageCount",
    );
  });

  test("builds exact project-page keys with useful anchors", () => {
    const pageMap = buildPageKnowledgeMap(authoredProjects);
    expect(pageMap.size).toBe(135);
    expect(pageMap.get("inkseat:p1")).toMatchObject({
      page: 1,
      role: "overview",
    });
    expect(pageMap.get("inkseat:p8")).toMatchObject({
      page: 8,
      role: "system-architecture",
    });
    expect(pageMap.get("first-fly:p28")).toMatchObject({
      page: 28,
      role: "closing",
    });
    expect(pageMap.has("inkseat:1")).toBe(false);
  });

  test("rejects duplicate project-page keys", () => {
    expect(() => buildPageKnowledgeMap([
      authoredProjects[0]!,
      authoredProjects[0]!,
    ])).toThrow("Duplicate authored page key: inkseat:p1");
  });

  test("copies and recursively freezes page values without freezing caller input", () => {
    const sourcePage = authoredProjects[0]!.pages[0]!;
    const mutablePage = {
      ...sourcePage,
      entities: [...sourcePage.entities],
      relationships: [...sourcePage.relationships],
      claimIds: [...sourcePage.claimIds],
    };
    const mutableDossier = {
      ...authoredProjects[0]!,
      pages: [mutablePage],
    };
    const snapshot = structuredClone(mutableDossier);

    const pages = buildPageKnowledgeMap([mutableDossier]);
    const returnedPage = pages.get("inkseat:p1");

    expect(mutableDossier).toStrictEqual(snapshot);
    expect(returnedPage).not.toBe(mutablePage);
    expect(Object.isFrozen(returnedPage)).toBe(true);
    expect(Object.isFrozen(returnedPage?.entities)).toBe(true);
    expect(Object.isFrozen(returnedPage?.relationships)).toBe(true);
    expect(Object.isFrozen(returnedPage?.claimIds)).toBe(true);
    expect(() => {
      (returnedPage?.entities as string[]).push("map mutation");
    }).toThrow();

    expect(Object.isFrozen(mutablePage)).toBe(false);
    expect(Object.isFrozen(mutablePage.entities)).toBe(false);
    mutablePage.entities.push("caller mutation");
    expect(mutablePage.entities.at(-1)).toBe("caller mutation");
    expect(returnedPage?.entities).not.toContain("caller mutation");
  });

  test("loads the bilingual glossary with six canonical project entries", () => {
    expect(authoredGlossary.version).toBe(1);
    expect(authoredGlossary).not.toBe(glossaryJson);
    const canonicalEntries = authoredGlossary.entries.map(({ canonical }) => canonical);
    expect(canonicalEntries).toEqual(expect.arrayContaining([
      "INKSeat",
      "EMOVUE",
      "Fruit & Evolution",
      "Atempo",
      "UroSense",
      "First Fly",
      "系统架构",
      "核心贡献",
    ]));
    for (const canonical of expectedProjectIds) {
      const dossier = authoredProjects.find(({ projectId }) => projectId === canonical)!;
      const glossaryEntry = authoredGlossary.entries.find(
        (entry) => entry.canonical === dossier.title,
      );
      expect(glossaryEntry, `${dossier.title} has a glossary entry`).toBeDefined();
      expect(glossaryEntry?.aliases).toEqual(
        expect.arrayContaining([...dossier.aliases]),
      );
    }
  });

  test("returns every intent key in contract order with required bilingual aliases", () => {
    const aliases = buildIntentAliases(authoredGlossary);
    expect(Object.keys(aliases)).toStrictEqual(intents);
    for (const intent of intents) {
      expect(aliases[intent], `${intent} aliases`).toEqual(
        expect.arrayContaining([...expectedIntentAliases[intent]]),
      );
    }
  });

  test("normalizes NFKC, trim, and case when deduplicating without mutating input", () => {
    const input: AuthoredGlossary = {
      version: 1,
      entries: [{
        canonical: "INKSeat",
        aliases: [" inkseat ", "ＩＮＫＳＥＡＴ", "智能座舱"],
        intents: ["overview"],
      }],
    };
    const snapshot = structuredClone(input);
    const aliases = buildIntentAliases(input);
    expect(aliases.overview).toStrictEqual(["INKSeat", "智能座舱"]);
    expect(input).toStrictEqual(snapshot);
  });

  test("allows compatible normalized terms when intent sets use a different order", () => {
    const glossary: AuthoredGlossary = {
      version: 1,
      entries: [
        {
          canonical: "System",
          aliases: ["shared synonym", "alpha"],
          intents: ["architecture", "comparison"],
        },
        {
          canonical: " system ",
          aliases: [" ＳＨＡＲＥＤ ＳＹＮＯＮＹＭ ", "beta"],
          intents: ["comparison", "architecture"],
        },
      ],
    };

    const aliases = buildIntentAliases(glossary);

    expect(aliases.architecture).toStrictEqual([
      "System",
      "shared synonym",
      "alpha",
      "beta",
    ]);
    expect(aliases.comparison).toStrictEqual(aliases.architecture);
  });

  test("rejects fully duplicate glossary entries after normalization", () => {
    const glossary: AuthoredGlossary = {
      version: 1,
      entries: [
        {
          canonical: "Shared",
          aliases: ["Alpha", "Beta"],
          intents: ["overview", "problem"],
        },
        {
          canonical: " ＳＨＡＲＥＤ ",
          aliases: [" beta ", "ALPHA"],
          intents: ["problem", "overview"],
        },
      ],
    };

    expect(() => buildIntentAliases(glossary)).toThrow(
      "Duplicate normalized glossary entry: ＳＨＡＲＥＤ",
    );
  });

  test("rejects a normalized term shared by incompatible glossary owners", () => {
    const glossary: AuthoredGlossary = {
      version: 1,
      entries: [
        {
          canonical: "First owner",
          aliases: ["shared synonym"],
          intents: ["overview"],
        },
        {
          canonical: "Second owner",
          aliases: [" ＳＨＡＲＥＤ ＳＹＮＯＮＹＭ "],
          intents: ["overview"],
        },
      ],
    };

    expect(() => buildIntentAliases(glossary)).toThrow(
      "Conflicting normalized glossary term: ＳＨＡＲＥＤ ＳＹＮＯＮＹＭ",
    );
  });

  test("does not expose normalized terms under incompatible canonical entries or intents", () => {
    const occurrences = new Map<string, {
      canonical: string;
      intents: readonly KnowledgeIntent[];
    }>();
    for (const entry of authoredGlossary.entries) {
      for (const term of [entry.canonical, ...entry.aliases]) {
        const key = term.normalize("NFKC").trim().toLowerCase();
        const previous = occurrences.get(key);
        if (previous) {
          expect(previous.canonical).toBe(entry.canonical);
          expect(previous.intents).toStrictEqual(entry.intents);
        } else {
          occurrences.set(key, {
            canonical: entry.canonical,
            intents: entry.intents,
          });
        }
      }
    }
  });

  test("freezes exported records, arrays, and directly mutable collections", () => {
    expect(Object.isFrozen(authoredProjects)).toBe(true);
    expect(Object.isFrozen(authoredProjects[0])).toBe(true);
    expect(Object.isFrozen(authoredProjects[0]?.pages)).toBe(true);
    expect(Object.isFrozen(authoredGlossary)).toBe(true);
    expect(Object.isFrozen(authoredGlossary.entries)).toBe(true);
    expect(Object.isFrozen(authoredGlossary.entries[0]?.aliases)).toBe(true);
    const aliases = buildIntentAliases(authoredGlossary);
    expect(Object.isFrozen(aliases)).toBe(true);
    expect(Object.isFrozen(aliases.overview)).toBe(true);
    expect(() => {
      (aliases.overview as string[]).push("mutate");
    }).toThrow();
    const pages = buildPageKnowledgeMap(authoredProjects);
    expect(Object.isFrozen(pages)).toBe(true);
    expect(() => {
      (pages as Map<string, unknown>).set("mutate:p1", {});
    }).toThrow();
  });
});
