"use client";

import { Popover, Portal } from "@chakra-ui/react";
import { Monitor, Moon, Sun } from "lucide-react";

import { ThemeModePicker } from "@/components/theme/ThemeModePicker";
import { useTheme } from "@/components/theme/ThemeProvider";

export function PublicThemeControl() {
  const { mode } = useTheme();
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  const label = mode[0].toUpperCase() + mode.slice(1);

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <Popover.Root positioning={{ placement: "top-end", strategy: "fixed", gutter: 8 }}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Appearance: ${label}`}
            title={`Appearance: ${label}`}
            className="group grid size-11 place-items-center rounded-full border border-border bg-surface text-text-primary shadow-md shadow-black/10 transition-transform hover:-translate-y-0.5 hover:bg-surface-hover active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none"
          >
            <Icon key={mode} size={19} aria-hidden="true" className="animate-[theme-icon-in_180ms_ease-out] transition-transform duration-200 group-hover:rotate-12 motion-reduce:animate-none motion-reduce:transition-none" />
          </button>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner className="z-50">
            <Popover.Content unstyled className="w-[min(17rem,calc(100vw-2rem))] rounded-md border border-border bg-surface text-text-primary shadow-lg shadow-black/15 outline-none data-[state=open]:animate-[thread-reveal_160ms_ease-out] motion-reduce:animate-none">
              <Popover.Title className="sr-only">Appearance</Popover.Title>
              <ThemeModePicker className="px-3 py-3" />
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    </div>
  );
}
