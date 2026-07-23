export function buildTerms(text: string): readonly string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const matches = normalized.matchAll(
    /(?<cjk>\p{Script=Han}+)|(?<english>[a-z0-9]+(?:['-][a-z0-9]+)*)/gu,
  );
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (term: string): void => {
    if (term && !seen.has(term)) {
      seen.add(term);
      terms.push(term);
    }
  };

  for (const match of matches) {
    const cjk = match.groups?.cjk;
    if (cjk) {
      const characters = Array.from(cjk);
      if (characters.length === 1) add(characters[0]!);
      else {
        for (let index = 0; index < characters.length - 1; index += 1) {
          add(`${characters[index]}${characters[index + 1]}`);
        }
      }
      continue;
    }
    add(match.groups?.english ?? "");
  }

  return terms;
}
