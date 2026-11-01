// Night tints are multiplied over the whole page. Red and amber light disturb
// other people and dark-adapted eyes the least.
export const NIGHT_TINTS = {
  amber: { label: "Amber", rgb: [255, 170, 70] },
  red: { label: "Red", rgb: [255, 70, 50] },
  neutral: { label: "Gray", rgb: [255, 255, 255] },
};

const TABS = [
  {
    id: "text",
    label: "Text",
    keys: ["fontSize", "lineHeight", "paragraphSpacingPx", "sidePaddingVw", "textAlignStyle", "centerPaddingVh"],
  },
  {
    id: "look",
    label: "Look",
    keys: ["bgColor", "textColor", "highlightColor", "textOpacity", "paragraphHighlightOpacity", "uiOpacity"],
  },
  {
    // The language and the engine are not reset here: they are a deliberate
    // choice, and the engine involves a download the user agreed to.
    id: "tracking",
    label: "Tracking",
    keys: ["smartMode", "lookaheadWindow", "skipCoHostLines", "speakBrackets", "scrollSpeed"],
  },
  {
    id: "night",
    label: "Night",
    keys: ["nightMode", "nightBrightness", "nightFocusLines", "nightTint"],
  },
  {
    id: "camera",
    label: "Camera",
    keys: ["mirrorX", "showAim", "aimStyle", "aimColor", "aimOpacity", "aimOffsetX", "aimOffsetY", "showListeningIndicator"],
  },
  {
    id: "stats",
    label: "Stats",
    keys: ["showStats", "statsCorner", "showTranscript"],
  },
];

const AIM_COLORS = [
  ["#ffeb3b", "Yellow"],
  ["#2196f3", "Blue"],
  ["#f44336", "Red"],
  ["#4caf50", "Green"],
  ["#ffffff", "White"],
];

const percent = (value) => `${Math.round(value * 100)}%`;

function Hint({ children }) {
  return <p className="tp-set-hint">{children}</p>;
}

function Slider({ label, value, min, max, step = 1, format = String, onChange, hint, onDragChange }) {
  return (
    <div className="tp-set-row">
      <label className="tp-set-slider">
        <span className="tp-set-label">
          <span>{label}</span>
          <span className="tp-set-value">{format(value)}</span>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerDown={onDragChange && (() => onDragChange(true))}
          onPointerUp={onDragChange && (() => onDragChange(false))}
          onBlur={onDragChange && (() => onDragChange(false))}
        />
      </label>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <div className="tp-set-row">
      <label className="tp-set-toggle">
        <span>{label}</span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

function Choice({ label, value, options, onChange, hint, columns }) {
  return (
    <div className="tp-set-row" role="group" aria-label={label}>
      <div className="tp-set-label">
        <span>{label}</span>
      </div>
      <div
        className="tp-set-choice"
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, 1fr)` }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            aria-pressed={value === optionValue}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="tp-set-row tp-set-toggle">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Heading({ children }) {
  return <h3 className="tp-set-heading">{children}</h3>;
}

export default function SettingsPanel({
  tab,
  onTabChange,
  values: v,
  set,
  languages,
  autoScrollWpm,
  hasStoredModel,
  onChooseLocalEngine,
  onRemoveLocalEngine,
  onShowCenterLine,
  onResetSection,
  onResetAll,
}) {
  const current = TABS.find((candidate) => candidate.id === tab) ?? TABS[0];

  return (
    <div className="tp-settings">
      <div className="tp-set-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={current.id === id}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={current.label}>
        {current.id === "text" && (
          <>
            <Slider label="Font size" value={v.fontSize} min={16} max={120} format={(x) => `${x} px`} onChange={set.fontSize} />
            <Slider label="Line height" value={v.lineHeight} min={1} max={3} step={0.1} format={(x) => x.toFixed(1)} onChange={set.lineHeight} />
            <Slider label="Line spacing" value={v.paragraphSpacingPx} min={0} max={40} format={(x) => `${x} px`} onChange={set.paragraphSpacingPx} />
            <Slider label="Side margins" value={v.sidePaddingVw} min={0} max={40} format={(x) => `${x}%`} onChange={set.sidePaddingVw} />
            <Choice
              label="Alignment"
              value={v.textAlignStyle}
              options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]}
              onChange={set.textAlignStyle}
            />
            <Slider
              label="Reading position"
              value={v.centerPaddingVh}
              min={20}
              max={60}
              format={(x) => `${x}% from top`}
              onChange={set.centerPaddingVh}
              onDragChange={onShowCenterLine}
              hint="Where the current line stays on screen. A red line shows it while you drag."
            />
          </>
        )}

        {current.id === "look" && (
          <>
            <ColorField label="Background" value={v.bgColor} onChange={set.bgColor} />
            <ColorField label="Text" value={v.textColor} onChange={set.textColor} />
            <ColorField label="Highlight" value={v.highlightColor} onChange={set.highlightColor} />
            <Slider label="Text opacity" value={v.textOpacity} min={0.2} max={1} step={0.05} format={percent} onChange={set.textOpacity} />
            <Slider label="Current line background" value={v.paragraphHighlightOpacity} min={0} max={0.6} step={0.02} format={percent} onChange={set.paragraphHighlightOpacity} />
            <Slider label="Toolbar button opacity" value={v.uiOpacity} min={0.2} max={1} step={0.05} format={percent} onChange={set.uiOpacity} />
            {v.nightMode && <Hint>Night mode is on and overrides the colors above.</Hint>}
          </>
        )}

        {current.id === "tracking" && (
          <>
            <Heading>Voice</Heading>
            <label className="tp-set-row tp-set-toggle">
              <span>Language</span>
              <select value={v.language} onChange={(event) => set.language(event.target.value)}>
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="tp-set-row" role="group" aria-label="Speech recognition">
              <div className="tp-set-label">
                <span>Speech recognition</span>
              </div>
              <div className="tp-set-choice" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <button type="button" aria-pressed={v.recognitionEngine === "cloud"} onClick={() => set.recognitionEngine("cloud")}>
                  Cloud (default)
                </button>
                <button type="button" aria-pressed={v.recognitionEngine === "local"} onClick={onChooseLocalEngine}>
                  On device (experimental)
                </button>
              </div>
              <Hint>
                Cloud uses your browser's speech service. On device keeps your voice
                on this device and needs a one-time model download.
              </Hint>
              {hasStoredModel && (
                <button type="button" className="tp-set-danger" onClick={onRemoveLocalEngine}>
                  Delete the downloaded model and use cloud
                </button>
              )}
            </div>
            <Choice
              label="Tracking mode (T)"
              value={v.smartMode ? "smart" : "classic"}
              options={[["smart", "Smart"], ["classic", "Classic"]]}
              onChange={(mode) => set.smartMode(mode === "smart")}
              hint={
                v.smartMode
                  ? "Finds your place anywhere in the script, so you can rephrase, skip or go back."
                  : "Follows word by word and only moves forward."
              }
            />
            {!v.smartMode && (
              <Slider
                label="Lookahead"
                value={v.lookaheadWindow}
                min={1}
                max={40}
                format={(x) => `${x} words`}
                onChange={set.lookaheadWindow}
                hint="How far ahead classic tracking searches. Increase it if tracking feels slow."
              />
            )}

            <Heading>What gets tracked</Heading>
            <Toggle
              label="Skip text in brackets"
              checked={!v.speakBrackets}
              onChange={(skip) => set.speakBrackets(!skip)}
              hint="Text in (round) or [square] brackets stays visible as a note you don't read aloud."
            />
            <Toggle
              label="Skip co-host parts"
              checked={v.skipCoHostLines}
              onChange={set.skipCoHostLines}
              hint="Quotes and lines starting with >> or @Name: appear dimmed and tracking jumps over them."
            />

            <Heading>Auto-scroll</Heading>
            <Slider
              label="Speed"
              value={Math.min(100, v.scrollSpeed)}
              min={1}
              max={100}
              format={(x) => `~${autoScrollWpm(x)} wpm`}
              onChange={set.scrollSpeed}
            />
          </>
        )}

        {current.id === "night" && (
          <>
            <Toggle label="Night mode (N)" checked={v.nightMode} onChange={set.nightMode} />
            <Slider label="Brightness" value={v.nightBrightness} min={0.05} max={1} step={0.05} format={percent} onChange={set.nightBrightness} />
            <Slider
              label="Lit lines around your position"
              value={v.nightFocusLines}
              min={0}
              max={60}
              format={(x) => (x ? String(x) : "All")}
              onChange={set.nightFocusLines}
              hint="Fewer lit lines emit less light. All the way left keeps the whole text lit."
            />
            <Choice
              label="Tint"
              value={v.nightTint}
              options={Object.entries(NIGHT_TINTS).map(([key, tint]) => [key, tint.label])}
              onChange={set.nightTint}
              hint="Red disturbs others and your night vision the least. Gray is the easiest to read."
            />
            <Hint>
              Controls appear when you move the pointer. A browser cannot change the
              screen's backlight, so also turn down your display brightness and use
              fullscreen (F).
            </Hint>
          </>
        )}

        {current.id === "camera" && (
          <>
            <Toggle label="Mirror text (M)" checked={v.mirrorX} onChange={set.mirrorX} hint="For teleprompter hardware with a mirror." />
            <Toggle
              label="Show “Listening” indicator"
              checked={v.showListeningIndicator}
              onChange={set.showListeningIndicator}
              hint="Hide it if it distracts while recording."
            />
            <Heading>Aim marker</Heading>
            <Toggle label="Show aim marker" checked={v.showAim} onChange={set.showAim} hint="Helps you keep your eyes near the camera." />
            {v.showAim && (
              <>
                <Choice
                  label="Style"
                  value={v.aimStyle}
                  options={[["crosshair", "Crosshair"], ["dot", "Dot"], ["frame", "Frame"]]}
                  onChange={set.aimStyle}
                />
                <div className="tp-set-row" role="group" aria-label="Marker color">
                  <div className="tp-set-label">
                    <span>Color</span>
                  </div>
                  <div className="tp-set-swatches">
                    {AIM_COLORS.map(([color, name]) => (
                      <button
                        key={color}
                        type="button"
                        title={name}
                        aria-label={`Marker color: ${name}`}
                        aria-pressed={v.aimColor === color}
                        style={{ background: color }}
                        onClick={() => set.aimColor(color)}
                      />
                    ))}
                  </div>
                </div>
                <Slider label="Opacity" value={v.aimOpacity} min={0} max={1} step={0.05} format={percent} onChange={set.aimOpacity} />
                <Slider label="Horizontal offset" value={v.aimOffsetX} min={-400} max={400} format={(x) => `${x} px`} onChange={set.aimOffsetX} />
                <Slider label="Vertical offset" value={v.aimOffsetY} min={-300} max={300} format={(x) => `${x} px`} onChange={set.aimOffsetY} />
              </>
            )}
          </>
        )}

        {current.id === "stats" && (
          <>
            <Toggle
              label="Show stats display (I)"
              checked={v.showStats}
              onChange={set.showStats}
              hint="Time, tempo, progress, read and skipped words."
            />
            <Choice
              label="Corner"
              value={v.statsCorner}
              columns={2}
              options={[
                ["top-left", "↖ Top left"],
                ["top-right", "↗ Top right"],
                ["bottom-left", "↙ Bottom left"],
                ["bottom-right", "↘ Bottom right"],
              ]}
              onChange={set.statsCorner}
            />
            <Toggle
              label="Show the last recognized words"
              checked={v.showTranscript}
              onChange={set.showTranscript}
              hint="A live transcript of what the system understood."
            />
          </>
        )}
      </div>

      <div className="tp-set-footer">
        <button type="button" onClick={() => onResetSection(current.keys)}>
          Reset {current.label}
        </button>
        <button type="button" className="tp-set-danger" onClick={onResetAll}>
          Reset all settings
        </button>
      </div>
    </div>
  );
}
