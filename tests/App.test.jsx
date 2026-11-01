import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SmartTeleprompter from "../src/App";
import { encodeShareHash } from "../src/lib/shareLink";

describe("SmartTeleprompter", () => {
  it("renders without crashing", () => {
    const { container } = render(<SmartTeleprompter />);
    expect(container.querySelector("div")).toBeInTheDocument();
  });

  it("renders the toolbar with control buttons", () => {
    render(<SmartTeleprompter />);
    expect(screen.getAllByLabelText("Microphone").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Auto Scroll").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Settings").length).toBeGreaterThan(0);
  });

  it("renders the default welcome text", () => {
    const { container } = render(<SmartTeleprompter />);
    expect(container.textContent).toContain("Welcome");
    expect(container.textContent).toContain("Smart");
    expect(container.textContent).toContain("Teleprompter");
  });
});

describe("Script rendering and controls", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
  });

  it("renders Markdown and leaves code blocks out of the spoken words", async () => {
    localStorage.setItem(
      "tp_settings_v1",
      JSON.stringify({ text: "# Title\n\n**spoken**\n\n```\nnot spoken\n```" })
    );
    const { container } = render(<SmartTeleprompter />);
    await waitFor(() => expect(container.textContent).toContain("not spoken"));
    const words = [...container.querySelectorAll('[id^="word-"]')];
    expect(words.map((word) => word.textContent.trim())).toEqual(["Title", "spoken"]);
    expect(words[1].style.fontWeight).toBe("700");
  });

  it("imports a script from a share link without a server", async () => {
    const alert = vi.fn();
    vi.stubGlobal("alert", alert);
    window.location.hash = await encodeShareHash({
      title: "Shared",
      text: "Text from a link",
      language: "de-DE",
    });
    const { container } = render(<SmartTeleprompter />);
    await waitFor(() =>
      expect(container.textContent).toContain("Text from a link")
    );
    const scripts = JSON.parse(localStorage.getItem("tp_scripts_v1"));
    expect(scripts[0].name).toBe("Shared");
    expect(window.location.hash).toBe("");
  });

  it("toggles night mode with N and leaves browser shortcuts alone", async () => {
    const { container } = render(<SmartTeleprompter />);
    fireEvent.keyDown(window, { key: "r", metaKey: true });
    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(container.querySelector(".tp-night")).toBeNull();
    fireEvent.keyDown(window, { key: "n" });
    await waitFor(() =>
      expect(container.querySelector(".tp-night")).not.toBeNull()
    );
  });
});

describe("Recognition engine and stats", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
  });

  it("defaults to cloud and downloads nothing before consent", async () => {
    const worker = vi.fn();
    vi.stubGlobal("Worker", worker);
    render(<SmartTeleprompter />);
    fireEvent.click(screen.getByLabelText("Settings"));
    fireEvent.click(await screen.findByRole("tab", { name: "Tracking" }));
    expect(screen.getByRole("button", { name: "Cloud (default)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByText("On device (experimental)"));
    expect(screen.getByRole("dialog")).toHaveTextContent("EXPERIMENTAL");
    expect(screen.getByRole("dialog")).toHaveTextContent("huggingface.co");
    expect(worker).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(worker).not.toHaveBeenCalled();
  });

  it("toggles the stats display with I", async () => {
    render(<SmartTeleprompter />);
    expect(screen.queryByLabelText("Session stats")).toBeNull();
    fireEvent.keyDown(window, { key: "i" });
    expect(await screen.findByLabelText("Session stats")).toHaveTextContent("Elapsed");
  });
});

describe("Settings panel", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
  });

  const openTab = async (name) => {
    fireEvent.click(screen.getByLabelText("Settings"));
    fireEvent.click(await screen.findByRole("tab", { name }));
  };

  it("offers far more than nine lit lines in night mode", async () => {
    render(<SmartTeleprompter />);
    await openTab("Night");
    const slider = screen.getByLabelText(/Lit lines/);
    expect(Number(slider.max)).toBeGreaterThanOrEqual(50);
    fireEvent.change(slider, { target: { value: "40" } });
    expect(slider.value).toBe("40");
  });

  it("only shows the lookahead for classic tracking", async () => {
    render(<SmartTeleprompter />);
    await openTab("Tracking");
    expect(screen.queryByLabelText(/Lookahead/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Classic" }));
    expect(screen.getByLabelText(/Lookahead/)).toBeInTheDocument();
  });

  it("resets one section and leaves the others alone", async () => {
    render(<SmartTeleprompter />);
    await openTab("Text");
    fireEvent.change(screen.getByLabelText(/Font size/), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("tab", { name: "Night" }));
    fireEvent.change(screen.getByLabelText(/Lit lines/), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Night" }));
    expect(screen.getByLabelText(/Lit lines/).value).toBe("3");
    fireEvent.click(screen.getByRole("tab", { name: "Text" }));
    expect(screen.getByLabelText(/Font size/).value).toBe("70");
  });

  it("stops tracking text in brackets, and resumes when asked", async () => {
    localStorage.setItem("tp_settings_v1", JSON.stringify({ text: "say (smile) this" }));
    const { container } = render(<SmartTeleprompter />);
    const spoken = () =>
      [...container.querySelectorAll('[id^="word-"]')].map((w) => w.textContent.trim());
    await waitFor(() => expect(spoken()).toEqual(["say", "this"]));
    expect(container.textContent).toContain("(smile)");
    await openTab("Tracking");
    fireEvent.click(screen.getByRole("switch", { name: /brackets/ }));
    await waitFor(() => expect(spoken()).toEqual(["say", "(smile)", "this"]));
  });
});
