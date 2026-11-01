import { afterEach, describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useWakeLock } from "../src/lib/useWakeLock";

function fakeWakeLock() {
  const sentinels = [];
  const request = vi.fn(async () => {
    const listeners = [];
    const sentinel = {
      addEventListener: (_type, listener) => listeners.push(listener),
      release: vi.fn(async () => listeners.forEach((listener) => listener())),
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
  return { request, sentinels };
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe("useWakeLock", () => {
  afterEach(() => {
    delete navigator.wakeLock;
  });

  it("holds the lock only while active", async () => {
    const { request, sentinels } = fakeWakeLock();
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: false },
    });
    expect(request).not.toHaveBeenCalled();
    rerender({ active: true });
    await settle();
    expect(request).toHaveBeenCalledWith("screen");
    rerender({ active: false });
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it("requests the lock again after the tab was hidden", async () => {
    const { request, sentinels } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await settle();
    await act(() => sentinels[0].release());
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does nothing without browser support", () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
