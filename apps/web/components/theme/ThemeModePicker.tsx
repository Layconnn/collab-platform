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
      <legend className="text-xs font-semibold text-text-secondary">Appearance</legend>
      <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-surface-subtle p-1">
        {options.map(({ value, label, icon: Icon }) => (
          <label key={value} className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-sm px-1 text-xs font-medium transition-colors focus-within:outline-2 focus-within:outline-focus-ring motion-reduce:transition-none ${mode === value ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:bg-surface-hover"}`}>
            <input type="radio" name={name} value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
            <Icon size={14} aria-hidden="true" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
