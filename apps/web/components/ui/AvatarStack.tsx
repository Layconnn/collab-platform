import { UserAvatar } from "@/components/common/UserAvatar";

// Overlapping avatars for the people on something (dashboard redesign PRD,
// FR-2), with a "+N" for the rest. The names are read out once, as a list.
export function AvatarStack({ names, max = 4, size = "size-[22px]" }: { names: Array<string | null>; max?: number; size?: string }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const label = names.filter(Boolean).join(", ");
  return (
    <span role="img" aria-label={label || `${names.length} people`} className="inline-flex items-center">
      {shown.map((name, index) => (
        <UserAvatar key={`${name}-${index}`} name={name} className={`${size} text-[9px] ring-2 ring-surface ${index ? "-ml-1" : ""}`} />
      ))}
      {rest > 0 ? <span aria-hidden="true" className={`-ml-1 grid ${size} place-items-center rounded-full bg-surface-active text-[9px] font-semibold text-text-secondary ring-2 ring-surface`}>+{rest}</span> : null}
    </span>
  );
}
