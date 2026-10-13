"use client";

import { Input as ChakraInput } from "@chakra-ui/react/input";
import type { InputProps } from "@chakra-ui/react/input";

export function Input(props: InputProps) {
  return (
    <ChakraInput
      borderColor="border"
      bg="surface"
      color="textPrimary"
      _placeholder={{ color: "textMuted" }}
      _hover={{ borderColor: "textMuted" }}
      _focusVisible={{ borderColor: "focusRing", boxShadow: "0 0 0 1px var(--focus-ring)" }}
      {...props}
    />
  );
}
