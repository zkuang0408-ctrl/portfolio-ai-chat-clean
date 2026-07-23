import type { SourceMarker } from "./chat-types.js";

export interface CitationParseResult {
  readonly text: string;
  readonly sourceIds: readonly SourceMarker[];
}

export interface CitationParser {
  push(chunk: string): string;
  finish(): CitationParseResult;
}

const SOURCE_MARKER_PATTERN = /^S[1-8]$/;

export function createCitationParser(
  allowedSourceIds: ReadonlySet<string>,
): CitationParser {
  const allowed = new Set(
    [...allowedSourceIds].filter((id): id is SourceMarker =>
      SOURCE_MARKER_PATTERN.test(id),
    ),
  );
  const cited = new Set<SourceMarker>();
  let pending = "";
  let finished = false;
  let finishResult: CitationParseResult | undefined;

  function parse(chunk: string, final: boolean): string {
    const buffer = pending + chunk;
    pending = "";
    let cursor = 0;
    let visible = "";

    while (cursor < buffer.length) {
      const markerStart = buffer.indexOf("[[", cursor);
      if (markerStart === -1) {
        const remainder = buffer.slice(cursor);
        if (!final && remainder.endsWith("[")) {
          visible += remainder.slice(0, -1);
          pending = "[";
        } else {
          visible += remainder;
        }
        break;
      }

      visible += buffer.slice(cursor, markerStart);
      const markerEnd = buffer.indexOf("]]", markerStart + 2);
      if (markerEnd === -1) {
        const incompleteMarker = buffer.slice(markerStart);
        if (final) {
          visible += incompleteMarker;
        } else {
          pending = incompleteMarker;
        }
        break;
      }

      const candidate = buffer.slice(markerStart + 2, markerEnd);
      if (allowed.has(candidate as SourceMarker)) {
        cited.add(candidate as SourceMarker);
      }
      cursor = markerEnd + 2;
    }

    return visible;
  }

  return {
    push(chunk) {
      if (finished) {
        throw new Error("citation_parser_finished");
      }
      return parse(chunk, false);
    },
    finish() {
      if (finishResult) {
        return finishResult;
      }
      finished = true;
      finishResult = {
        text: parse("", true),
        sourceIds: [...cited],
      };
      return finishResult;
    },
  };
}
