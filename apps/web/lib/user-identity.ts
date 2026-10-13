type PublicIdentity = {
  name?: string | null;
  username?: string | null;
};

export function resolveUserIdentity(user: PublicIdentity | null | undefined) {
  if (!user) return { label: "Unavailable account", avatarName: null };

  const displayName = user.name?.trim() || user.username?.trim();
  return displayName
    ? { label: displayName, avatarName: displayName }
    : { label: "Workspace member", avatarName: null };
}
