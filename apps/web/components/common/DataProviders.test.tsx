import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { DataProviders } from "@/app/data-providers";
import { trpc } from "@/lib/trpc/api-client";

function ProviderProbe({ onClient }: { onClient: (client: QueryClient) => void }) {
  const client = useQueryClient();
  const utils = trpc.useUtils();
  useEffect(() => onClient(client));
  return <span>{utils.auth.me ? "Providers ready" : "Providers missing"}</span>;
}

describe("DataProviders", () => {
  afterEach(cleanup);

  it("supplies tRPC and retains one QueryClient across route-content rerenders", () => {
    const observedClients: QueryClient[] = [];
    const onClient = (client: QueryClient) => { observedClients.push(client); };
    const { rerender } = render(<DataProviders><ProviderProbe onClient={onClient} /></DataProviders>);
    expect(screen.getByText("Providers ready")).toBeTruthy();
    const firstClient = observedClients.at(-1);

    rerender(<DataProviders><div><ProviderProbe onClient={onClient} /></div></DataProviders>);
    expect(observedClients.at(-1)).toBe(firstClient);
  });
});
