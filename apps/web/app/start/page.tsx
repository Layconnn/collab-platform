import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAuthenticatedUser } from "../../server/middleware/auth";
import { preferencesService } from "../../server/services/preferences.service";

export const dynamic = "force-dynamic";

// Where Commons opens after signing in (settings PRD, FR-15): Home, the
// default workspace, or the last workspace visited.
export default async function StartPage() {
  const user = await resolveAuthenticatedUser(await headers());
  redirect(user ? await preferencesService.startPath(user.id) : "/login");
}
