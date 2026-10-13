"use client";

import { Textarea as ChakraTextarea } from "@chakra-ui/react/textarea";
import type { TextareaProps } from "@chakra-ui/react/textarea";

export function Textarea(props: TextareaProps) {
  return (
    <ChakraTextarea
      borderColor="controlBorder"
      bg="surface"
      color="textPrimary"
      _placeholder={{ color: "textMuted" }}
      _hover={{ borderColor: "textMuted" }}
      _focusVisible={{ borderColor: "focusRing", boxShadow: "0 0 0 1px var(--focus-ring)" }}
      {...props}
    />
  );
}
