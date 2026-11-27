import {
  ShieldCheck,
  Bell,
  Building2,
  ChevronDown,
  House,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Users,
  X,
  type LucideIcon,
  Bookmark,
  Inbox,
  LayoutGrid,
  Scale,
  Settings,
  SunMoon,
  UserRound,
} from "lucide-react";

export type AppIconName =
  | "home"
  | "workspaces"
  | "discussions"
  | "decisions"
  | "members"
  | "plus"
  | "bell"
  | "menu"
  | "close"
  | "panel"
  | "panel-open"
  | "chevron"
  | "logout"
  | "search"
  | "saved"
  | "inbox"
  | "settings"
  | "account"
  | "appearance"
  | "overview"
  | "security";

const icons: Record<AppIconName, LucideIcon> = {
  home: House,
  workspaces: Building2,
  discussions: MessageSquare,
  decisions: Scale,
  members: Users,
  plus: Plus,
  bell: Bell,
  menu: Menu,
  close: X,
  panel: PanelLeftClose,
  "panel-open": PanelLeftOpen,
  chevron: ChevronDown,
  logout: LogOut,
  search: Search,
  saved: Bookmark,
  inbox: Inbox,
  settings: Settings,
  account: UserRound,
  appearance: SunMoon,
  overview: LayoutGrid,
  security: ShieldCheck,
};

export function AppIcon({ name, className = "size-4" }: { name: AppIconName; className?: string }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" className={className} strokeWidth={1.7} />;
}
