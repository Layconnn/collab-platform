import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { invalidate: vi.fn() } } }),
    profile: {
      removePhoto: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      photoUpload: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      setPhoto: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));

import { UserAvatar } from "@/components/common/UserAvatar";
import { clampCrop, cropBounds, ProfilePhoto } from "./ProfilePhoto";

describe("crop maths", () => {
  const wide = { width: 1200, height: 600 };

  it("covers the 240 px window at zoom 1 and scales with zoom", () => {
    expect(cropBounds(wide, 1)).toEqual({ scale: 0.4, width: 480, height: 240 });
    expect(cropBounds(wide, 2).height).toBe(480);
  });

  it("never lets the image leave a gap in the window", () => {
    expect(clampCrop(wide, { zoom: 1, x: 50, y: 20 })).toEqual({ zoom: 1, x: 0, y: 0 });
    expect(clampCrop(wide, { zoom: 1, x: -900, y: -20 })).toEqual({ zoom: 1, x: -240, y: 0 });
    expect(clampCrop(wide, { zoom: 2, x: -100, y: -100 })).toEqual({ zoom: 2, x: -100, y: -100 });
  });
});

describe("ProfilePhoto", () => {
  afterEach(cleanup);

  it("refuses files that are not images or are too large", () => {
    render(<ProfilePhoto name="Maya Okafor" photo={null} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("alert").textContent).toBe("Choose a PNG, JPEG or WebP image.");
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(screen.getByRole("alert").textContent).toBe("Choose an image of 5 MB or less.");
  });

  it("offers to change or remove an existing photo", () => {
    render(<ProfilePhoto name="Maya Okafor" photo="avatars/cabcdefghijklmnopqrstuvw/0123456789abcdef0123456789abcdef.webp" />);
    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeTruthy();
  });
});

describe("UserAvatar", () => {
  afterEach(cleanup);
  const key = "avatars/cabcdefghijklmnopqrstuvw/0123456789abcdef0123456789abcdef.webp";

  it("shows the photo, and initials when it fails or is missing", () => {
    const { container, rerender } = render(<UserAvatar name="Maya Okafor" photo={key} />);
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/api/avatars/cabcdefghijklmnopqrstuvw/0123456789abcdef0123456789abcdef.webp");
    fireEvent.error(image);
    expect(container.textContent).toBe("MO");
    rerender(<UserAvatar name="Lee" photo={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("LE");
  });
});
