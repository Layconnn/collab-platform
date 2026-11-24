import type { Metadata } from "next";

import { SavedPage } from "@/components/saved/SavedPage";

export const metadata: Metadata = { title: "Saved · Commons" };

export default function Page() {
  return <SavedPage />;
}
