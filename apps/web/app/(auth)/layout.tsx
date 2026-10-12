import type { ReactNode } from "react";

import { PublicThemeControl } from "@/components/theme/PublicThemeControl";

export default function AuthPagesLayout({ children }: { children: ReactNode }) {
  return <>{children}<PublicThemeControl /></>;
}
