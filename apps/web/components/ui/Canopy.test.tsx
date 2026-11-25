import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AvatarStack } from "./AvatarStack";
import { Button, ButtonLink, buttonClasses } from "./Button";
import { Card, ContextPanel, CountBadge, Kbd, LiveDot, SectionLabel, StatusPill, TableFrame } from "./Canopy";
import { PageIntro } from "./PageIntro";
import { SegmentedControl } from "./SegmentedControl";

describe("Canopy primitives", () => {
  afterEach(() => cleanup());

  it("buttons: real buttons and links, typed as button by default, with variants", () => {
    const onClick = vi.fn();
    render(<><Button variant="primary" onClick={onClick}>Approve</Button><ButtonLink href="/workspace" variant="ghost">Home</ButtonLink></>);
    const button = screen.getByRole("button", { name: "Approve" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("bg-brand-action");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/workspace");
    expect(buttonClasses({ variant: "danger", size: "sm" })).toContain("bg-danger-action");
  });

  it("status pills, badges and labels use the Canopy tokens and read well", () => {
    render(<>
      <StatusPill tone="decided">Decided</StatusPill>
      <CountBadge count={3} label="3 unread" />
      <CountBadge count={0} label="none" />
      <CountBadge count={140} label="140 unread" />
      <SectionLabel id="s">Needs you</SectionLabel>
      <Kbd>Ctrl K</Kbd>
      <LiveDot />
    </>);
    expect(screen.getByText("Decided").className).toContain("bg-status-decided");
    expect(screen.getByLabelText("3 unread").textContent).toBe("3");
    expect(screen.queryByLabelText("none")).toBeNull();
    expect(screen.getByLabelText("140 unread").textContent).toBe("99+");
    expect(screen.getByRole("heading", { level: 2, name: "Needs you" }).className).toContain("type-canopy-label");
  });

  it("the page header: mono label, serif title as the page heading, a meta line and actions", () => {
    render(<PageIntro eyebrow="Your briefing" title="Good afternoon, Maya" meta={<span>3 things need you</span>} actions={<Button>New</Button>} />);
    const heading = screen.getByRole("heading", { level: 1, name: "Good afternoon, Maya" });
    expect(heading.className).toContain("type-canopy-title");
    expect(screen.getByText("Your briefing")).toBeTruthy();
    expect(screen.getByText("3 things need you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
  });

  it("segmented control: one pressed option, announced as a group", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Filter" value="all" onChange={onChange} options={[{ value: "all", label: "All", count: 3 }, { value: "reviews", label: "Reviews" }]} />);
    expect(screen.getByRole("group", { name: "Filter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All 3" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Reviews" }));
    expect(onChange).toHaveBeenCalledWith("reviews");
  });

  it("avatar stacks name everyone once and count the rest", () => {
    render(<AvatarStack names={["Sam Adeyemi", "Lee Chen", "Maya Okafor"]} max={2} />);
    expect(screen.getByRole("img", { name: "Sam Adeyemi, Lee Chen, Maya Okafor" }).textContent).toContain("+1");
  });

  it("cards, context panels and table frames are labelled surfaces", () => {
    render(<>
      <Card lift aria-label="Pulse">x</Card>
      <ContextPanel label="About this discussion">y</ContextPanel>
      <TableFrame label="Decisions"><table><tbody><tr><td>z</td></tr></tbody></table></TableFrame>
    </>);
    expect(screen.getByRole("region", { name: "Pulse" }).className).toContain("canopy-lift");
    expect(screen.getByRole("complementary", { name: "About this discussion" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Decisions" }).getAttribute("tabindex")).toBe("0");
  });
});
