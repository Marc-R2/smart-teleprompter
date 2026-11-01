import { Component, lazy, Suspense } from "react";

// The rich text editor is by far the largest dependency and only needed while
// editing, so it loads separately. If it cannot load (offline before it was
// ever cached), a plain Markdown textarea keeps the script editable.
const loadEditor = () => import("./MarkdownEditor");
const MarkdownEditor = lazy(loadEditor);

// Fetch it ahead of time so the service worker has it for offline use.
export const preloadEditor = () => loadEditor().catch(() => {});

function PlainEditor({ value, onChange, minHeight }) {
  return (
    <textarea
      className="tp-editor-textarea"
      aria-label="Markdown source"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{ minHeight }}
    />
  );
}

class FallbackOnError extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function ScriptEditor(props) {
  const plain = <PlainEditor {...props} />;
  return (
    <FallbackOnError fallback={plain}>
      <Suspense fallback={plain}>
        <MarkdownEditor {...props} />
      </Suspense>
    </FallbackOnError>
  );
}
