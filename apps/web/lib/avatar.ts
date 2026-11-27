// Where a profile photo is served (settings PRD, FR-3): the signed-in-only
// route that redirects to storage. The key is avatars/<userId>/<random>.webp.
export function avatarUrl(key: string | null | undefined): string | null {
  return key?.startsWith("avatars/") ? `/api/avatars/${key.slice("avatars/".length)}` : null;
}
