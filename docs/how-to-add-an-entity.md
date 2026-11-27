# How to Add an Entity

An entity in Commons runs through every layer. Follow the closest existing example: `Decision` for versioned, revisioned records; `Comment` for tenant-scoped children; `Notification` for idempotent writes.

## 1. Model (`apps/web/prisma/schema.prisma`)

- Use `String @id @default(cuid())`, `createdAt` and `updatedAt`.
- Every tenant-owned row carries `workspaceId` with a relation to `Workspace` (`onDelete: Cascade`) and an index that starts with `workspaceId`.
- When another table must reference the row within the same workspace, add `@@unique([workspaceId, id])` and use a composite foreign key, as `Decision` does with `Discussion`.
- Decide `onDelete` deliberately: `Cascade` for owned children, `SetNull` for historical references that keep a snapshot label (see `createdByLabel`).

## 2. Migration

```bash
pnpm -C apps/web exec prisma migrate dev --create-only --name <change>
```

Migrations apply in the alphabetical order of their folder names, so two migrations made on the same day must sort in the order they were written: name a later one so it sorts after the earlier (for example `20261127_user_preferences_notifications` after `20261127_user_preferences`), or use a full timestamp. CI applies every migration to a clean database and catches a wrong order. Review the generated SQL. Add constraints Prisma cannot express (CHECK constraints, deferrable foreign keys) by hand with a comment explaining why, and mention them in a comment above the model. CI fails if the migrated database and `schema.prisma` disagree.

## 3. Validators (`packages/validators/src/<entity>.ts`)

- One Zod schema per procedure input; trim and bound every string; ids are `z.string().cuid()`.
- Export the inferred types; add the file to `src/index.ts`, to the `exports` map in `packages/validators/package.json`, and to the alias list in `apps/web/vitest.config.ts`.

## 4. Service (`apps/web/server/services/<entity>.service.ts`)

- Check membership and role first with `requireWorkspaceAction` (or a locked membership read inside a transaction for multi-step mutations).
- Throw `AppError`; return `NOT_FOUND` for resources in other workspaces when the subdomain hides existence.
- Put related writes in one `prisma.$transaction`; use a version column and `updateMany` with the expected version for concurrent edits.
- Invalidate every Redis key the write affects; never trust a cached record without re-checking membership.
- Enqueue notifications after the write, inside `try/catch`, with a stable dedupe key.

## 5. Router (`apps/web/server/api/routers/<entity>.router.ts`)

Keep it thin: a rate-limit guard per procedure, the Zod input, and `execute(() => service.method(ctx.user.id, input))`. Register the router in `server/api/root.ts`.

## 6. Client

Add a hook in `apps/web/hooks/use<Entity>.ts` that wraps `trpc.<entity>.*`, invalidates affected queries on success, and refreshes access state on `FORBIDDEN`, `UNAUTHORIZED` or `NOT_FOUND`. Forms use React Hook Form with the shared schema.

## 7. Tests

- Service and security behavior: `apps/web/server/api/<entity>.security.test.mjs` with Prisma and Redis faked in memory, including non-member, wrong-role and foreign-tenant cases.
- Database constraints: a real-database suite like `server/db/decision.schema.integration.test.mjs`.
- Components: Vitest tests next to the component.

Add every new suite to the `apps/web/package.json` scripts and to `.github/workflows/ci.yml`.

## 8. Documentation

Add the entity's subdomain to `apps/web/documentation/ARCHITECTURE-commons.md` if it is new, and link any project PRD from the spec map.
