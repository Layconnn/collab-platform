# 🏗️ My Platform

> A production-grade collaboration platform built in public. Learning what it takes to build systems that scale, not just features that ship.

## What This Is

A **monorepo** containing a fullstack SaaS platform with:

- **Authentication** (JWT + Redis session validation)
- **Workspaces** (multi-tenant collaboration spaces)
- **Discussions** (threaded conversations)
- **Comments** (nested replies with depth limits)
- **Security by default** (40+ security tests, permission matrix, rate limiting)
- **Observability from day 1** (audit logs, metrics, alerts)

**Not microservices. Not premature optimization. Just clean fundamentals.**

---

## 🎯 Why This Repo Exists

I'm learning what **senior engineering** means:

- Security-first, not security-last
- Testing as architecture, not QA
- Observability built-in, not bolted-on
- Systems thinking, not feature-counting

My goal: Show that I think deliberately about scale, security, and maintainability.

---

## 📊 Architecture

### Design Principles

**Thin Routers, Fat Services**

```typescript
// ✅ Router: validation + delegation only
export const workspaceRouter = router({
  create: protectedProcedure
    .input(createSchema)
    .mutation(({ ctx, input }) => workspaceService.create(ctx.userId, input)),
});

// ✅ Service: all business logic
export async function create(userId: string, input: CreateInput) {
  // Validation, authorization, DB queries, audit logging
}
```

**Centralized Permission Matrix**

```typescript
// One place to update what roles can do
const WORKSPACE_PERMISSIONS = {
  MEMBER: [READ_DISCUSSION, CREATE_COMMENT],
  ADMIN: [READ_DISCUSSION, MANAGE_DISCUSSION, MANAGE_MEMBER],
  OWNER: [ALL],
};
```

**Security by Default**

- No header-based auth (JWT only)
- Normalized error codes (no resource enumeration)
- Adaptive rate limiting (stricter after repeated denials)
- Idempotent retries (safe to replay requests)
- Audit logs for every permission change

---

## 🧪 Testing (40+ Security Tests)

```bash
# Auth spoof rejection
pnpm -C apps/web run test:auth

# Workspace permission enforcement
pnpm -C apps/web run test:workspace-security

# Discussion multi-tenant isolation
pnpm -C apps/web run test:discussion-security

# Comment thread safety
pnpm -C apps/web run test:comment-security

# End-to-end integration
pnpm -C apps/web run test:integration
```

**What Tests Catch**

❌ Spoofed auth headers  
❌ Permission escalation (MEMBER → OWNER)  
❌ Multi-tenant data leaks  
❌ Resource enumeration attacks  
❌ Thread depth DOS  
❌ Stale cache after delete  
❌ Rate limiting bypasses  
❌ Idempotency collisions

---

## 🛠️ Tech Stack

| Layer              | Technology                   | Why                                                |
| ------------------ | ---------------------------- | -------------------------------------------------- |
| **Frontend**       | Next.js (App Router) + React | Server rendering + type safety                     |
|                    | TypeScript                   | Eliminate entire classes of bugs                   |
|                    | Tailwind + Chakra UI         | Component consistency                              |
| **Backend**        | tRPC                         | Type-safe RPC layer                                |
|                    | Prisma                       | ORM with migrations, no N+1 surprises              |
|                    | PostgreSQL                   | Boring, proven, scales horizontally                |
| **Cache**          | Redis                        | Session storage, rate limiting, short-lived caches |
| **Infrastructure** | Docker                       | Local dev matches production                       |
|                    | Monorepo (pnpm)              | Shared code, unified build                         |

---

## 🚀 Getting Started (Local)

### Prerequisites

- Node.js 18+
- Docker + Docker Compose
- pnpm

### Setup

```bash
# 1. Clone
git clone https://github.com/yourusername/my-platform.git
cd my-platform

# 2. Install dependencies
pnpm install

# 3. Start services (PostgreSQL + Redis)
docker-compose up -d

# 4. Run migrations
cd apps/web
pnpm exec prisma migrate dev

# 5. Start dev server
pnpm dev
```

Visit `http://localhost:3000`

---

## 🔐 Security

### What's Implemented

✅ JWT + Redis session validation (no header trust)  
✅ Permission matrix (centralized, testable)  
✅ Role-based access control (MEMBER, ADMIN, OWNER)  
✅ Normalized HTTP responses (no resource enumeration)  
✅ Adaptive rate limiting (stricter after denials)  
✅ Audit logging (every permission change)  
✅ Idempotent retries (safe replays)  
✅ Thread depth limits (DOS prevention)  
✅ PII minimization (author DTO: id + name only)

---

## 📈 Observability

### Built-In

- **Structured logging** (with correlation IDs)
- **Audit logs** (every permission change)
- **Metrics** (operations, denials, rate limits, cache hits/misses)
- **Error tracking** (with stack traces and context)

---

## 📚 Documentation

- **[docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)** — Architecture decisions, tech choices, scaling strategy
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — Local Docker setup, troubleshooting
- **[docs/DEPLOYMENT_FREE_TIER.md](docs/DEPLOYMENT_FREE_TIER.md)** — Deploy to production with zero cost (Vercel + Neon + Upstash)
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Staging + production deployment guide
- **[docs/CODEX_PROMPT_FRAMEWORK.md](docs/CODEX_PROMPT_FRAMEWORK.md)** — How I prompt AI for structured engineering
- **[docs/LINKEDIN_POSTS.md](docs/LINKEDIN_POSTS.md)** — Posts about building in public
- **[docs/security-alert-thresholds.md](docs/security-alert-thresholds.md)** — Observability + alerts

---

## 🎨 What I'm Learning

### Systems Thinking

- Permission matrices scale better than scattered checks
- Cursor pagination beats offset pagination at scale
- Rate limiting prevents abuse patterns early

### Clean Architecture

- Service layer owns business logic (not routers)
- Permission checks in one place (not three)
- Tests prove security assumptions

### Production Engineering

- Observability isn't optional
- Idempotency matters for reliability
- Audit logs enable forensics

### Tech Depth

- **tRPC**: Type safety end-to-end, eliminates API contract bugs
- **Prisma**: Migrations versioned with code
- **PostgreSQL**: Scales with proper indexing + replication
- **Redis**: Cache + session store + rate limiter

---

## 🚀 What's Next

**Phase 2:** Notifications (via BullMQ + email/push)  
**Phase 3:** Analytics (event streaming + aggregation)  
**Phase 4:** Real-time (WebSocket layer for live updates)

Each phase builds on proven fundamentals.

---

## 💼 For Recruiters

If you're looking for engineers who:

- ✅ Think in systems, not features
- ✅ Sweat security + observability details
- ✅ Test assumptions, not just ship code
- ✅ Learn by building in public
- ✅ Care about things lasting

Let's talk. [LinkedIn](https://www.linkedin.com/in/jinadu-olamilekan-5b8a15285/)

---

**Built in public. Learning what senior engineering means.**
