import { env, pipeline } from "@huggingface/transformers";

// Runs in a worker so that transcribing never blocks scrolling.
env.allowLocalModels = false;

let transcriber = null;

const load = async (model) => {
  const files = new Map();
  const progress_callback = (event) => {
    if (event.status !== "progress" || !event.file) return;
    files.set(event.file, { loaded: event.loaded, total: event.total });
    let loaded = 0;
    let total = 0;
    for (const file of files.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    self.postMessage({ type: "progress", loaded, total });
  };

  if (self.navigator.gpu) {
    try {
      transcriber = await pipeline("automatic-speech-recognition", model, {
        device: "webgpu",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q8" },
        progress_callback,
      });
      return "WebGPU";
    } catch (error) {
      console.warn("WebGPU unavailable, using WebAssembly:", error);
    }
  }
  transcriber = await pipeline("automatic-speech-recognition", model, {
    device: "wasm",
    dtype: "q8",
    progress_callback,
  });
  return "WebAssembly";
};

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      const device = await load(data.model);
      self.postMessage({ type: "ready", device });
    } else if (data.type === "transcribe") {
      const started = performance.now();
      const output = await transcriber(data.audio, {
        language: data.language,
        task: "transcribe",
      });
      self.postMessage({
        type: "result",
        id: data.id,
        text: output.text,
        ms: performance.now() - started,
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      id: data.id,
      message: String(error?.message ?? error),
    });
  }
};
