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
