import { useState } from "react";
import { DEFAULT_LOCAL_MODEL, LOCAL_MODELS } from "../lib/localRecognizer";

const buttonStyle = {
  padding: "10px 20px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: 14,
  color: "white",
};

// Nothing is downloaded before the user has read this and confirmed it.
export default function LocalEngineDialog({ status, onConfirm, onCancel }) {
  const [model, setModel] = useState(DEFAULT_LOCAL_MODEL);
  const hasGpu = typeof navigator !== "undefined" && !!navigator.gpu;
  const loading = status.state === "loading";
  const percent = status.total
    ? Math.min(100, Math.round((status.loaded / status.total) * 100))
    : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.85)",
        zIndex: 22000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="On-device speech recognition"
        style={{
          boxSizing: "border-box",
          width: "calc(100vw - 40px)",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 28,
          borderRadius: 16,
          background: "#111",
          border: "2px solid rgba(255, 255, 255, 0.15)",
          color: "#ddd",
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        <h2 style={{ color: "white", fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
          On-device speech recognition
        </h2>
        <div style={{ color: "#ffb74d", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
          EXPERIMENTAL
        </div>
        <ul style={{ margin: "0 0 14px", paddingLeft: 18, listStyle: "disc" }}>
          <li>
            Your voice is processed on this device and works offline. Cloud
            recognition stays the default and is usually faster and more accurate.
          </li>
          <li>
            A speech model (Whisper) from huggingface.co and its runtime from
            cdn.jsdelivr.net are downloaded once and stored in this browser.
            Those services see the download like any web request, but never your
            voice.
          </li>
          <li>
            Expect a delay of a second or more, and higher battery use and
            device heat. On older devices it may be too slow to follow you.
          </li>
          <li>
            {hasGpu
              ? "This browser offers WebGPU, which is the fast path if your graphics hardware supports it."
              : "This browser has no WebGPU, so recognition runs on the processor and will be slow."}
          </li>
        </ul>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {Object.entries(LOCAL_MODELS).map(([id, info]) => (
            <button
              key={id}
              type="button"
              disabled={loading}
              aria-pressed={model === id}
              onClick={() => setModel(id)}
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 8,
                textAlign: "left",
                cursor: loading ? "default" : "pointer",
                background: model === id ? "#263238" : "transparent",
                border: `1px solid ${model === id ? "white" : "#555"}`,
                color: "white",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {info.label} · ~{hasGpu ? info.downloadMb.webgpu : info.downloadMb.wasm} MB
              </div>
              <div style={{ fontSize: 12, color: "#aaa" }}>{info.description}</div>
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ marginBottom: 16 }} role="status">
            <div style={{ height: 8, borderRadius: 4, background: "#333", overflow: "hidden" }}>
              <div
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  background: "#66bb6a",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
              {percent >= 100
                ? "Starting the model…"
                : `Downloading… ${percent}%`}
            </div>
          </div>
        )}
        {status.state === "error" && (
          <div role="alert" style={{ color: "#ef5350", marginBottom: 16 }}>
            {status.message} Cloud recognition stays active.
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ ...buttonStyle, background: "#333", border: "1px solid #555" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onConfirm(model)}
            style={{
              ...buttonStyle,
              background: "#2e7d32",
              border: "none",
              opacity: loading ? 0.5 : 1,
            }}
          >
            Download and activate
          </button>
        </div>
      </div>
    </div>
  );
}
