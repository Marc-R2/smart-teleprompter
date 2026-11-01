import { useEffect, useState, useSyncExternalStore } from "react";
import { formatDuration } from "../lib/sessionStats";

const CORNER_STYLES = {
  "top-left": { top: 84, left: 12 },
  "top-right": { top: 84, right: 12 },
  "bottom-left": { bottom: 12, left: 12 },
  "bottom-right": { bottom: 12, right: 12 },
};

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// Redraws on its own, so a clock tick or a new word never re-renders the app.
export default function SessionHud({
  stats,
  corner,
  showTranscript,
  getProgress,
  engineLabel,
  mirrored,
}) {
  useSyncExternalStore(stats.subscribe, stats.getVersion);
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const { remainingWords, totalWords, readWords, skippedWords, percent } =
    getProgress();
  const tempo = stats.wordsPerMinute();
  const heard = stats.transcript();

  return (
    <div
      aria-label="Session stats"
      style={{
        position: "fixed",
        ...(CORNER_STYLES[corner] || CORNER_STYLES["bottom-left"]),
        zIndex: 1100,
        width: 260,
        maxWidth: "calc(100vw - 24px)",
        boxSizing: "border-box",
        padding: "8px 12px",
        borderRadius: 10,
        background: "rgba(20, 20, 20, 0.82)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        color: "white",
        pointerEvents: "none",
        transform: mirrored ? "scaleX(-1)" : undefined,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "6px 10px",
        }}
      >
        <Stat label="Elapsed" value={formatDuration(stats.elapsedMs())} />
        <Stat
          label="Remaining"
          value={tempo ? `~${formatDuration((remainingWords / tempo) * 60000)}` : "–"}
        />
        <Stat label="Tempo" value={tempo ? `${tempo} wpm` : "–"} />
        <Stat label="Progress" value={`${percent}%`} />
        <Stat label="Read" value={`${readWords}/${totalWords}`} />
        <Stat label="Skipped" value={skippedWords} />
      </div>
      <div style={{ fontSize: 10, opacity: 0.5, marginTop: 6 }}>{engineLabel}</div>
      {showTranscript && (
        <div
          aria-live="off"
          style={{
            marginTop: 6,
            paddingTop: 6,
            minHeight: 36,
            borderTop: "1px solid rgba(255, 255, 255, 0.12)",
            fontSize: 13,
            lineHeight: 1.35,
          }}
        >
          <span style={{ opacity: 0.9 }}>{heard.final} </span>
          <span style={{ opacity: 0.55, fontStyle: "italic" }}>{heard.interim}</span>
          {!heard.final && !heard.interim && (
            <span style={{ opacity: 0.4 }}>Recognized speech appears here</span>
          )}
        </div>
      )}
    </div>
  );
}
