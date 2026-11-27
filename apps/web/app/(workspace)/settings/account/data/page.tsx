import type { Metadata } from "next";

import { YourDataSettings } from "@/components/settings/YourDataSettings";

export const metadata: Metadata = { title: "Your data · Settings · Commons" };

export default function Page() {
  return <YourDataSettings />;
}
