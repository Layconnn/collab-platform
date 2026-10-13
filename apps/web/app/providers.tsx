"use client";

import { ChakraProvider } from "@chakra-ui/react";

import { uiSystem } from "@/lib/ui-system";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={uiSystem}><ThemeProvider>{children}</ThemeProvider></ChakraProvider>
  );
}
