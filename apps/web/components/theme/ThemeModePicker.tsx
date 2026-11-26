"use client";

import { useId } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme/ThemeProvider";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeModePicker({ className = "" }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const name = useId();

  return (
    <fieldset className={className}>
      <legend className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-muted">Appearance</legend>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-[9px] bg-surface-active p-[3px]">
        {options.map(({ value, label, icon: Icon }) => (
          <label key={value} className={`flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-[7px] px-1 text-xs font-medium transition-colors focus-within:outline-2 focus-within:outline-focus-ring motion-reduce:transition-none ${mode === value ? "bg-surface text-text-primary shadow-[0_1px_2px_rgba(21,32,26,0.12)]" : "text-text-secondary hover:text-text-primary"}`}>
            <input type="radio" name={name} value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
            <Icon size={14} aria-hidden="true" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
