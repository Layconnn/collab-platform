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
  { id: "notifications", name: "Notifications", description: "The daily digest email and which workspaces it covers.", icon: "inbox", href: "/settings/notifications" },
  { id: "appearance", name: "Appearance", description: "Light, dark, or matching your device.", icon: "appearance", href: "/settings/appearance" },
];

// Every setting, for search: matched by label, description and keywords.
export const SETTING_ENTRIES: SettingEntry[] = [
  { label: "Account information", description: "Your name, username and email.", category: "account", href: "/settings/account", keywords: "profile name username email" },
  { label: "Display name", description: "The name teammates see on your posts.", category: "account", href: "/settings/account/profile", keywords: "profile name rename" },
  { label: "Username", description: "Change the name teammates mention you by.", category: "account", href: "/settings/account/profile", keywords: "profile handle mention rename at" },
  { label: "Change your password", description: "Signs out your other devices.", category: "account", href: "/settings/account/password", keywords: "password security sign in" },
  { label: "Daily digest", description: "Turn the daily email on or off and choose its workspaces.", category: "notifications", href: "/settings/notifications/digest", keywords: "email digest unsubscribe preview workspaces" },
  { label: "Theme", description: "Light, dark or system.", category: "appearance", href: "/settings/appearance", keywords: "dark mode light mode colour color appearance" },
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
