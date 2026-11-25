"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Puts a page's actions in the glass top bar (dashboard redesign PRD, FR-7),
// for example "Propose decision" on a discussion. The shell owns the slot and
// shares it through context, so a page rendered with the shell still finds it.
const SlotContext = createContext<HTMLElement | null>(null);

export function useTopBarSlot() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return { slot, slotRef: setSlot };
}

export function TopBarSlotProvider({ slot, children }: { slot: HTMLElement | null; children: ReactNode }) {
  return <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>;
}

export function TopBarActions({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext);
  return slot ? createPortal(children, slot) : null;
}
