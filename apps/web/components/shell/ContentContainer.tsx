import type { ReactNode } from "react";

const widthClasses = {
  narrow: "max-w-3xl",
  standard: "max-w-6xl",
  wide: "max-w-[1440px]",
  full: "max-w-none",
} as const;

export function ContentContainer({
  children,
  width = "standard",
  className = "",
}: {
  children: ReactNode;
  width?: keyof typeof widthClasses;
  className?: string;
}) {
  return <div className={`mx-auto w-full min-w-0 ${widthClasses[width]} ${className}`}>{children}</div>;
}
