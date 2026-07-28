import { knowledgeSources } from "../manifest";
import glossaryJson from "./glossary.json";
import atempoJson from "./projects/atempo.json";
import emovueJson from "./projects/emovue.json";
import evolutionFruitJson from "./projects/evolution-fruit.json";
import firstFlyJson from "./projects/first-fly.json";
import inkseatJson from "./projects/inkseat.json";
import urosenseJson from "./projects/urosense.json";
import type {
  AuthoredGlossary,
  AuthoredGlossaryEntry,
  AuthoredProjectDossier,
  KnowledgeIntent,
  PageKnowledge,
} from "./types";
import {
  validateProjectDossier as validateAuthoredProjectDossier,
} from "./validate";

const intentOrder = [
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length
    || actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(`Invalid ${label} keys`);
  }
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    result.push(requireNonEmptyString(value[index], `${label} ${index + 1}`));
  }
  return result;
}

function requireIntentArray(
  value: unknown,
  label: string,
): readonly KnowledgeIntent[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid ${label}`);
  }
  const result: KnowledgeIntent[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const intent = value[index];
    if (
      typeof intent !== "string"
      || !intentOrder.includes(intent as KnowledgeIntent)
      || result.includes(intent as KnowledgeIntent)
    ) {
      throw new Error(`Invalid ${label}`);
    }
    result.push(intent as KnowledgeIntent);
  }
  return result;
}

function normalizeTerm(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function validateGlossary(candidate: unknown): AuthoredGlossary {
  if (!isRecord(candidate)) throw new Error("Invalid authored glossary");
  requireExactKeys(candidate, ["version", "entries"], "authored glossary");
  if (candidate.version !== 1 || !Array.isArray(candidate.entries)) {
    throw new Error("Invalid authored glossary");
  }

  const entries: AuthoredGlossaryEntry[] = [];
  const termOwners = new Map<string, string>();
  for (let index = 0; index < candidate.entries.length; index += 1) {
    const value = candidate.entries[index];
    if (!isRecord(value)) throw new Error(`Invalid glossary entry ${index + 1}`);
    requireExactKeys(
      value,
      ["canonical", "aliases", "intents"],
      `glossary entry ${index + 1}`,
    );
    const canonical = requireNonEmptyString(
      value.canonical,
      `glossary entry ${index + 1} canonical`,
    );
    const aliases = requireStringArray(
      value.aliases,
      `glossary entry ${index + 1} aliases`,
    );
    const entryIntents = requireIntentArray(
      value.intents,
      `glossary entry ${index + 1} intents`,
    );
    const owner = `${normalizeTerm(canonical)}\u0000${entryIntents.join("\u0000")}`;
    for (const term of [canonical, ...aliases]) {
      const normalized = normalizeTerm(term);
      if (normalized.length === 0) {
        throw new Error(`Invalid glossary term for ${canonical}`);
      }
      const previousOwner = termOwners.get(normalized);
      if (previousOwner !== undefined && previousOwner !== owner) {
        throw new Error(`Conflicting normalized glossary term: ${term}`);
      }
      termOwners.set(normalized, owner);
    }
    entries.push({ canonical, aliases, intents: entryIntents });
  }
  return { version: 1, entries };
}

function deepFreeze<T>(value: T): T {
  if (
    typeof value !== "object"
    || value === null
    || Object.isFrozen(value)
  ) {
    return value;
  }
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function loadDossier(
  projectId: string,
  candidate: unknown,
): AuthoredProjectDossier {
  const matchingSources = knowledgeSources.filter(
    (source) => source.kind === "project-pdf" && source.projectId === projectId,
  );
  const source = matchingSources[0];
  if (
    matchingSources.length !== 1
    || source === undefined
    || source.projectId === undefined
    || source.pageCount === undefined
  ) {
    throw new Error(`Missing unique project manifest entry: ${projectId}`);
  }
  return deepFreeze(validateAuthoredProjectDossier(candidate, {
    expectedProjectId: source.projectId,
    expectedPageCount: source.pageCount,
  }));
}

export const authoredProjects: readonly AuthoredProjectDossier[] = Object.freeze([
  loadDossier("inkseat", inkseatJson),
  loadDossier("emovue", emovueJson),
  loadDossier("evolution-fruit", evolutionFruitJson),
  loadDossier("atempo", atempoJson),
  loadDossier("urosense", urosenseJson),
  loadDossier("first-fly", firstFlyJson),
]);

export const authoredGlossary: AuthoredGlossary = deepFreeze(
  validateGlossary(glossaryJson),
);

class FrozenReadonlyMap<K, V> implements ReadonlyMap<K, V> {
  readonly #source: ReadonlyMap<K, V>;

  constructor(source: ReadonlyMap<K, V>) {
    this.#source = source;
    Object.freeze(this);
  }

  get size(): number {
    return this.#source.size;
  }

  get(key: K): V | undefined {
    return this.#source.get(key);
  }

  has(key: K): boolean {
    return this.#source.has(key);
  }

  forEach(
    callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void,
    thisArg?: unknown,
  ): void {
    this.#source.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, this);
    });
  }

  entries(): MapIterator<[K, V]> {
    return this.#source.entries();
  }

  keys(): MapIterator<K> {
    return this.#source.keys();
  }

  values(): MapIterator<V> {
    return this.#source.values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
}

export function buildPageKnowledgeMap(
  dossiers: readonly AuthoredProjectDossier[],
): ReadonlyMap<string, PageKnowledge> {
  const pages = new Map<string, PageKnowledge>();
  for (const dossier of dossiers) {
    for (const page of dossier.pages) {
      const key = `${dossier.projectId}:p${page.page}`;
      if (pages.has(key)) {
        throw new Error(`Duplicate authored page key: ${key}`);
      }
      pages.set(key, page);
    }
  }
  return new FrozenReadonlyMap(pages);
}

export function buildIntentAliases(
  glossary: AuthoredGlossary,
): Readonly<Record<KnowledgeIntent, readonly string[]>> {
  const aliases: Record<KnowledgeIntent, string[]> = {
    overview: [],
    problem: [],
    research: [],
    solution: [],
    architecture: [],
    interaction: [],
    technology: [],
    form: [],
    value: [],
    comparison: [],
    contribution: [],
  };
  const seen: Record<KnowledgeIntent, Set<string>> = {
    overview: new Set(),
    problem: new Set(),
    research: new Set(),
    solution: new Set(),
    architecture: new Set(),
    interaction: new Set(),
    technology: new Set(),
    form: new Set(),
    value: new Set(),
    comparison: new Set(),
    contribution: new Set(),
  };

  for (const entry of glossary.entries) {
    for (const intent of entry.intents) {
      for (const term of [entry.canonical, ...entry.aliases]) {
        const key = normalizeTerm(term);
        if (seen[intent].has(key)) continue;
        seen[intent].add(key);
        aliases[intent].push(term.normalize("NFKC").trim());
      }
    }
  }

  return Object.freeze({
    overview: Object.freeze(aliases.overview),
    problem: Object.freeze(aliases.problem),
    research: Object.freeze(aliases.research),
    solution: Object.freeze(aliases.solution),
    architecture: Object.freeze(aliases.architecture),
    interaction: Object.freeze(aliases.interaction),
    technology: Object.freeze(aliases.technology),
    form: Object.freeze(aliases.form),
    value: Object.freeze(aliases.value),
    comparison: Object.freeze(aliases.comparison),
    contribution: Object.freeze(aliases.contribution),
  });
}
