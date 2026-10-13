import type { CSSProperties } from "react";

type TextRevealProps = {
  as: "h1" | "h2";
  text: string;
  phrases?: string[];
  emphasisIndex?: number;
  id?: string;
  className?: string;
  variant?: "hero" | "quiet";
};

export function TextReveal({
  as: Heading,
  text,
  phrases = text.split(/\s+/),
  emphasisIndex,
  id,
  className = "",
  variant = "hero",
}: TextRevealProps) {
  return (
    <Heading
      id={id}
      className={`text-reveal text-reveal--${variant} ${className}`}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {phrases.map((phrase, index) => (
          <span key={`${phrase}-${index}`}>
            <span
              className={`text-reveal__phrase ${index === emphasisIndex ? "text-editorial-coral-on-dark" : ""}`}
              style={
                {
                  "--reveal-delay": `${index * (variant === "hero" ? 95 : 55)}ms`,
                } as CSSProperties
              }
            >
              {phrase}
            </span>
            {index < phrases.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </Heading>
  );
}
