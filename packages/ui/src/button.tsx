"use client";

import { Button as ChakraButton } from "@chakra-ui/react/button";
import type { ButtonProps } from "@chakra-ui/react/button";

export function Button(props: ButtonProps) {
  return <ChakraButton colorPalette="brand" {...props} />;
}
