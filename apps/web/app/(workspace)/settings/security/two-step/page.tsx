import type { Metadata } from "next";

import { TwoStepSettings } from "@/components/settings/TwoStepSettings";

export const metadata: Metadata = { title: "Two-step sign-in · Settings · Commons" };

export default function Page() {
  return <TwoStepSettings />;
}
