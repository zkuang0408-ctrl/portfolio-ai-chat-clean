import { describe, expect, expectTypeOf, test } from "vitest";
import emovueJson from "./projects/emovue.json";
import evolutionFruitJson from "./projects/evolution-fruit.json";
import inkseatJson from "./projects/inkseat.json";
import { validateProjectDossier } from "./validate";
import type {
  AuthoredProjectDossier,
  KnowledgeClaim,
  KnowledgeIntent,
} from "./types";

const projectId = "minimal-project";
const intents = [
  "overview", "problem", "research", "solution", "architecture", "interaction",
  "technology", "form", "value", "comparison", "contribution",
] as const satisfies readonly KnowledgeIntent[];

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

describe("authored knowledge contracts", () => {
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

  test("requires evidence for document claims", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], evidence: [] }] })).toThrow();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], provenance: "document_synthesis", evidence: [] }] })).toThrow();
  });

  test("allows owner statements without evidence", () => {
    const dossier = minimalDossier();
    expect(() => validate({ ...dossier, claims: [{ ...dossier.claims[0], provenance: "owner_statement", evidence: [] }] })).not.toThrow();
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
    expect(emovue.claims.find(({ id }) => id === "emovue.product")?.evidence).toContainEqual({
      sourceId: "emovue",
      page: 8,
    });
    expect(emovue.claims.find(({ id }) => id === "emovue.technical-prototype")?.evidence).toContainEqual({
      sourceId: "emovue",
      page: 15,
    });
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
    const ownerStatement = emovue.claims.find(
      ({ id }) => id === "emovue.core-contributor",
    );
    expect(ownerStatement).toMatchObject({
      provenance: "owner_statement",
      evidence: [],
      public: true,
    });
    expect(ownerStatement?.text).toContain("核心贡献者");
    expect(ownerStatement?.text).toContain("实质性");
    expect(ownerStatement?.text).not.toMatch(/唯一|独立完成|sole|lead/i);
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
    expect(fruit.claims.find(({ id }) => id === "evolution-fruit.parametric-model")?.evidence).toContainEqual({
      sourceId: "evolution-fruit",
      page: 16,
    });
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
    const ownerStatement = fruit.claims.find(
      ({ id }) => id === "evolution-fruit.core-contributor",
    );
    expect(ownerStatement).toMatchObject({
      provenance: "owner_statement",
      evidence: [],
      public: true,
    });
    expect(ownerStatement?.text).toContain("核心贡献者");
    expect(ownerStatement?.text).toContain("实质性");
    expect(ownerStatement?.text).not.toMatch(/唯一|独立完成|sole|lead/i);
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
