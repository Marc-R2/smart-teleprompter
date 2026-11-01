import { describe, it, expect } from "vitest";
import { createSmartTracker, similarity } from "../src/lib/smartTracker";
import { tokenizeSpeech } from "../src/lib/scriptModel";

const SCRIPT = `Heute möchte ich euch zeigen wie unser neues Produkt funktioniert.
Zuerst öffnet ihr die Anwendung und wählt ein passendes Dokument aus.
Danach beginnt die Spracherkennung automatisch mit der Analyse eurer Stimme.
Das ist wirklich wichtig, bitte merkt euch das gut.
Im zweiten Abschnitt sprechen wir über die Sicherheit aller gespeicherten Daten.
Jede Datei wird verschlüsselt und bleibt ausschließlich auf eurem Gerät.
Das ist wirklich wichtig, bitte merkt euch das gut.
Zum Schluss schauen wir uns die Preise und die verschiedenen Lizenzmodelle an.
Vielen Dank fürs Zuhören und bis zum nächsten Mal.`;

const words = tokenizeSpeech(SCRIPT);
const wordAt = (index) => words[index];
const indexOf = (phrase, from = 0) => {
  const tokens = tokenizeSpeech(phrase);
  for (let i = from; i < words.length; i++) {
    if (tokens.every((token, k) => words[i + k] === token)) return i;
  }
  throw new Error(`"${phrase}" is not in the script`);
};

// Speaks word by word as interim results, then finalizes, like Chrome does.
function say(tracker, phrase) {
  const tokens = tokenizeSpeech(phrase);
  let result = null;
  tokens.forEach((_, i) => {
    const next = tracker.update([], tokens.slice(0, i + 1));
    if (next) {
      result = next;
      tracker.setPosition(next.index);
    }
  });
  const final = tracker.update(tokens, []);
  if (final) {
    result = final;
    tracker.setPosition(final.index);
  }
  return result;
}

describe("similarity", () => {
  it("accepts inflections and transcription slips but not unrelated words", () => {
    expect(similarity("gespeichert", "gespeicherten")).toBeGreaterThan(0.7);
    expect(similarity("spracherkenung", "spracherkennung")).toBeGreaterThan(0.7);
    expect(similarity("haus", "maus")).toBeLessThan(0.8);
    expect(similarity("daten", "preise")).toBe(0);
    expect(similarity("an", "am")).toBe(0);
  });
});

describe("smart tracker", () => {
  it("follows a text that is read straight through", () => {
    const tracker = createSmartTracker(words);
    const result = say(tracker, "Heute möchte ich euch zeigen wie unser neues Produkt");
    expect(wordAt(result.index)).toBe("produkt");
  });

  it("stays on track when wording is changed", () => {
    const tracker = createSmartTracker(words);
    say(tracker, "Heute möchte ich euch zeigen wie unser neues Produkt funktioniert");
    const result = say(
      tracker,
      "als erstes macht ihr die Anwendung auf und wählt ein passendes Dokument"
    );
    expect(wordAt(result.index)).toBe("dokument");
  });

  it("does not move while the speaker improvises", () => {
    const tracker = createSmartTracker(words);
    say(tracker, "Heute möchte ich euch zeigen");
    const position = indexOf("zeigen");
    tracker.setPosition(position);
    const result = say(tracker, "ganz kurz noch etwas zum Wetter draußen");
    expect(result).toBeNull();
  });

  it("follows when a passage is left out", () => {
    const tracker = createSmartTracker(words);
    say(tracker, "Heute möchte ich euch zeigen wie unser neues Produkt funktioniert");
    const result = say(
      tracker,
      "Im zweiten Abschnitt sprechen wir über die Sicherheit"
    );
    expect(wordAt(result.index)).toBe("sicherheit");
  });

  it("does not count skipped words as part of the spoken span", () => {
    const tracker = createSmartTracker(words);
    say(tracker, "Heute möchte ich euch zeigen wie unser neues Produkt");
    const result = say(tracker, "Danach beginnt die Spracherkennung");
    expect(result.spanStart).toBe(indexOf("Danach"));
  });

  it("follows when the speaker jumps back", () => {
    const tracker = createSmartTracker(words);
    tracker.setPosition(indexOf("Zum Schluss"));
    say(tracker, "Zum Schluss schauen wir uns die Preise");
    const result = say(
      tracker,
      "Danach beginnt die Spracherkennung automatisch mit der Analyse"
    );
    expect(wordAt(result.index)).toBe("analyse");
    expect(result.index).toBeLessThan(indexOf("Zum Schluss"));
  });

  it("does not jump backwards because of one common word", () => {
    const tracker = createSmartTracker(words);
    const position = indexOf("Zum Schluss");
    tracker.setPosition(position);
    const result = say(tracker, "die und");
    expect(result === null || result.index >= position).toBe(true);
  });

  describe("repeated passages", () => {
    const repeated = "Das ist wirklich wichtig, bitte merkt euch das gut";
    const first = indexOf("Das ist wirklich");
    const second = indexOf("Das ist wirklich", first + 1);

    it("takes the next occurrence when reading onward", () => {
      const tracker = createSmartTracker(words);
      tracker.setPosition(indexOf("Analyse"));
      say(tracker, "der Analyse eurer Stimme");
      const result = say(tracker, repeated);
      expect(result.index).toBeLessThan(second);
    });

    it("takes the later occurrence once past the earlier one", () => {
      const tracker = createSmartTracker(words);
      tracker.setPosition(indexOf("verschlüsselt"));
      say(tracker, "verschlüsselt und bleibt ausschließlich auf eurem Gerät");
      const result = say(tracker, repeated);
      expect(result.index).toBeGreaterThan(second);
    });

    it("does not jump back onto a passage that also lies ahead", () => {
      const tracker = createSmartTracker(words);
      tracker.setPosition(indexOf("Sicherheit"));
      const result = say(tracker, repeated);
      expect(result.index).toBeGreaterThan(second);
    });

    it("uses context to go back to the earlier occurrence", () => {
      const tracker = createSmartTracker(words);
      tracker.setPosition(indexOf("Zum Schluss"));
      const result = say(
        tracker,
        `der Analyse eurer Stimme ${repeated}`
      );
      expect(result.index).toBeLessThan(second);
      expect(result.index).toBeGreaterThan(first);
    });
  });

  it("matches split and joined compound words", () => {
    const script = tokenizeSpeech("Der Smart-Mode ist neu und wirklich gut");
    const tracker = createSmartTracker(script);
    const result = say(tracker, "der smart mode ist neu");
    expect(script[result.index]).toBe("neu");
  });

  it("never lands on skipped co-host words", () => {
    const script = tokenizeSpeech("mein Text hier dein langer Text dort mein Schluss kommt");
    const skip = script.map((_, i) => i >= 3 && i <= 6);
    const tracker = createSmartTracker(script, skip);
    tracker.setPosition(2);
    const result = say(tracker, "dein langer Text dort mein Schluss");
    expect(result.index).toBe(8);
  });

  it("keeps context across a recognition restart", () => {
    const tracker = createSmartTracker(words);
    tracker.update(tokenizeSpeech("Heute möchte ich euch"), []);
    tracker.setPosition(indexOf("euch"));
    const result = tracker.update([], tokenizeSpeech("zeigen"));
    expect(wordAt(result.index)).toBe("zeigen");
  });

  it("handles an empty script", () => {
    const tracker = createSmartTracker([]);
    expect(tracker.update(["hallo"], [])).toBeNull();
  });

  it("is fast enough for a very long script", () => {
    const long = [];
    for (let i = 0; i < 20000; i++) long.push(`wort${i % 3000}`);
    const tracker = createSmartTracker(long);
    const heard = long.slice(500, 516);
    const started = performance.now();
    for (let i = 0; i < 10; i++) tracker.update([], heard);
    expect((performance.now() - started) / 10).toBeLessThan(60);
  });
});
