import type { Metadata } from "next";

import { SessionsSettings } from "@/components/settings/SecuritySettings";

export const metadata: Metadata = { title: "Sessions · Settings · Commons" };

export default function Page() {
  return <SessionsSettings />;
}
