# 🚀 Fullstack SaaS Collaboration Platform

## Overview

This project is a production-grade fullstack SaaS collaboration platform
built as a **TypeScript monorepo** using modern scalable architecture
principles.

The architecture is **intentionally designed** to support **10k–100k users**
before requiring structural changes. Every decision prioritizes clarity,
maintainability, and production readiness from day one.

### Core Features

- 🔐 **Authentication** — Email + OAuth-ready with JWT sessions
- 👥 **Workspaces** — Multi-tenant collaboration spaces
- 💬 **Discussions** — Threaded conversations with comments
- 🔔 **Notifications** — Real-time and batched notifications
- ⚡ **Background Jobs** — Async processing with BullMQ
- 💾 **Caching** — Redis-backed caching strategy
- 📊 **Observability** — Structured logging and metrics
- 🚀 **Production Ready** — CI/CD, testing, and deployment pipeline

---

## 🧱 Public Build Journey

**This project is being built in public.**

Starting **April 2026**, progress, challenges, architecture decisions, and lessons learned will be documented at least **3 times per week on LinkedIn**.

### Topics Covered

- Architecture decisions and trade-offs
- Scaling considerations and performance optimizations
- Real-world engineering mistakes and refactors
- DevOps and deployment lessons learned
- Database design decisions and migrations
- Frontend optimizations and state management experiments
- Caching strategies and invalidation challenges
- Rate limiting and security implementations

### Why This Matters

This is not just a product—it is a **transparent engineering journey**. Building in public signals:

✅ **Consistency** — Regular updates demonstrate sustained focus

✅ **Ownership** — Founder-led development and decision-making

✅ **Founder Mindset** — Sharing failures and learning in real-time

This approach attracts talent, builds trust, and creates accountability.

---

## 📑 Table of Contents

- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [API Design](#api-design)
- [Database Strategy](#database-strategy)
- [Backend Services](#backend-services)
- [Frontend State Management](#frontend-state-management)
- [Performance & Optimization](#performance--optimization)
- [DevOps & Deployment](#devops--deployment)
- [Technical Roadmap](#technical-roadmap)
- [Engineering Philosophy](#engineering-philosophy)
- [Development Guidelines](#development-guidelines)

---

## 🏗️ Project Structure

```
root/
├── apps/
│   └── web/                  # Next.js fullstack app (App Router)
├── packages/
│   ├── ui/                   # Shared UI component library
│   ├── validators/           # Shared Zod schemas
│   ├── config/               # Shared tsconfig, eslint, etc.
│   └── eslint-config/        # Linting configuration
├── scripts/                  # Development scripts
├── docs/                     # Documentation
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # pnpm configuration
└── turbo.json                # Turborepo build cache
```

### Key Directories

| Directory                  | Purpose                                |
| -------------------------- | -------------------------------------- |
| `apps/web`                 | Next.js application with tRPC backends |
| `apps/web/app`             | App Router pages and layouts           |
| `apps/web/server`          | Backend services, routers, middleware  |
| `apps/web/server/api`      | tRPC routers (thin layer)              |
| `apps/web/server/services` | Business logic (fat layer)             |
| `apps/web/server/queue`    | BullMQ workers for async jobs          |
| `packages/validators`      | Shared Zod validation schemas          |
| `packages/ui`              | Reusable React components              |

---

## 🛠️ Tech Stack

### Frontend

| Technology               | Purpose                            |
| ------------------------ | ---------------------------------- |
| **Next.js** (App Router) | Server-side rendering & API routes |
| **TypeScript**           | Type-safe development              |
| **Tailwind CSS**         | Utility-first styling              |
| **Chakra UI**            | Component library & design system  |
| **React Query**          | Server state management            |
| **Zustand**              | Client-side state (UI-only)        |
| **React Hook Form**      | Form state & validation            |
| **tRPC**                 | End-to-end type-safe APIs          |

### Backend

| Technology     | Purpose                                 |
| -------------- | --------------------------------------- |
| **tRPC**       | Type-safe RPC framework                 |
| **Prisma ORM** | Database abstraction & migrations       |
| **PostgreSQL** | Primary relational database             |
| **Redis**      | Caching, sessions, rate limiting        |
| **BullMQ**     | Async job queue (Redis-backed)          |
| **Zod**        | Schema validation (shared across stack) |
| **Pino**       | Structured logging                      |

### Infrastructure & DevOps

| Service              | Purpose                    | Local Setup          |
| -------------------- | -------------------------- | -------------------- |
| **Vercel**           | Frontend deployment        | —                    |
| **Neon / Supabase**  | Managed PostgreSQL hosting | Docker Compose (dev) |
| **Upstash**          | Managed Redis hosting      | Docker Compose (dev) |
| **Render / Railway** | Worker deployment          | —                    |
| **GitHub Actions**   | CI/CD pipeline             | —                    |
| **Docker Compose**   | Local dev environment      | PostgreSQL + Redis   |

---

## 🐳 Local Development Setup

### Prerequisites

- **Node.js** 18+ with pnpm
- **Docker** and **Docker Compose**

### Quick Start

1. **Start local services** (PostgreSQL + Redis):

```bash
# From project root
docker-compose up -d

# Verify services are running
docker-compose ps
```

2. **Run database migrations**:

```bash
cd apps/web
pnpm exec prisma migrate dev
```

3. **Start development server**:

```bash
pnpm dev
```

### Services

- **PostgreSQL**: `localhost:5432` (user: `postgres`, password: `postgres`)
- **Redis**: `localhost:6379`
- **Next.js App**: `http://localhost:3000`
- **Prisma Studio**: `pnpm -C apps/web exec prisma studio`

### Stopping Services

```bash
docker-compose down

# Or remove volumes too (reset database):
docker-compose down -v
```

---

## 🏛️ Architecture

### Design Philosophy

We follow **clean architecture** principles with strict separation of concerns:

1. **Keep routers thin** — Routers validate input and delegate to services
2. **Fat services** — Services contain business logic
3. **Database abstraction** — Prisma handles all data access
4. **Shared validation** — Zod schemas live in `packages/validators`
5. **Async-first** — Heavy tasks enqueued as background jobs
6. **No blocking I/O** — External calls must be non-blocking

### Backend Layering

```
server/
├── api/              # ← tRPC routers (thin, ~20 lines each)
├── services/         # ← Business logic (fat, domain-specific)
├── db/               # ← Prisma client & migrations
├── cache/            # ← Redis helpers & caching logic
├── queue/            # ← BullMQ queues & workers
├── middleware/       # ← Auth, rate limiting
└── env.ts            # ← Validated environment config
```

### Request Flow

```
Client Request
    ↓
tRPC Router (validate input)
    ↓
Service Layer (execute business logic)
    ↓
Prisma (database query)
    ↓
Enqueue Background Job (if async)
    ↓
Return Response
```

---

## 📡 API Design

### tRPC Routers

Routers are organized by domain for clarity and maintainability:

- `auth.router.ts` — User authentication & sessions
- `workspace.router.ts` — Workspace CRUD & membership
- `discussion.router.ts` — Discussion threads
- `comment.router.ts` — Comments on discussions
- `notification.router.ts` — Notification delivery

### Router Example Pattern

```typescript
// ✅ DO: Thin router, logic in service
export const discussionRouter = router({
  list: protectedProcedure.input(listSchema).query(async ({ ctx, input }) => {
    return discussionService.list(ctx.userId, input);
  }),
});

// ❌ DON'T: Heavy logic in router
export const discussionRouter = router({
  list: protectedProcedure.input(listSchema).query(async ({ ctx, input }) => {
    // Business logic here is hard to test and reuse
  }),
});
```

### API Best Practices

- ✅ Use `protectedProcedure` for authenticated routes
- ✅ Throw `TRPCError` with appropriate status codes
- ✅ Use cursor-based pagination for list endpoints
- ✅ Select only required fields in Prisma queries
- ✅ Batch requests using tRPC batching
- ❌ Avoid N+1 queries
- ❌ Never trust client-provided roles
- ❌ Don't block on external I/O

---

## 🗄️ Database Strategy

### PostgreSQL with Prisma

- **Primary Database** for all application state
- **ORM**: Prisma for type-safe queries and migrations
- **ID Strategy**: UUID or CUID for all primary keys

### Design Rules

| Rule                             | Rationale                                |
| -------------------------------- | ---------------------------------------- |
| Index foreign keys               | Foreign key lookups are common           |
| Index frequently filtered fields | Improves query performance               |
| Cursor pagination                | Efficient for large datasets             |
| Separate DBs per environment     | Prevents cross-environment contamination |
| Log slow queries (>200ms)        | Identifies performance issues early      |

### Environments

- **Development** — Local or remote dev database
- **Staging** — Pre-production testing environment
- **Production** — Managed Postgres (Neon / Supabase)

### Pagination Strategy

Always use cursor-based pagination for list endpoints:

```typescript
// ✅ DO: Cursor pagination
const discussions = await prisma.discussion.findMany({
  take: 20,
  skip: cursor ? 1 : 0,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: "desc" },
});
```

---

## ⚙️ Backend Services

### Caching Strategy

**Redis** is used for:

- Session token validation
- Frequently accessed reads (discussions, workspaces)
- Rate limiting counters
- Idempotency keys
- Short-lived API response caching (60–120s)

#### Cache Rules

| Rule                            | Example                      |
| ------------------------------- | ---------------------------- |
| Cache only read-heavy endpoints | User profile, workspace list |
| Use structured keys             | `workspace:{id}:discussions` |
| Always invalidate on writes     | Delete cache when updating   |
| Never cache sensitive data      | Personal settings, passwords |
| Set expiration times            | TTL of 60–120 seconds        |

### Background Jobs with BullMQ

#### Heavy tasks processed asynchronously

- Email sending
- Notification fan-out
- Analytics aggregation
- Cleanup operations
- Invoice generation

#### Job Queue Pattern

```typescript
// Request cycle
validate → write to DB → enqueue job → return response

// Worker processes job asynchronously
processNotificationsJob: async (job) => {
  // Send emails, push notifications, etc.
};
```

#### Deployment

- Workers run on **separate Node.js runtime** (Render/Railway)
- Redis used for job persistence
- Scales independently from web app
- Retry logic built into BullMQ

---

## 🔐 Authentication & Security

### Authentication Architecture

- **JWT-based sessions** with Redis validation
- **Middleware-protected** tRPC routes
- **Role-based access control** (future-ready)
- **OAuth-ready** for future social login integration

### Security Best Practices

- ✅ Validate environment variables at startup
- ✅ Always check workspace ownership in backend
- ✅ Rate limit authentication routes
- ✅ Use Redis for session validation
- ❌ Never trust client-provided roles
- ❌ Never expose sensitive environment variables
- ❌ Don't skip backend permission checks

---

## 📊 Frontend State Management

### Modern Minimal Approach

| State Type   | Management                 | Tool                       |
| ------------ | -------------------------- | -------------------------- |
| Server State | Fetching, caching, updates | **React Query** (via tRPC) |
| Client State | Global UI state            | **Zustand** (client-only)  |
| Form State   | Form inputs, validation    | **React Hook Form**        |
| URL State    | Navigation, filters        | **Next.js Router**         |

### Why No Redux?

Redux adds unnecessary complexity for this architecture. We favor:

- tRPC for server state (replaces Redux Thunk)
- Zustand for lightweight client state
- React Hook Form for complex forms
- Next.js Router for navigation state

This keeps the codebase lean and performant.

---

## ⚡ Performance & Optimization

### Optimization Priority Order

1. **Architecture** — Async jobs, proper caching, clean design
2. **Database** — Indexing, query optimization, pagination
3. **API Layer** — Batching, field selection, caching
4. **Frontend** — Code splitting, lazy loading, memoization
5. **Network & Assets** — CDN, compression, image optimization

### Performance Targets

| Metric                         | Target            |
| ------------------------------ | ----------------- |
| API Response Time              | < 200ms (average) |
| Page Load Time                 | < 2s              |
| Largest Contentful Paint (LCP) | < 2.5s            |

### Key Rules

- ✅ Use tRPC batching for multiple queries
- ✅ Keep writes thin and fast
- ✅ Select only required fields in queries
- ✅ Use cursor pagination
- ✅ Monitor API timing with structured logs
- ✅ Code split automatically via Next.js
- ❌ Avoid N+1 queries
- ❌ Don't fetch unused fields

---

## 📈 Observability

### Structured Logging

All logs include correlation IDs for tracing:

```json
{
  "requestId": "req_123abc",
  "userId": "user_456def",
  "route": "discussion.list",
  "duration": 145,
  "status": 200,
  "timestamp": "2026-02-27T10:30:00Z"
}
```

### Logging Strategy

| Component      | What to Log                                |
| -------------- | ------------------------------------------ |
| **API Routes** | requestId, route, duration, status, errors |
| **Services**   | Operation start, completion, errors        |
| **Workers**    | Job ID, operation, duration, retries       |
| **Database**   | Slow queries (>200ms)                      |

### Error Monitoring

- Structured error logging with stack traces
- Optional Sentry integration for production
- Correlation IDs for debugging distributed issues

---

## 🚀 DevOps & Deployment

### CI/CD Pipeline (GitHub Actions)

#### On Pull Request (CI)

- Install dependencies
- Run linter (ESLint)
- Type check (TypeScript)
- Run tests

#### Preview Deploy

- Automatic deployment for feature branches
- Full environment isolation
- Disposable preview databases

#### Production Deploy

- Triggered on merge to `main`
- Automated via GitHub Actions
- **No manual deployments**

### Deployment Architecture

| Component       | Platform         | Notes                    |
| --------------- | ---------------- | ------------------------ |
| **Web App**     | Vercel           | Next.js optimized        |
| **Database**    | Neon / Supabase  | Managed PostgreSQL       |
| **Redis Cache** | Upstash          | Managed Redis            |
| **Workers**     | Render / Railway | Separate Node.js runtime |

### Environment Configuration

```
.env.local              # Development
.env.preview            # Preview deployments
.env.staging            # Staging environment
.env.production          # Production
```

### Environment Isolation

Each environment is completely isolated:

- Separate database instances
- Separate Redis instances
- Separate worker deployments
- No cross-environment data leakage

---

## 📈 Scaling Strategy

### Initial Scaling (0–100k users)

- **Horizontal scaling** handled by hosting provider (Vercel, Render)
- **Database performance** via indexing and query optimization
- **Caching** for read-heavy operations

### When Traffic Increases

1. Increase worker instances for BullMQ
2. Add database read replicas
3. Expand caching coverage
4. Optimize frequently accessed queries

### No Kubernetes Required Initially

- Managed hosting platforms handle infrastructure
- Scales cost-effectively for 10k–100k users
- Reevaluate architecture at 100k+ users

---

## 🗺️ Technical Roadmap

This roadmap reflects an **iterative, production-focused development strategy**. Each phase builds on architectural stability before adding complexity.

The platform is being built deliberately—not rushed.

### 🧩 Phase 1 — Core Platform Foundation

**Goal**: Ship a stable, usable MVP with clean architecture.

**Status**: In Progress

#### Deliverables

- ✅ Authentication (JWT + Redis session validation)
- ✅ Workspace creation & membership
- ✅ Discussions & comments
- ✅ Basic notifications
- ✅ tRPC API with domain-based routers
- ✅ Prisma schema finalized (v1)
- ✅ Redis caching (initial read-heavy endpoints)
- ✅ BullMQ background jobs (email + notifications)
- ✅ CI pipeline (lint, typecheck, test)
- ✅ Production deployment (Vercel + Managed DB + Redis)

#### Focus

- Correct architecture from day one
- Thin routers, fat services
- Cursor pagination everywhere
- No blocking I/O in request cycle
- Structured logging baseline

**Why It Matters**: This phase establishes technical credibility and sets the foundation for all future features.

---

### ⚙️ Phase 2 — Stability & Observability

**Goal**: Make the system measurable and resilient.

**Estimated**: May–June 2026

#### Enhancements

- 📊 API timing instrumentation
- 📉 Slow query logging (>200ms)
- 🔍 Correlation IDs across requests
- 🧪 Integration test coverage for critical flows
- 🔐 Hardened permission checks
- 🧯 Centralized error handling improvements
- 📦 Structured logging improvements (worker logs included)

#### Optional Additions

- Sentry integration
- Rate limiting per workspace
- Idempotency keys for write endpoints

**Why It Matters**: This phase moves the system from "working" to "operationally aware." You can't optimize what you don't measure.

---

### 🚀 Phase 3 — Performance & UX Optimization

**Goal**: Make the app feel fast and polished.

**Estimated**: July–August 2026

#### Backend

- ⚡ Expanded caching coverage
- 🔁 Cache invalidation strategy refinement
- 🗄️ Query plan review & index tuning
- 📦 Payload size optimization (field selection)

#### Frontend

- 🎨 UI refinement & micro-interactions
- ⏳ Suspense loading boundaries
- 📦 Bundle size analysis
- 🖼️ Image optimization

#### Performance Targets

- API < 200ms average
- Page load < 2s
- LCP < 2.5s

**Why It Matters**: This phase focuses on perceived speed and real performance—critical for user retention.

---

### 🏢 Phase 4 — Advanced Features & Monetization Readiness

**Goal**: Prepare for real users and growth.

**Estimated**: September–October 2026

#### Features

- 🔔 Advanced notification preferences
- 🧵 Threaded replies (deep nesting support)
- 📊 Workspace-level analytics dashboard
- 👥 Role-based access control (admin/mod roles)
- 📤 Export functionality (CSV/JSON)

#### Infrastructure

- 🗂️ Read replica support (if needed)
- 📈 Worker horizontal scaling
- 🔐 Security audit pass
- 🧱 Schema versioning strategy

#### Monetization Prep

- 💳 Subscription model groundwork
- 📦 Feature gating infrastructure
- 🧾 Billing event logging

**Why It Matters**: This phase transitions the platform from MVP to growth-ready without over-engineering.

---

### 🌍 Phase 5 — Scale & Evolution (Post 100k Users)

**Goal**: Sustain high traffic and operational maturity.

**Estimated**: November 2026 onwards

#### Infrastructure Evolution

- 📊 Advanced metrics aggregation
- 📈 Dedicated analytics pipeline
- 🧵 Event-driven architecture expansion
- 🧱 Possible service separation (only if justified)
- 📡 Real-time layer exploration (WebSockets)

#### Scaling Upgrades

- Database read replicas
- Queue partitioning
- Caching layer expansion
- Selective query denormalization

**Philosophy**: No premature microservices—only evolve when metrics justify architectural changes.

---

### 🧠 Ongoing Build-in-Public Commitment

Development progress will be shared publicly starting April 2026 at least 3 times per week on LinkedIn.

Topics will include:

- Architecture decisions
- Refactoring lessons
- Performance wins & failures
- Scaling challenges
- DevOps breakdowns
- Real production trade-offs

**The roadmap evolves transparently as real-world feedback shapes the platform.**

---

## 🎨 Engineering Philosophy

### Core Principles

> **Keep it simple. Ship fast. Scale deliberately.**

1. **Simplicity over cleverness** — Code that's easy to understand wins
2. **Clean architecture** — Thin routers, fat services
3. **Separation of concerns** — Each layer has one job
4. **Async-first** — Background jobs for heavy lifting
5. **Avoid premature optimization** — Profile before optimizing
6. **Favor caching** over premature DB optimization
7. **Type safety** — Use TypeScript everywhere

### What We Avoid

- ❌ Premature microservices
- ❌ Unnecessary abstractions
- ❌ Clever code that's hard to maintain
- ❌ Blocking I/O in request handlers
- ❌ Shared databases across environments

---

## 👨‍💻 Development Guidelines

### For AI Coding Agents

When generating code, follow these rules:

1. **Respect the monorepo structure** — Keep files in logical locations
2. **Keep routers thin** — Max ~30 lines, delegate to services
3. **Fat services** — Business logic belongs in services
4. **Use shared validators** — Import from `packages/validators`
5. **Structured error handling** — Throw `TRPCError` with proper codes
6. **Async background jobs** — Use BullMQ for heavy tasks
7. **No component-level DB queries** — Always go through services
8. **Show file paths** — When generating new files, always include path
9. **Return full files** — When modifying, return complete file contents
10. **Ask clarifying questions** — If domain logic is unclear, ask first

### Code Organization

```typescript
// ✅ Good: Service handles logic, router delegates
// service
export async function listDiscussions(userId: string, input: ListInput) {
  return prisma.discussion.findMany({
    where: { workspaceId: input.workspaceId },
    take: input.take,
  });
}

// router
export const discussionRouter = router({
  list: protectedProcedure
    .input(listSchema)
    .query(({ ctx, input }) => discussionService.list(ctx.userId, input)),
});

// ❌ Bad: Logic in router
export const discussionRouter = router({
  list: protectedProcedure.input(listSchema).query(async ({ ctx, input }) => {
    const discussions = await prisma.discussion.findMany({
      where: { workspaceId: input.workspaceId },
      take: input.take,
    });
    // ... more logic
  }),
});
```

---

## 📚 Additional Resources

- [Development Setup Guide](./DEVELOPMENT.md) — Local Docker development environment
- [Master Codex Prompt Framework](./CODEX_PROMPT_FRAMEWORK.md) — How to prompt Codex effectively
- [Architecture Decisions](./architecture.md)
- [Database Decisions](./database-decisions.md)
- [API Decisions](./api-decisions.md)
- [Scaling Plan](./scaling-plan.md)

---

**Last Updated**: February 27, 2026
