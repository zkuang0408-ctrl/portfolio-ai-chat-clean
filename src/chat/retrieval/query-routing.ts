import type { KnowledgeIntent } from "../knowledge/authored/types.js";
import type { GeneratedKnowledgeIndex, KnowledgeChunk } from "../knowledge/types.js";

const INTENT_ORDER = [
  "overview",
  "problem",
  "research",
  "solution",
  "architecture",
  "interaction",
  "technology",
  "form",
  "value",
  "comparison",
  "contribution",
] as const satisfies readonly KnowledgeIntent[];

export interface QueryRoute {
  readonly normalizedQuery: string;
  readonly queryTerms: readonly string[];
  readonly projectIds: readonly string[];
  readonly intents: readonly KnowledgeIntent[];
}

export interface QueryRouter {
  route(query: string): QueryRoute;
}

interface ProjectAlias {
  readonly projectId: string;
  readonly phrase: string;
}

interface QuestionRoute {
  readonly projectId: string;
  readonly intents: readonly KnowledgeIntent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeQueryText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([a-z0-9])([\p{Script=Han}])/gu, "$1 $2")
    .replace(/([\p{Script=Han}])([a-z0-9])/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildQueryTerms(normalizedQuery: string): readonly string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (term: string): void => {
    if (term && !seen.has(term)) {
      seen.add(term);
      terms.push(term);
    }
  };

  for (const match of normalizedQuery.matchAll(/\p{Script=Han}+|[a-z0-9]+/gu)) {
    const value = match[0]!;
    if (/^\p{Script=Han}+$/u.test(value)) {
      const characters = Array.from(value);
      for (let index = 0; index + 1 < characters.length; index += 1) {
        add(`${characters[index]}${characters[index + 1]}`);
      }
    } else {
      add(value);
    }
  }
  return terms;
}

function phraseOccurs(query: string, phrase: string): boolean {
  if (!phrase) return false;
  if (/\p{Script=Han}/u.test(phrase)) return query.includes(phrase);
  return ` ${query} `.includes(` ${phrase} `);
}

function isUsableProjectAlias(projectId: string, phrase: string): boolean {
  if (phrase === normalizeQueryText(projectId)) return true;
  if (/\p{Script=Han}/u.test(phrase)) return Array.from(phrase).length >= 2;
  return phrase.includes(" ");
}

function assertAliasArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid v2 ${label}`);
  }
  return value.map((alias) => {
    if (typeof alias !== "string" || !normalizeQueryText(alias)) {
      throw new Error(`Invalid v2 ${label}`);
    }
    return alias;
  });
}

function validatedChunkIntents(
  value: unknown,
  knowledgeKind: unknown,
): readonly KnowledgeIntent[] {
  if (!Array.isArray(value)) throw new Error("Invalid v2 chunk intents");
  const intents: KnowledgeIntent[] = [];
  for (const intent of value) {
    if (typeof intent !== "string" || !INTENT_ORDER.includes(intent as KnowledgeIntent)) {
      throw new Error("Invalid v2 chunk intents");
    }
    if (intents.includes(intent as KnowledgeIntent)) {
      throw new Error("Invalid v2 chunk intents");
    }
    intents.push(intent as KnowledgeIntent);
  }
  if (
    (knowledgeKind === "authored-claim" && intents.length === 0)
    || (knowledgeKind === "source-excerpt" && intents.length !== 0)
  ) {
    throw new Error("Invalid v2 chunk intents");
  }
  return Object.freeze([...intents]);
}

function assertV2Index(index: GeneratedKnowledgeIndex): void {
  const candidate = index as unknown;
  if (!isRecord(candidate) || candidate.version !== 2 || !Array.isArray(candidate.chunks)) {
    throw new Error("Invalid v2 knowledge index");
  }
  const intentAliases = candidate.intentAliases;
  if (!isRecord(intentAliases)) {
    throw new Error("Invalid v2 intent aliases");
  }
  const keys = Object.keys(intentAliases);
  if (
    keys.length !== INTENT_ORDER.length
    || INTENT_ORDER.some((intent) => !Object.hasOwn(intentAliases, intent))
  ) {
    throw new Error("Invalid v2 intent aliases");
  }
  for (const intent of INTENT_ORDER) {
    assertAliasArray(intentAliases[intent], `intent aliases for ${intent}`);
  }
  for (const chunk of candidate.chunks) {
    if (!isRecord(chunk)) throw new Error("Invalid v2 knowledge chunk");
    if (chunk.knowledgeKind !== "source-excerpt" && chunk.knowledgeKind !== "authored-claim") {
      throw new Error("Invalid v2 knowledge chunk");
    }
    validatedChunkIntents(chunk.intents, chunk.knowledgeKind);
    if (
      !Array.isArray(chunk.questionAliases)
      || chunk.questionAliases.some(
        (alias) => typeof alias !== "string" || !normalizeQueryText(alias),
      )
    ) {
      throw new Error("Invalid v2 question aliases");
    }
    if (chunk.projectId === undefined) continue;
    if (typeof chunk.projectId !== "string" || !normalizeQueryText(chunk.projectId)) {
      throw new Error("Invalid v2 project ID");
    }
    assertAliasArray(chunk.aliases, "project aliases");
  }
}

function projectAliasMap(index: GeneratedKnowledgeIndex): {
  readonly projectIds: readonly string[];
  readonly aliases: readonly ProjectAlias[];
  readonly exactQuestions: ReadonlyMap<string, readonly QuestionRoute[]>;
} {
  const projectIds: string[] = [];
  const seenProjects = new Set<string>();
  const aliases: ProjectAlias[] = [];
  const seenAliases = new Set<string>();
  const exactQuestions = new Map<string, QuestionRoute[]>();

  for (const chunk of index.chunks) {
    if (!chunk.projectId || chunk.knowledgeKind !== "authored-claim") continue;
    const projectId = chunk.projectId;
    if (!seenProjects.has(projectId)) {
      seenProjects.add(projectId);
      projectIds.push(projectId);
    }
    for (const alias of [...chunk.aliases, chunk.title, projectId]) {
      const phrase = normalizeQueryText(alias);
      const key = `${projectId}\u0000${phrase}`;
      if (!seenAliases.has(key) && isUsableProjectAlias(projectId, phrase)) {
        seenAliases.add(key);
        aliases.push({ projectId, phrase });
      }
    }
    for (const questionAlias of chunk.questionAliases) {
      const question = normalizeQueryText(questionAlias);
      if (!question) continue;
      const routes = exactQuestions.get(question) ?? [];
      routes.push({
        projectId,
        intents: Object.freeze([...chunk.intents]),
      });
      exactQuestions.set(question, routes);
    }
  }
  return { projectIds, aliases, exactQuestions };
}

/** Builds a deterministic, browser-safe router directly from a generated v2 index. */
export function createQueryRouter(index: GeneratedKnowledgeIndex): QueryRouter {
  assertV2Index(index);
  const derived = projectAliasMap(index);
  const projectPhrases = new Set(derived.aliases.map(({ phrase }) => phrase));
  const normalizedIntentAliases = INTENT_ORDER.map((intent) => ({
    intent,
    phrases: index.intentAliases[intent].map(normalizeQueryText),
  }));

  return {
    route(query: string): QueryRoute {
      const normalizedQuery = normalizeQueryText(query);
      const queryTerms = buildQueryTerms(normalizedQuery);
      const matchedProjects = new Set<string>();
      const matchedIntents = new Set<KnowledgeIntent>();
      const exactQuestionRoutes = derived.exactQuestions.get(normalizedQuery) ?? [];

      for (const alias of derived.aliases) {
        if (phraseOccurs(normalizedQuery, alias.phrase)) matchedProjects.add(alias.projectId);
      }
      for (const exact of exactQuestionRoutes) {
        matchedProjects.add(exact.projectId);
      }
      const matchedPhrases = normalizedIntentAliases.flatMap(({ intent, phrases }) =>
        phrases
          .filter((phrase) => !projectPhrases.has(phrase) && phraseOccurs(normalizedQuery, phrase))
          .map((phrase) => ({ intent, phrase })),
      );
      for (const { intent, phrase } of matchedPhrases) {
        const shadowedBySpecificOtherIntent = matchedPhrases.some(
          (candidate) =>
            candidate.intent !== intent
            && candidate.phrase.length > phrase.length
            && candidate.phrase.includes(phrase),
        );
        if (!shadowedBySpecificOtherIntent) {
          matchedIntents.add(intent);
        }
      }
      if (matchedIntents.size === 0) {
        for (const exact of exactQuestionRoutes) {
          for (const intent of exact.intents) matchedIntents.add(intent);
        }
      }

      if (matchedProjects.size === 0 && matchedIntents.has("comparison")) {
        for (const projectId of derived.projectIds) matchedProjects.add(projectId);
      }
      if (matchedProjects.size === 0) {
        const preserveContributionBoundary = matchedIntents.has("contribution");
        matchedIntents.clear();
        if (preserveContributionBoundary) matchedIntents.add("contribution");
      }

      return {
        normalizedQuery,
        queryTerms,
        projectIds: derived.projectIds.filter((projectId) => matchedProjects.has(projectId)),
        intents: INTENT_ORDER.filter((intent) => matchedIntents.has(intent)),
      };
    },
  };
}
