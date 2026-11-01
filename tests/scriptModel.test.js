import { describe, it, expect } from "vitest";
import {
  buildScriptModel,
  normalizeToken,
  tokenizeSpeech,
} from "../src/lib/scriptModel";

describe("buildScriptModel", () => {
  it("keeps single line breaks of plain-text scripts", () => {
    const { lines, words } = buildScriptModel("first line\nsecond line");
    expect(lines).toHaveLength(2);
    expect(words).toEqual(["first", "line", "second", "line"]);
  });

  it("excludes code blocks and inline code from spoken words", () => {
    const model = buildScriptModel(
      "Say this `not this` now\n\n```\nStage direction here\n```\n\nThen this"
    );
    expect(model.words).toEqual(["Say", "this", "now", "Then", "this"]);
    expect(model.lines.find((l) => l.kind === "code").text).toBe(
      "Stage direction here"
    );
  });

  it("carries inline formatting on words", () => {
    const { lines } = buildScriptModel("**bold** *it* ~~gone~~ ==mark== ++under++");
    const marks = lines[0].items.map((item) => item.marks);
    expect(marks[0].bold).toBe(true);
    expect(marks[1].italic).toBe(true);
    expect(marks[2].strike).toBe(true);
    expect(marks[3].highlight).toBe(true);
    expect(marks[4].underline).toBe(true);
  });

  it("renders headings and lists without speaking their markers", () => {
    const { lines, words } = buildScriptModel("# Title\n\n1. one\n2. two\n- bullet");
    expect(lines[0]).toMatchObject({ type: "heading", level: 1 });
    expect(lines[1].marker).toBe("1.");
    expect(lines[2].marker).toBe("2.");
    expect(words).toEqual(["Title", "one", "two", "bullet"]);
  });

  it("skips co-host lines but not the presenter line right after them", () => {
    const model = buildScriptModel(">> co host\nmy line\n@Anna: her line\nmine again");
    const skippedWords = model.words.filter((_, i) => model.skippable[i]);
    expect(skippedWords).toEqual(["co", "host", "@Anna:", "her", "line"]);
  });

  it("does not treat indented plain text as code", () => {
    const { words } = buildScriptModel("    indented text stays spoken");
    expect(words).toEqual(["indented", "text", "stays", "spoken"]);
  });

  it("does not interpret raw HTML", () => {
    const { words, lines } = buildScriptModel('<img src=x onerror="alert(1)">\n\nhello');
    expect(words).toEqual(["hello"]);
    expect(JSON.stringify(lines)).not.toContain("onerror");
  });

  it("decodes characters instead of showing entities", () => {
    expect(buildScriptModel("Tom & Jerry's <3").words).toEqual([
      "Tom",
      "&",
      "Jerry's",
      "<3",
    ]);
  });

  it("indexes table cells as words", () => {
    const { lines, words } = buildScriptModel("| a | b |\n|---|---|\n| c | d |");
    expect(lines.map((line) => line.kind)).toEqual(["row", "row"]);
    expect(words).toEqual(["a", "b", "c", "d"]);
  });

  describe("text in brackets", () => {
    const notes = (line) =>
      line.items.filter((item) => item.note).map((item) => item.note);

    it("is shown but not spoken", () => {
      const { words, lines } = buildScriptModel("Say (smile) this [slide 2] now");
      expect(words).toEqual(["Say", "this", "now"]);
      expect(notes(lines[0])).toEqual(["(smile)", "[slide 2]"]);
    });

    it("keeps spacing and attached punctuation", () => {
      const { lines } = buildScriptModel("Word (note), next");
      const rendered = lines[0].items
        .map((item) => (item.word ?? item.note) + (item.space ? " " : ""))
        .join("");
      expect(rendered).toBe("Word (note), next");
    });

    it("handles nesting and formatting inside", () => {
      const { words, lines } = buildScriptModel("a (b (c) **d** e) f");
      expect(words).toEqual(["a", "f"]);
      expect(notes(lines[0]).join("")).toBe("(b (c) d e)");
    });

    it("keeps an unclosed bracket spoken", () => {
      expect(buildScriptModel("one (two three").words).toEqual(["one", "(two", "three"]);
      expect(buildScriptModel("one) two").words).toEqual(["one)", "two"]);
    });

    it("does not span line breaks", () => {
      expect(buildScriptModel("one (two\nthree) four").words).toEqual([
        "one", "(two", "three)", "four",
      ]);
    });

    it("can be spoken if the user prefers", () => {
      expect(buildScriptModel("a (b) c", { speakBrackets: true }).words).toEqual([
        "a", "(b)", "c",
      ]);
    });

    it("works in tables", () => {
      expect(buildScriptModel("| a (x) | b |\n|---|---|\n| c | d |").words).toEqual([
        "a", "b", "c", "d",
      ]);
    });
  });

  it("assigns word indexes in reading order", () => {
    const { lines, lineStart } = buildScriptModel("one two\nthree");
    expect(lineStart).toEqual([0, 2]);
    expect(lines[1].items[0].index).toBe(2);
  });
});

describe("normalization", () => {
  it("handles every supported alphabet", () => {
    expect(normalizeToken("Größe,")).toBe("grosse");
    expect(normalizeToken("Привет!")).toBe("привет");
    expect(normalizeToken("Καλημέρας")).toBe("καλημερασ");
    expect(normalizeToken("مرحبا")).toBe("مرحبا");
    expect(normalizeToken("—")).toBe("");
  });

  it("segments languages written without spaces", () => {
    expect(tokenizeSpeech("今天天气很好").length).toBeGreaterThan(1);
  });
});
