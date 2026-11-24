import type { Metadata } from "next";

import { EmailSettings } from "@/components/settings/EmailSettings";

export const metadata: Metadata = { title: "Email settings · Commons" };

export default function Page() {
  return <EmailSettings />;
}
