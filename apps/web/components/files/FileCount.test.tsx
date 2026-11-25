import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { FileCount } from "./FileCount";

describe("FileCount", () => {
  afterEach(() => cleanup());

  it("shows a count, singular or plural, and nothing for none", () => {
    expect(render(<FileCount count={1} />).container.textContent).toBe("1 file");
    cleanup();
    expect(render(<FileCount count={3} />).container.textContent).toBe("3 files");
    cleanup();
    expect(render(<FileCount count={0} />).container.innerHTML).toBe("");
  });
});
