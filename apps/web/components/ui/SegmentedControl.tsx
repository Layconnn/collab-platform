"use client";

// A row of mutually exclusive filters (dashboard redesign PRD, FR-2), for
// example "All, Reviews, Mentions". Each option is a real button with
// aria-pressed, inside a labelled group.
export function SegmentedControl<T extends string>({ label, options, value, onChange, className = "" }: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`inline-flex flex-wrap gap-1 rounded-[9px] bg-surface-active p-[3px] ${className}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`min-h-7 rounded-[7px] px-2.5 text-xs transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-focus-ring ${selected ? "bg-surface font-medium text-text-primary shadow-[0_1px_2px_rgba(21,32,26,0.12)]" : "text-text-secondary hover:text-text-primary"}`}
          >
            {option.label}{option.count !== undefined ? <span className="ml-1.5 text-text-muted">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
