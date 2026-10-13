import { Box } from "@chakra-ui/react/box";
import type { ReactNode } from "react";

export function Card({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Box
      as="section"
      borderWidth="1px"
      borderColor="borderSubtle"
      borderRadius="md"
      bg="surface"
      p="4"
      className={className}
    >
      {title ? <Box as="h2" fontSize="sm" fontWeight="semibold" mb="3">{title}</Box> : null}
      {children}
    </Box>
  );
}
