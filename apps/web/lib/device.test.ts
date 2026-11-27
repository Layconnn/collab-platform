import { describe, expect, it } from "vitest";

import { describeDevice } from "./device";

describe("describeDevice", () => {
  it("names common browsers and systems", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0")).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).toBe("Safari on macOS");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1")).toBe("Chrome on iPhone");
    expect(describeDevice("Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0")).toBe("Firefox on Android");
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 OPR/115.0")).toBe("Opera on Linux");
  });

  it("falls back for unknown or missing agents", () => {
    expect(describeDevice("curl/8.5.0")).toBe("Unknown device");
    expect(describeDevice(null)).toBe("Unknown device");
  });
});
