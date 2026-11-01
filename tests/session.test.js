import { describe, it, expect } from "vitest";
import { createSessionStats, formatDuration } from "../src/lib/sessionStats";
import { backupFileName, createBackup, mergeScripts, parseBackup } from "../src/lib/backup";
import { cleanTranscript, createSpeechSegmenter } from "../src/lib/speechSegmenter";

describe("session stats", () => {
  const clocked = () => {
    const clock = { t: 0 };
    return { clock, stats: createSessionStats(() => clock.t) };
  };

  it("only counts time while running", () => {
    const { clock, stats } = clocked();
    stats.setRunning(true);
    clock.t = 5000;
    stats.setRunning(false);
    clock.t = 60000;
    expect(stats.elapsedMs()).toBe(5000);
  });

  it("computes tempo once enough is known", () => {
    const { clock, stats } = clocked();
    stats.recordProgress(1);
    expect(stats.wordsPerMinute()).toBeNull();
    clock.t = 10000;
    stats.recordProgress(19);
    expect(stats.wordsPerMinute()).toBe(120);
  });

  it("forgets old tempo samples", () => {
    const { clock, stats } = clocked();
    stats.recordProgress(100);
    clock.t = 31000;
    expect(stats.wordsPerMinute()).toBeNull();
  });

  it("shows final words followed by the live ones", () => {
    const { stats } = clocked();
    stats.addHeard(" hello there", " how are");
    expect(stats.transcript()).toEqual({ final: "hello there", interim: "how are" });
  });

  it("formats durations", () => {
    expect(formatDuration(65000)).toBe("1:05");
    expect(formatDuration(3725000)).toBe("1:02:05");
  });
});

describe("backup", () => {
  const defaults = { fontSize: 32, nightMode: false, text: "" };
  const script = { id: "1", name: "A", text: "hello", language: "de-DE", savedAt: "x" };

  it("round-trips scripts and settings", () => {
    const parsed = parseBackup(
      createBackup([script], { fontSize: 50, text: "current" }),
      defaults
    );
    expect(parsed.scripts).toEqual([script]);
    expect(parsed.settings).toEqual({ fontSize: 50, text: "current" });
  });

  it("rejects foreign and broken files", () => {
    expect(() => parseBackup("not json", defaults)).toThrow();
    expect(() => parseBackup('{"scripts":[]}', defaults)).toThrow();
  });

  it("drops unknown settings and wrong types", () => {
    const file = createBackup([], { fontSize: "<b>", evil: 1, recognitionEngine: "local" });
    expect(parseBackup(file, defaults).settings).toEqual({});
  });

  it("merges without losing or duplicating scripts", () => {
    const changed = { ...script, text: "changed" };
    const merged = mergeScripts([script], [script, changed], 50);
    expect(merged).toMatchObject({ added: 1, duplicates: 1, rejected: 0 });
    expect(merged.scripts.map((s) => s.text)).toEqual(["hello", "changed"]);
    expect(new Set(merged.scripts.map((s) => s.id)).size).toBe(2);
  });

  it("reports scripts over the limit", () => {
    expect(mergeScripts([script], [{ ...script, id: "2", name: "B" }], 1).rejected).toBe(1);
  });

  it("names the file by date", () => {
    expect(backupFileName(new Date("2026-11-01T10:00:00Z"))).toBe(
      "smart-teleprompter-backup-2026-11-01.json"
    );
  });
});

describe("speech segmenter", () => {
  const RATE = 16000;
  const tone = (seconds, level = 0.2) => new Float32Array(RATE * seconds).fill(level);
  const quiet = (seconds) => new Float32Array(RATE * seconds);

  it("never transcribes silence", () => {
    const segmenter = createSpeechSegmenter();
    for (let i = 0; i < 30; i++) {
      segmenter.push(quiet(1));
      expect(segmenter.next()).toBeNull();
    }
  });

  it("gives interim audio while speaking and final audio at a pause", () => {
    const segmenter = createSpeechSegmenter();
    segmenter.push(tone(1));
    expect(segmenter.next()).toMatchObject({ final: false });
    expect(segmenter.next()).toBeNull();
    segmenter.push(quiet(1));
    expect(segmenter.next()).toMatchObject({ final: true });
    expect(segmenter.next()).toBeNull();
  });

  it("cuts very long speech with an overlap", () => {
    const segmenter = createSpeechSegmenter();
    segmenter.push(tone(9));
    const job = segmenter.next();
    expect(job.final).toBe(true);
    expect(job.audio.length).toBe(RATE * 9);
    segmenter.push(tone(1));
    expect(segmenter.next().audio.length).toBe(RATE + RATE / 4);
  });

  it("ignores steady room noise", () => {
    const segmenter = createSpeechSegmenter();
    for (let i = 0; i < 20; i++) segmenter.push(tone(1, 0.005));
    expect(segmenter.next()).toBeNull();
  });
});

describe("transcript cleanup", () => {
  it("removes Whisper's non-speech labels", () => {
    expect(cleanTranscript(" [Music] hello (applause) world ♪")).toBe("hello world");
    expect(cleanTranscript("[BLANK_AUDIO]")).toBe("");
  });
});
