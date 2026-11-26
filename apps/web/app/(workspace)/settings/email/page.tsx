import { redirect } from "next/navigation";

// Digest emails already sent link here; the digest now lives under
// Notifications (dashboard redesign, #176).
export default function Page() {
  redirect("/settings/notifications/digest");
}
