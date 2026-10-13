import {
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
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

export type AppIconName =
  | "home"
  | "workspaces"
  | "discussions"
  | "members"
  | "plus"
  | "bell"
  | "menu"
  | "close"
  | "panel"
  | "panel-open"
  | "chevron"
  | "logout";

const icons: Record<AppIconName, LucideIcon> = {
  home: House,
  workspaces: Building2,
  discussions: MessageSquare,
  members: Users,
  plus: Plus,
  bell: Bell,
  menu: Menu,
  close: X,
  panel: PanelLeftClose,
  "panel-open": PanelLeftOpen,
  chevron: ChevronDown,
  logout: LogOut,
};

export function AppIcon({ name, className = "size-4" }: { name: AppIconName; className?: string }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" className={className} strokeWidth={1.7} />;
}
