import type { AppIconName } from "@/components/common/AppIcon";

// Settings in the pattern of X (dashboard redesign PRD, FR-8). A category is
// listed only once it has at least one working setting; the settings PRD adds
// the rest (account details, sessions, data, workspaces).

export type SettingsCategory = {
  id: string;
  name: string;
  description: string;
  icon: AppIconName;
  href: string;
};

export type SettingEntry = {
  label: string;
  description: string;
  category: SettingsCategory["id"];
  href: string;
  keywords?: string;
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: "account", name: "Your account", description: "Your details and your password.", icon: "account", href: "/settings/account" },
  { id: "security", name: "Security", description: "Your sessions, the security log and your password.", icon: "security", href: "/settings/security" },
  { id: "notifications", name: "Notifications", description: "What reaches your Inbox, per workspace, and the daily digest.", icon: "inbox", href: "/settings/notifications" },
  { id: "workspaces", name: "Workspaces", description: "Where Commons opens and your default workspace.", icon: "workspaces", href: "/settings/workspaces" },
  { id: "appearance", name: "Appearance", description: "Theme, motion and density, on every device.", icon: "appearance", href: "/settings/appearance" },
];

// Every setting, for search: matched by label, description and keywords.
export const SETTING_ENTRIES: SettingEntry[] = [
  { label: "Account information", description: "Your name, username and email.", category: "account", href: "/settings/account", keywords: "profile name username email" },
  { label: "Display name", description: "The name teammates see on your posts.", category: "account", href: "/settings/account/profile", keywords: "profile name rename" },
  { label: "Username", description: "Change the name teammates mention you by.", category: "account", href: "/settings/account/profile", keywords: "profile handle mention rename at" },
  { label: "Sessions", description: "Where you're signed in; sign out a device.", category: "security", href: "/settings/security/sessions", keywords: "devices sign out logout signed in browser lost phone" },
  { label: "Security log", description: "Sign-ins and changes in the last 90 days.", category: "security", href: "/settings/security/log", keywords: "activity history audit login failed attempts" },
  { label: "Change your password", description: "Signs out your other devices.", category: "account", href: "/settings/account/password", keywords: "password security sign in" },
  { label: "What notifies you", description: "Turn mentions, reviews, replies and more on or off.", category: "notifications", href: "/settings/notifications/kinds", keywords: "notifications mute inbox bell mentions replies reviews discussions" },
  { label: "Workspace notifications", description: "Everything, only what involves you, or nothing.", category: "notifications", href: "/settings/notifications/workspaces", keywords: "notifications mute quiet workspace level" },
  { label: "Digest time", description: "The hour and time zone the digest arrives.", category: "notifications", href: "/settings/notifications/digest", keywords: "email digest time hour time zone schedule" },
  { label: "Daily digest", description: "Turn the daily email on or off and choose its workspaces.", category: "notifications", href: "/settings/notifications/digest", keywords: "email digest unsubscribe preview workspaces" },
  { label: "Theme", description: "Light, dark or system.", category: "appearance", href: "/settings/appearance", keywords: "dark mode light mode colour color appearance" },
  { label: "Reduce motion", description: "Turn off animations on every device.", category: "appearance", href: "/settings/appearance", keywords: "motion animation accessibility transitions" },
  { label: "Density", description: "Comfortable or compact.", category: "appearance", href: "/settings/appearance", keywords: "compact comfortable spacing size text" },
  { label: "Start page", description: "Where Commons opens when you sign in.", category: "workspaces", href: "/settings/workspaces", keywords: "open home landing first page sign in" },
  { label: "Default workspace", description: "The workspace that's yours by default.", category: "workspaces", href: "/settings/workspaces", keywords: "workspace default primary" },
];

export function categoryOf(id: string) {
  return SETTINGS_CATEGORIES.find((category) => category.id === id);
}

// Search across setting names (FR-8): every word has to appear somewhere in
// the setting's label, description, keywords or category name.
export function searchSettings(query: string): SettingEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SETTING_ENTRIES.filter((entry) => {
    const text = `${entry.label} ${entry.description} ${entry.keywords ?? ""} ${categoryOf(entry.category)?.name ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
