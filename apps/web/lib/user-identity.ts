type PublicIdentity = {
  name?: string | null;
  username?: string | null;
  avatarKey?: string | null;
};

export function resolveUserIdentity(user: PublicIdentity | null | undefined) {
  if (!user) return { label: "Unavailable account", avatarName: null, photo: null };

  const displayName = user.name?.trim() || user.username?.trim();
  return displayName
    ? { label: displayName, avatarName: displayName, photo: user.avatarKey ?? null }
    : { label: "Workspace member", avatarName: null, photo: user.avatarKey ?? null };
}
