import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Mock SpeechRecognition API (not available in jsdom)
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = "en-US";
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
  }
  start() {}
  stop() {}
  abort() {}
}

vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
vi.stubGlobal("webkitSpeechRecognition", MockSpeechRecognition);

// Mock scrollTo
vi.stubGlobal("scrollTo", vi.fn());

// Newer Node versions define their own global localStorage, which is unusable
// without --localstorage-file and shadows the one from happy-dom.
const storage = new Map();
vi.stubGlobal("localStorage", {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
});

afterEach(cleanup);
