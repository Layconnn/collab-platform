import type { Metadata } from "next";

import { EmailChangeSettings } from "@/components/settings/EmailChangeSettings";

export const metadata: Metadata = { title: "Change your email · Settings · Commons" };

export default function Page() {
  return <EmailChangeSettings />;
}
