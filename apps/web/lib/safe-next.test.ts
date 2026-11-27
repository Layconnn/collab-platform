import { describe, expect, it } from "vitest";

import { safeNextPath, withNext } from "./safe-next";

describe("safeNextPath", () => {
  it("follows same-site paths only", () => {
    expect(safeNextPath("?next=%2Fjoin%2Fabc")).toBe("/join/abc");
    expect(safeNextPath("?next=%2F%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=https%3A%2F%2Fevil.example")).toBe("/start");
    expect(safeNextPath("?next=%2F%5Cevil.example")).toBe("/start");
    expect(safeNextPath("")).toBe("/start");
  });

  it("carries next to the other auth page", () => {
    expect(withNext("/register", "?next=%2Fjoin%2Fabc")).toBe("/register?next=%2Fjoin%2Fabc");
    expect(withNext("/login", "?next=%2F%2Fevil.example")).toBe("/login");
    expect(withNext("/login", "")).toBe("/login");
  });
});
