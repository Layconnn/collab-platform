import type { Metadata } from "next";

import { ProfileSettings } from "@/components/settings/ProfileSettings";

export const metadata: Metadata = { title: "Profile · Settings · Commons" };

export default function Page() {
  return <ProfileSettings />;
}
