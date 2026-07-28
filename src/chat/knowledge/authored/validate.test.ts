import { describe, expect, expectTypeOf, test } from "vitest";
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
