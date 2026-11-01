// Live numbers for the stats display. Kept outside React state: results arrive
// several times per second, and only the small display needs to redraw.

const TEMPO_WINDOW_MS = 30000;
const MIN_TEMPO_SPAN_MS = 5000;
const TRANSCRIPT_WORDS = 14;

export function createSessionStats(now = () => performance.now()) {
  let version = 0;
  const listeners = new Set();
  let elapsedBefore = 0;
  let runningSince = null;
  let progress = [];
  let heardFinal = [];
  let heardInterim = "";

  const changed = () => {
    version += 1;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => version,

    setRunning(running) {
      if (running && runningSince === null) {
        runningSince = now();
      } else if (!running && runningSince !== null) {
        elapsedBefore += now() - runningSince;
        runningSince = null;
        // A pause must not count against the tempo.
        progress = [];
      } else {
        return;
      }
      changed();
    },

    reset() {
      elapsedBefore = 0;
      runningSince = runningSince === null ? null : now();
      progress = [];
      heardFinal = [];
      heardInterim = "";
      changed();
    },

    recordProgress(words) {
      progress.push({ at: now(), words });
      changed();
    },

    addHeard(finalText, interimText) {
      if (finalText) {
        heardFinal = [...heardFinal, ...finalText.trim().split(/\s+/)].slice(
          -TRANSCRIPT_WORDS
        );
      }
      heardInterim = interimText;
      changed();
    },

    elapsedMs() {
      return elapsedBefore + (runningSince === null ? 0 : now() - runningSince);
    },

    // Words per minute over the last 30 seconds, or null if too little is known.
    wordsPerMinute() {
      const time = now();
      progress = progress.filter(
        (sample) => time - sample.at <= TEMPO_WINDOW_MS
      );
      if (!progress.length) return null;
      const span = time - progress[0].at;
      if (span < MIN_TEMPO_SPAN_MS) return null;
      const words = progress.reduce((sum, sample) => sum + sample.words, 0);
      return Math.round((words / span) * 60000);
    },

    transcript() {
      const interim = heardInterim.trim().split(/\s+/).filter(Boolean);
      const shown = interim.slice(-TRANSCRIPT_WORDS);
      const room = TRANSCRIPT_WORDS - shown.length;
      return {
        final: (room > 0 ? heardFinal.slice(-room) : []).join(" "),
        interim: shown.join(" "),
      };
    },
  };
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}:${seconds}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
}
