import { cleanTranscript, createSpeechSegmenter } from "./speechSegmenter";

// On-device speech recognition with the same interface as the browser's
// SpeechRecognition, so the rest of the app does not care which one it talks to.

export const LOCAL_MODELS = {
  "onnx-community/whisper-tiny": {
    label: "Tiny",
    description: "Faster, less accurate",
    downloadMb: { webgpu: 65, wasm: 40 },
  },
  "onnx-community/whisper-base": {
    label: "Base",
    description: "Slower, more accurate",
    downloadMb: { webgpu: 135, wasm: 75 },
  },
};
export const DEFAULT_LOCAL_MODEL = "onnx-community/whisper-base";

const MODEL_CACHE = "transformers-cache";
const SAMPLE_RATE = 16000;

let worker = null;
let loadedModel = null;
let loadPromise = null;
let device = null;
let nextJobId = 1;
const jobs = new Map();

function failAllJobs(message) {
  for (const job of jobs.values()) job.reject(new Error(message));
  jobs.clear();
}

export function getLocalDevice() {
  return device;
}

export function loadLocalEngine(model, onProgress) {
  if (loadedModel === model) return Promise.resolve(device);
  if (loadPromise?.model === model) return loadPromise.promise;
  unloadLocalEngine();

  const promise = new Promise((resolve, reject) => {
    worker = new Worker(new URL("./whisperWorker.js", import.meta.url), {
      type: "module",
    });
    worker.onerror = (event) => {
      const message = event.message || "The speech model could not start.";
      failAllJobs(message);
      reject(new Error(message));
    };
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        onProgress?.(data.loaded, data.total);
      } else if (data.type === "ready") {
        loadedModel = model;
        device = data.device;
        loadPromise = null;
        resolve(device);
      } else if (data.type === "result") {
        jobs.get(data.id)?.resolve(data.text);
        jobs.delete(data.id);
      } else if (data.type === "error") {
        if (data.id) {
          jobs.get(data.id)?.reject(new Error(data.message));
          jobs.delete(data.id);
        } else {
          loadPromise = null;
          reject(new Error(data.message));
        }
      }
    };
    worker.postMessage({ type: "load", model });
  });
  loadPromise = { model, promise };
  return promise;
}

export function unloadLocalEngine() {
  worker?.terminate();
  worker = null;
  loadedModel = null;
  loadPromise = null;
  device = null;
  failAllJobs("The speech model was unloaded.");
}

export async function deleteLocalModels() {
  unloadLocalEngine();
  if (typeof caches !== "undefined") await caches.delete(MODEL_CACHE);
}

function transcribe(audio, language) {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error("The speech model is not loaded."));
      return;
    }
    const id = nextJobId++;
    jobs.set(id, { resolve, reject });
    worker.postMessage({ type: "transcribe", id, audio, language }, [
      audio.buffer,
    ]);
  });
}

function makeResult(transcript, isFinal) {
  const result = [{ transcript, confidence: 1 }];
  result.isFinal = isFinal;
  return { resultIndex: 0, results: [result] };
}

export class LocalRecognizer {
  lang = "en-US";
  stopped = false;
  busy = false;
  segmenter = createSpeechSegmenter({ sampleRate: SAMPLE_RATE });

  start() {
    this.onstart?.();
    this.openMicrophone().catch((error) => {
      if (this.stopped) return;
      const code = {
        NotAllowedError: "not-allowed",
        SecurityError: "not-allowed",
        NotFoundError: "audio-capture",
      }[error?.name];
      this.onerror?.({ error: code ?? "audio-capture" });
      this.finish();
    });
  }

  async openMicrophone() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await this.context.audioWorklet.addModule(
      `${import.meta.env.BASE_URL}mic-capture-worklet.js`
    );
    if (this.stopped) return;
    const source = this.context.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(this.context, "mic-capture");
    capture.port.onmessage = ({ data }) => {
      this.segmenter.push(data);
      this.pump();
    };
    source.connect(capture);
  }

  // One transcription at a time: audio that arrives meanwhile simply becomes
  // part of the next, longer one, so a slow device lags but never piles up.
  async pump() {
    if (this.busy || this.stopped) return;
    const job = this.segmenter.next();
    if (!job) return;
    this.busy = true;
    try {
      const raw = await transcribe(job.audio, this.lang.split("-")[0]);
      if (this.stopped) return;
      const text = cleanTranscript(raw);
      if (text) this.onresult?.(makeResult(text, job.final));
    } catch (error) {
      if (this.stopped) return;
      console.error("On-device recognition failed:", error);
      this.onerror?.({ error: "local-engine" });
      this.finish();
      return;
    } finally {
      this.busy = false;
    }
    this.pump();
  }

  teardown() {
    this.stopped = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.context?.close().catch(() => {});
    this.stream = null;
    this.context = null;
  }

  finish() {
    if (this.stopped) return;
    this.teardown();
    this.onend?.();
  }

  stop() {
    this.finish();
  }

  abort() {
    this.finish();
  }
}
