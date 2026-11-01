import { Marked } from "marked";

// Scripts are stored as Markdown strings. This module turns one into the flat
// model the prompter renders and tracks: `lines` (one visual row each) and
// `words` (only what is actually spoken). Fenced code blocks, inline code,
// list markers and images never become words, so voice tracking and auto-scroll
// pass over them without any special casing.

const inlineMark = (name, delimiter, type) => ({
  name: type,
  level: "inline",
  start: (src) => src.indexOf(delimiter),
  tokenizer(src) {
    const escaped = delimiter.replace(/[+]/g, "\\+");
    const match = new RegExp(`^${escaped}(?=\\S)([\\s\\S]*?\\S)${escaped}`).exec(
      src
    );
    if (!match) return undefined;
    return {
      type,
      raw: match[0],
      tokens: this.lexer.inlineTokens(match[1]),
    };
  },
  renderer: () => "",
});

const parser = new Marked({
  gfm: true,
  // A script's single line breaks are intentional, unlike in prose Markdown.
  breaks: true,
  extensions: [
    inlineMark("highlight", "==", "highlight"),
    inlineMark("underline", "++", "underline"),
  ],
  tokenizer: {
    // Indented text is not code here: pasted plain-text scripts are often
    // indented, and treating them as code would silently stop tracking them.
    code: () => undefined,
  },
});

const CO_HOST_NAME_RE = /^@[^\s:]{1,30}:/;
const QUOTE_LINE_RE = /^\s{0,3}>/;
const FENCE_RE = /^\s{0,3}(```|~~~)/;
const CJK_RE = /[぀-ヿ㐀-鿿]/;

// Co-host lines use ">>", which is a Markdown quote. Markdown lets a following
// unquoted line continue that quote, but here that line is the presenter's, so
// quotes are closed explicitly.
export function normalizeMarkdownInput(source) {
  const output = [];
  let inFence = false;
  for (const line of String(source ?? "").split(/\r?\n/)) {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const previous = output[output.length - 1];
    if (
      !inFence &&
      previous !== undefined &&
      QUOTE_LINE_RE.test(previous) &&
      line.trim() &&
      !QUOTE_LINE_RE.test(line)
    ) {
      output.push("");
    }
    output.push(line);
  }
  return output.join("\n");
}

export function normalizeToken(input) {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ς/g, "σ")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "")
    .normalize("NFC");
}

let segmenter;
function segmentCjk(chunk) {
  if (!CJK_RE.test(chunk) || typeof Intl === "undefined" || !Intl.Segmenter)
    return [chunk];
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
  const pieces = [];
  for (const { segment } of segmenter.segment(chunk)) {
    if (segment.trim()) pieces.push(segment);
  }
  return pieces;
}

// Chinese and Japanese have no spaces, so a whole sentence would otherwise
// count as one "word" and could never match what was heard.
export function tokenizeSpeech(transcript) {
  return String(transcript ?? "")
    .split(/\s+/)
    .flatMap(segmentCjk)
    .map(normalizeToken)
    .filter(Boolean);
}

// Finds "(...)" and "[...]" spanning `text`, outermost pairs only. A bracket that
// is never closed stays spoken, so a stray "(" cannot silence the rest of a line.
export function findBracketRanges(text) {
  const closing = { "(": ")", "[": "]" };
  const ranges = [];
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (closing[char]) {
      stack.push({ at: i, expected: closing[char] });
    } else if (char === ")" || char === "]") {
      while (stack.length && stack[stack.length - 1].expected !== char) {
        stack.pop();
      }
      const open = stack.pop();
      if (open && !stack.length) ranges.push([open.at, i + 1]);
    }
  }
  return ranges;
}

function decodeEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&");
}

function flattenInline(tokens, marks, sink) {
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "strong":
        flattenInline(token.tokens, { ...marks, bold: true }, sink);
        break;
      case "em":
        flattenInline(token.tokens, { ...marks, italic: true }, sink);
        break;
      case "del":
        flattenInline(token.tokens, { ...marks, strike: true }, sink);
        break;
      case "highlight":
        flattenInline(token.tokens, { ...marks, highlight: true }, sink);
        break;
      case "underline":
        flattenInline(token.tokens, { ...marks, underline: true }, sink);
        break;
      case "link":
        flattenInline(token.tokens, { ...marks, link: true }, sink);
        break;
      case "codespan":
        sink.note(decodeEntities(token.text));
        break;
      case "image":
        if (token.text) sink.note(token.text);
        break;
      case "br":
        sink.breakLine();
        break;
      case "html":
        break;
      default:
        if (token.tokens?.length) flattenInline(token.tokens, marks, sink);
        else sink.text(decodeEntities(token.text ?? token.raw ?? ""), marks);
    }
  }
}

export function buildScriptModel(source, { speakBrackets = false } = {}) {
  const lines = [];
  const words = [];
  const normalized = [];
  const lineStart = [];
  const skippable = [];

  const pushLine = (line) => {
    lineStart.push(words.length);
    const index = lines.length;
    lines.push({ kind: "text", items: [], ...line });
    return index;
  };

  const addWords = (items, chunk, marks, coHost) => {
    for (const piece of segmentCjk(chunk)) {
      items.push({ word: piece, index: words.length, marks, space: false });
      words.push(piece);
      normalized.push(normalizeToken(piece));
      skippable.push(coHost);
    }
  };

  // Collects a line's inline tokens first: a bracket may open in plain text and
  // close inside **bold** text, which is only visible with the whole line.
  const makeSink = (onBreak) => {
    const pieces = [];
    return {
      text(value, marks) {
        pieces.push({ value, marks });
      },
      note(value) {
        pieces.push({ note: value });
      },
      breakLine: onBreak,
      flush(items, coHost) {
        const whole = pieces.map((piece) => piece.value ?? "").join("");
        const ranges = speakBrackets ? [] : findBracketRanges(whole);
        const pushText = (value, marks) => {
          for (const part of value.match(/\s+|\S+/g) ?? []) {
            if (/^\s/.test(part)) {
              if (items.length) items[items.length - 1].space = true;
            } else {
              addWords(items, part, marks, coHost);
            }
          }
        };
        let offset = 0;
        let range = 0;
        for (const piece of pieces) {
          if (piece.note !== undefined) {
            items.push({ note: piece.note, space: false });
            continue;
          }
          const end = offset + piece.value.length;
          let at = offset;
          while (at < end) {
            while (range < ranges.length && ranges[range][1] <= at) range += 1;
            const current = ranges[range];
            if (current && current[0] <= at) {
              const stop = Math.min(end, current[1]);
              const text = whole.slice(at, stop);
              const previous = items[items.length - 1];
              // Continues across a change of formatting inside the bracket.
              if (previous?.bracket && at > current[0]) previous.note += text;
              else items.push({ note: text, bracket: true, space: false });
              at = stop;
            } else {
              const stop = Math.min(end, current ? current[0] : end);
              pushText(whole.slice(at, stop), piece.marks);
              at = stop;
            }
          }
          offset = end;
        }
        pieces.length = 0;
      },
    };
  };

  const emitInline = (tokens, base, coHost, firstMarker) => {
    let marker = firstMarker;
    // A line that opens with "@Name:" belongs to a co-host. It can only be
    // recognised once its first word is known, so flags are fixed up after.
    const startLine = () => {
      const index = pushLine({ ...base, marker, coHost });
      marker = undefined;
      return lines[index];
    };
    let line = startLine();
    const firstWordOfLine = [words.length];
    const finish = () => {
      sink.flush(line.items, line.coHost);
      const first = line.items.find((item) => item.word !== undefined);
      if (first && !line.coHost && CO_HOST_NAME_RE.test(first.word)) {
        line.coHost = true;
        for (let i = firstWordOfLine[0]; i < words.length; i++)
          skippable[i] = true;
      }
    };
    const sink = makeSink(() => {
      finish();
      line = startLine();
      firstWordOfLine[0] = words.length;
    });
    flattenInline(tokens, {}, sink);
    finish();
    return line;
  };

  const walk = (tokens, context) => {
    for (const token of tokens ?? []) {
      switch (token.type) {
        case "heading":
          emitInline(
            token.tokens,
            { type: "heading", level: token.depth, gapAfter: true, depth: context.depth },
            context.coHost
          );
          break;
        case "paragraph":
        case "text":
          if (token.type === "text" && !token.tokens) {
            emitInline(
              [{ type: "text", text: token.text, raw: token.raw }],
              { type: "paragraph", depth: context.depth },
              context.coHost,
              context.takeMarker?.()
            );
          } else {
            const line = emitInline(
              token.tokens,
              { type: "paragraph", depth: context.depth },
              context.coHost,
              context.takeMarker?.()
            );
            if (token.type === "paragraph") line.gapAfter = !context.tight;
          }
          break;
        case "list":
          token.items.forEach((item, position) => {
            let marker = item.task
              ? item.checked
                ? "☑"
                : "☐"
              : token.ordered
                ? `${Number(token.start || 1) + position}.`
                : "•";
            walk(item.tokens, {
              ...context,
              depth: context.depth + 1,
              tight: true,
              takeMarker: () => {
                const current = marker;
                marker = undefined;
                return current;
              },
            });
          });
          if (lines.length) lines[lines.length - 1].gapAfter = true;
          break;
        case "blockquote":
          walk(token.tokens, { ...context, coHost: true });
          break;
        case "code":
          pushLine({
            kind: "code",
            text: decodeEntities(token.text),
            gapAfter: true,
            depth: context.depth,
          });
          break;
        case "hr":
          pushLine({ kind: "hr", gapAfter: true, depth: context.depth });
          break;
        case "table": {
          const emitRow = (cells, header, isLast) => {
            const line = lines[pushLine({
              kind: "row",
              cells: [],
              header,
              coHost: context.coHost,
              gapAfter: isLast,
              depth: context.depth,
            })];
            for (const cell of cells) {
              const items = [];
              const sink = makeSink(() => {});
              flattenInline(cell.tokens, {}, sink);
              sink.flush(items, context.coHost);
              line.cells.push(items);
            }
          };
          emitRow(token.header, true, token.rows.length === 0);
          token.rows.forEach((row, position) =>
            emitRow(row, false, position === token.rows.length - 1)
          );
          break;
        }
        case "html":
          // Raw HTML is shown as its text content. It is never interpreted.
          emitInline(
            [{ type: "text", text: token.text.replace(/<[^>]*>/g, " "), raw: "" }],
            { type: "paragraph", gapAfter: true, depth: context.depth },
            context.coHost
          );
          break;
        default:
          break;
      }
    }
  };

  walk(parser.lexer(normalizeMarkdownInput(source)), {
    coHost: false,
    depth: 0,
    tight: false,
  });

  return { lines, words, normalized, lineStart, skippable };
}
