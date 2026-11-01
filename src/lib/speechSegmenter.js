// Whisper transcribes finished audio, not a live stream. This cuts the
// microphone signal into phrases: while one is being spoken it is transcribed
// repeatedly (interim results), and at a pause or length limit it is final.
// Quiet audio never reaches the model, where it would produce invented text.

const FRAME_SECONDS = 0.1;
const MIN_SPEECH_RMS = 0.008;

export function createSpeechSegmenter({
  sampleRate = 16000,
  maxSeconds = 8,
  silenceSeconds = 0.7,
  interimEverySeconds = 0.5,
  minSeconds = 0.4,
  prerollSeconds = 0.3,
  overlapSeconds = 0.25,
} = {}) {
  const frameLength = Math.round(sampleRate * FRAME_SECONDS);
  let samples = [];
  let length = 0;
  let pendingFrame = 0;
  let frameEnergy = 0;
  let noiseFloor = MIN_SPEECH_RMS / 3;
  let lastSpeechAt = -1;
  let lastEmittedLength = 0;

  const collect = () => {
    const audio = new Float32Array(length);
    let offset = 0;
    for (const chunk of samples) {
      audio.set(chunk, offset);
      offset += chunk.length;
    }
    return audio;
  };

  const keepTail = (count) => {
    const audio = collect();
    const tail = audio.slice(Math.max(0, audio.length - count));
    samples = [tail];
    length = tail.length;
    lastEmittedLength = 0;
    lastSpeechAt = -1;
  };

  return {
    push(chunk) {
      samples.push(chunk);
      for (let i = 0; i < chunk.length; i++) {
        frameEnergy += chunk[i] * chunk[i];
        pendingFrame += 1;
        if (pendingFrame === frameLength) {
          const rms = Math.sqrt(frameEnergy / frameLength);
          // Follows steady room noise, so a fan does not count as speech.
          if (rms > Math.max(MIN_SPEECH_RMS, noiseFloor * 3)) {
            lastSpeechAt = length + i + 1;
          } else {
            noiseFloor = noiseFloor * 0.95 + rms * 0.05;
          }
          pendingFrame = 0;
          frameEnergy = 0;
        }
      }
      length += chunk.length;
    },

    // Returns the next audio to transcribe, or null if there is nothing new.
    next() {
      if (lastSpeechAt < 0) {
        const preroll = Math.round(prerollSeconds * sampleRate);
        if (length > preroll * 2) {
          keepTail(preroll);
        }
        return null;
      }
      if (length < minSeconds * sampleRate) return null;

      const atLimit = length >= maxSeconds * sampleRate;
      const paused = length - lastSpeechAt >= silenceSeconds * sampleRate;
      if (atLimit || paused) {
        const audio = collect();
        keepTail(atLimit && !paused ? Math.round(overlapSeconds * sampleRate) : 0);
        return { audio, final: true };
      }
      if (length - lastEmittedLength < interimEverySeconds * sampleRate) {
        return null;
      }
      lastEmittedLength = length;
      return { audio: collect(), final: false };
    },
  };
}

// What Whisper adds on its own for non-speech: [Music], (applause), ♪ ...
export function cleanTranscript(text) {
  return String(text ?? "")
    .replace(/\[[^\]]*\]|\([^)]*\)|[♪♫*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
