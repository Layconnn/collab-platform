import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";

// Canopy buttons (dashboard redesign PRD, FR-2). Primary is the forest (mint in
// dark) action, secondary a bordered surface, ghost a quiet text button, danger
// for destructive actions.
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const base = "inline-flex shrink-0 items-center justify-center gap-2 rounded-[9px] font-medium transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:pointer-events-none disabled:opacity-55";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-action text-on-brand-action hover:bg-brand-action-hover active:bg-brand-action-active",
  secondary: "border border-border bg-surface text-text-primary hover:bg-surface-hover",
  ghost: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  danger: "bg-danger-action text-on-danger-action hover:opacity-90",
};
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-xs",
  md: "min-h-9 px-3.5 text-[0.8125rem]",
};

export function buttonClasses({ variant = "secondary", size = "md", className = "" }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className = "", type = "button", children, ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClasses({ variant, size, className })} {...props}>{icon}{children}</button>;
});

export function ButtonLink({ variant = "secondary", size = "md", icon, className = "", children, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props}>{icon}{children}</Link>;
}
