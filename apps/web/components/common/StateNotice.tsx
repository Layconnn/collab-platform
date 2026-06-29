"use client";

import { Alert, AlertDescription, AlertTitle, Spinner } from "@chakra-ui/react";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-600">
      <Spinner size="sm" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <Alert status="info" variant="subtle">
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  );
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <Alert status="error" variant="subtle">
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
    </Alert>
  );
}
