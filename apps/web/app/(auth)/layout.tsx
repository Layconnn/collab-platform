import type { ReactNode } from "react";

import { DataProviders } from "@/app/data-providers";
import { PublicThemeControl } from "@/components/theme/PublicThemeControl";

export default function AuthPagesLayout({ children }: { children: ReactNode }) {
  return <><DataProviders>{children}</DataProviders><PublicThemeControl /></>;
}
