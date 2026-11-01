// Share links carry the whole script, compressed, in the URL fragment. The
// fragment is never sent to a server, so sharing needs no backend, works on any
// static host (GitHub Pages included) and links do not expire.

const HASH_PREFIX = "#s=";

const toBase64Url = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value) => {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const pipeThrough = async (bytes, transform) =>
  new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(transform)
    ).arrayBuffer()
  );

export async function encodeShareHash({ title, text, language }) {
  const json = new TextEncoder().encode(
    JSON.stringify({ title, text, language })
  );
  const compressed = await pipeThrough(
    json,
    new CompressionStream("deflate-raw")
  );
  return HASH_PREFIX + toBase64Url(compressed);
}

export const isShareHash = (hash) => (hash || "").startsWith(HASH_PREFIX);

export async function decodeShareHash(hash) {
  const bytes = fromBase64Url(hash.slice(HASH_PREFIX.length));
  const json = await pipeThrough(bytes, new DecompressionStream("deflate-raw"));
  const data = JSON.parse(new TextDecoder().decode(json));
  if (!data || typeof data.text !== "string" || !data.text.trim()) {
    throw new Error("empty");
  }
  return data;
}
