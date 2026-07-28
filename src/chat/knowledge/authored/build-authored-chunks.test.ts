import { describe, expect, test } from "vitest";

import { normalizeKnowledgeText } from "../build-index";
import { knowledgeSources } from "../manifest";
import { buildTerms } from "../terms";
import type { KnowledgeSource } from "../types";
import { authoredProjects } from "./index";
import { buildAuthoredChunks } from "./build-authored-chunks";
import type {
  AuthoredProjectDossier,
  KnowledgeClaim,
} from "./types";

function replaceClaim(
  dossier: AuthoredProjectDossier,
  claimId: string,
  replace: (claim: KnowledgeClaim) => KnowledgeClaim,
): AuthoredProjectDossier {
  return {
    ...dossier,
    claims: dossier.claims.map((claim) =>
      claim.id === claimId ? replace(claim) : claim),
  };
}

function inkseatManifestSource(
  overrides: Partial<KnowledgeSource> = {},
): KnowledgeSource {
  const source = knowledgeSources.find(
    (candidate) => candidate.id === "inkseat",
  )!;
  return { ...source, ...overrides };
}

describe("buildAuthoredChunks", () => {
  test("builds the exact grounded INKSeat overview chunk", () => {
    const dossier = authoredProjects[0]!;
    const claim = dossier.claims.find(
      (candidate) => candidate.id === "inkseat.overview",
    )!;
    const source = knowledgeSources.find(
      (candidate) => candidate.id === "inkseat",
    )!;
    const questionAliases = [
      "inkseat是什么作品",
      "What is INKSeat?",
    ];

    const chunk = buildAuthoredChunks([dossier]).find(
      (candidate) => candidate.id === "inkseat:claim:inkseat.overview",
    );

    expect(chunk).toStrictEqual({
      id: "inkseat:claim:inkseat.overview",
      sourceId: "inkseat",
      projectId: "inkseat",
      page: 1,
      title: "INKSeat",
      text: normalizeKnowledgeText(claim.text),
      terms: buildTerms([
        ...claim.topics,
        ...claim.intents,
        ...dossier.aliases,
        dossier.title,
        claim.text,
        ...questionAliases,
      ].join(" ")),
      aliases: [...dossier.aliases],
      tags: [...source.tags],
      citationLabel: "INKSeat · p. 1",
      publicHref: "/projects/pdfs/inkseat.pdf",
      knowledgeKind: "authored-claim",
      intents: ["overview", "solution"],
      informationDensity: "high",
      pageRole: "overview",
      provenance: "document_fact",
      evidencePages: [1],
      questionAliases,
    });
  });

  test("anchors architecture to page eight and owner statements without a page", () => {
    const chunks = buildAuthoredChunks([authoredProjects[0]!]);
    const architecture = chunks.find(
      ({ id }) => id === "inkseat:claim:inkseat.architecture",
    );
    const owner = chunks.find(
      ({ id }) => id === "inkseat:claim:inkseat.core-contributor",
    );

    expect(architecture).toMatchObject({
      page: 8,
      pageRole: "system-architecture",
      evidencePages: [8],
      citationLabel: "INKSeat · p. 8",
    });
    expect(owner).toStrictEqual(expect.objectContaining({
      knowledgeKind: "authored-claim",
      provenance: "owner_statement",
      evidencePages: [],
      pageRole: "owner-confirmed",
      citationLabel: "INKSeat · Owner-confirmed",
    }));
    expect(owner).not.toHaveProperty("page");
  });

  test("emits all 57 public claims in dossier and claim order with stable IDs", () => {
    const expectedIds = authoredProjects.flatMap((dossier) =>
      dossier.claims
        .filter((claim) =>
          claim.public && claim.provenance !== "candidate_contribution")
        .map((claim) => `${dossier.projectId}:claim:${claim.id}`));

    const first = buildAuthoredChunks(authoredProjects);
    const second = buildAuthoredChunks(authoredProjects);

    expect(first).toHaveLength(57);
    expect(first.map(({ id }) => id)).toStrictEqual(expectedIds);
    expect(second).toStrictEqual(first);
    expect(new Set(first.map(({ projectId }) => projectId))).toStrictEqual(
      new Set([
        "inkseat",
        "emovue",
        "evolution-fruit",
        "atempo",
        "urosense",
        "first-fly",
      ]),
    );
  });

  test("never emits private claims or candidate contributions", () => {
    const inkseat = authoredProjects[0]!;
    const overview = inkseat.claims[0]!;
    const candidate = inkseat.claims.find(
      ({ provenance }) => provenance === "candidate_contribution",
    )!;
    const dossier: AuthoredProjectDossier = {
      ...inkseat,
      claims: [
        { ...overview, public: false },
        { ...candidate, public: true },
      ],
    };

    expect(buildAuthoredChunks([dossier])).toStrictEqual([]);
  });

  test("attaches normalized-unique bilingual question aliases and indexes them", () => {
    const inkseat = structuredClone(authoredProjects[0]!);
    const dossier: AuthoredProjectDossier = {
      ...inkseat,
      commonQuestions: [
        ...inkseat.commonQuestions,
        {
          question: " What is INKSeat? ",
          locale: "en",
          intents: ["overview"],
          preferredClaimIds: ["inkseat.overview"],
        },
        {
          question: "Ｗｈａｔ　ｉｓ　ＩＮＫＳｅａｔ？",
          locale: "en",
          intents: ["overview"],
          preferredClaimIds: ["inkseat.overview"],
        },
      ],
    };

    const chunk = buildAuthoredChunks([dossier]).find(
      ({ id }) => id === "inkseat:claim:inkseat.overview",
    )!;

    expect(chunk.questionAliases).toStrictEqual([
      "inkseat是什么作品",
      "What is INKSeat?",
    ]);
    expect(chunk.terms).toEqual(expect.arrayContaining([
      "what",
      "is",
      "inkseat",
      "作品",
    ]));
  });

  test("sorts and deduplicates evidence without mutating caller input", () => {
    const original = structuredClone(authoredProjects[0]!);
    const dossier = replaceClaim(
      original,
      "inkseat.overview",
      (claim) => ({
        ...claim,
        evidence: [
          { sourceId: "inkseat", page: 8 },
          { sourceId: "inkseat", page: 1 },
          { sourceId: "inkseat", page: 8 },
        ],
      }),
    );
    const synthetic: AuthoredProjectDossier = {
      ...dossier,
      pages: dossier.pages.map((page) =>
        page.page === 8
          ? { ...page, claimIds: [...page.claimIds, "inkseat.overview"] }
          : page),
    };
    const snapshot = structuredClone(synthetic);

    const chunks = buildAuthoredChunks([synthetic]);
    const overview = chunks.find(
      ({ id }) => id === "inkseat:claim:inkseat.overview",
    )!;

    expect(overview).toMatchObject({
      page: 1,
      pageRole: "overview",
      evidencePages: [1, 8],
    });
    expect(synthetic).toStrictEqual(snapshot);
    expect(Object.isFrozen(chunks)).toBe(true);
    expect(Object.isFrozen(overview)).toBe(true);
    expect(Object.isFrozen(overview.evidencePages)).toBe(true);
    expect(Object.isFrozen(overview.questionAliases)).toBe(true);
    expect(Object.isFrozen(overview.intents)).toBe(true);
    expect(Object.isFrozen(overview.terms)).toBe(true);
    expect(() => {
      (overview.evidencePages as number[]).push(9);
    }).toThrow();
    expect(Object.isFrozen(synthetic)).toBe(false);
    expect(Object.isFrozen(synthetic.claims)).toBe(false);
  });

  test("rejects a missing project manifest and duplicate stable IDs", () => {
    const missingManifest: AuthoredProjectDossier = {
      ...authoredProjects[0]!,
      projectId: "missing-project",
    };

    expect(() => buildAuthoredChunks([missingManifest])).toThrow(
      /missing-project.*manifest/i,
    );
    expect(() => buildAuthoredChunks([
      authoredProjects[0]!,
      authoredProjects[0]!,
    ])).toThrow(/duplicate.*inkseat:claim:inkseat\.overview/i);
  });

  test("rejects evidence with a mismatched source or invalid page", () => {
    const inkseat = authoredProjects[0]!;
    const wrongSource = replaceClaim(
      inkseat,
      "inkseat.overview",
      (claim) => ({
        ...claim,
        evidence: [{ sourceId: "emovue", page: 1 }],
      }),
    );
    const invalidPage = replaceClaim(
      inkseat,
      "inkseat.overview",
      (claim) => ({
        ...claim,
        evidence: [{ sourceId: "inkseat", page: 0 }],
      }),
    );

    expect(() => buildAuthoredChunks([wrongSource])).toThrow(
      /inkseat\.overview.*source/i,
    );
    expect(() => buildAuthoredChunks([invalidPage])).toThrow(
      /inkseat\.overview.*page/i,
    );
  });

  test("rejects evidence pages that do not backlink the claim", () => {
    const inkseat = authoredProjects[0]!;
    const dossier: AuthoredProjectDossier = {
      ...inkseat,
      pages: inkseat.pages.map((page) =>
        page.page === 1
          ? {
              ...page,
              claimIds: page.claimIds.filter(
                (claimId) => claimId !== "inkseat.overview",
              ),
            }
          : page),
    };

    expect(() => buildAuthoredChunks([dossier])).toThrow(
      /inkseat\.overview.*page 1.*backlink/i,
    );
  });

  test("rejects owner evidence and missing document evidence at the boundary", () => {
    const inkseat = authoredProjects[0]!;
    const ownerWithEvidence = replaceClaim(
      inkseat,
      "inkseat.core-contributor",
      (claim) => ({
        ...claim,
        evidence: [{ sourceId: "inkseat", page: 1 }],
      }),
    );
    const documentWithoutEvidence = replaceClaim(
      inkseat,
      "inkseat.overview",
      (claim) => ({ ...claim, evidence: [] }),
    );

    expect(() => buildAuthoredChunks([ownerWithEvidence])).toThrow(
      /inkseat\.core-contributor.*owner.*evidence/i,
    );
    expect(() => buildAuthoredChunks([documentWithoutEvidence])).toThrow(
      /inkseat\.overview.*requires evidence/i,
    );
  });

  test.each([
    {
      field: "claim text",
      dossier: () => replaceClaim(
        authoredProjects[0]!,
        "inkseat.overview",
        (claim) => ({
          ...claim,
          text: `${claim.text} Phone: 202-555-0100`,
        }),
      ),
      sources: undefined,
    },
    {
      field: "dossier title",
      dossier: () => ({
        ...authoredProjects[0]!,
        title: "INKSeat Phone: 202-555-0101",
      }),
      sources: undefined,
    },
    {
      field: "dossier alias",
      dossier: () => ({
        ...authoredProjects[0]!,
        aliases: [...authoredProjects[0]!.aliases, "PRIVATE_ADDRESS"],
      }),
      sources: undefined,
    },
    {
      field: "common question",
      dossier: () => ({
        ...authoredProjects[0]!,
        commonQuestions: authoredProjects[0]!.commonQuestions.map(
          (question, index) => index === 0
            ? {
                ...question,
                question: "Contact private-test@example.invalid",
              }
            : question,
        ),
      }),
      sources: undefined,
    },
    {
      field: "manifest tag",
      dossier: () => authoredProjects[0]!,
      sources: [
        inkseatManifestSource({
          tags: ["Safe test tag", "private-test@example.invalid"],
        }),
      ],
    },
  ] satisfies readonly {
    readonly field: string;
    readonly dossier: () => AuthoredProjectDossier;
    readonly sources: readonly KnowledgeSource[] | undefined;
  }[])("rejects private data injected through $field", ({ dossier, sources }) => {
    expect(() => buildAuthoredChunks(
      [dossier()],
      sources,
    )).toThrow("Private contact data detected");
  });

  test("rejects a dossier page count that exceeds its manifest contract", () => {
    const inkseat = authoredProjects[0]!;
    const dossier = replaceClaim(
      {
        ...inkseat,
        pageCount: 19,
        pages: [
          ...inkseat.pages,
          {
            page: 19,
            role: "synthetic-overflow",
            informationDensity: "high",
            visualSummary: "Synthetic test-only overflow page.",
            entities: ["synthetic"],
            relationships: ["tests manifest bounds"],
            claimIds: ["inkseat.overview"],
          },
        ],
      },
      "inkseat.overview",
      (claim) => ({
        ...claim,
        evidence: [
          ...claim.evidence,
          { sourceId: "inkseat", page: 19 },
        ],
      }),
    );

    expect(() => buildAuthoredChunks([dossier])).toThrow(
      "Project inkseat page count mismatch: expected 18, actual 19",
    );
  });

  test("rejects missing and invalid manifest page counts", () => {
    const source = inkseatManifestSource();
    const { pageCount: _pageCount, ...withoutPageCount } = source;

    expect(() => buildAuthoredChunks(
      [authoredProjects[0]!],
      [withoutPageCount],
    )).toThrow(/inkseat.*manifest.*page count/i);
    expect(() => buildAuthoredChunks(
      [authoredProjects[0]!],
      [inkseatManifestSource({ pageCount: 0 })],
    )).toThrow(/inkseat.*manifest.*page count/i);
  });
});
