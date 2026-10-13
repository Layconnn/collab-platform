export function workspaceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : (words[0]?.slice(0, 2) ?? "W").toUpperCase();
}

export function suggestWorkspaceSlug(name: string): string {
  return name.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
