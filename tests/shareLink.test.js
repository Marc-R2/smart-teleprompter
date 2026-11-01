import { describe, it, expect } from "vitest";
import {
  decodeShareHash,
  encodeShareHash,
  isShareHash,
} from "../src/lib/shareLink";

describe("share links", () => {
  it("round-trips a script with non-ASCII text", async () => {
    const script = { title: "Größe 📚", text: "# Καλημέρα\n\n**Привет**", language: "de-DE" };
    const hash = await encodeShareHash(script);
    expect(isShareHash(hash)).toBe(true);
    expect(hash).toMatch(/^#s=[\w-]+$/);
    expect(await decodeShareHash(hash)).toEqual(script);
  });

  it("rejects a corrupted link", async () => {
    await expect(decodeShareHash("#s=not-a-valid-link")).rejects.toThrow();
  });
});
