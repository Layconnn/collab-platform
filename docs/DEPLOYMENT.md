# 🚀 Deployment Checklist & Guide

**For: Workspace + Discussion + Comment MVP**

This guide walks you through deploying to staging environment before production.

---

## 📋 Pre-Deployment Checklist

### Code Quality & Testing

- [ ] All tests passing locally:

  ```bash
  pnpm -C apps/web run test:auth
  pnpm -C apps/web run test:workspace-security
  pnpm -C apps/web run test:discussion-security
  pnpm -C apps/web run test:comment-security
  pnpm -C apps/web run test:integration
  ```

- [ ] TypeScript compilation succeeds:

  ```bash
  pnpm -C apps/web exec tsc --noEmit --incremental false
  ```

- [ ] ESLint passes:

  ```bash
  pnpm -C apps/web run lint
  ```

- [ ] Next.js build succeeds:
  ```bash
  pnpm -C apps/web run build
  ```

### Security Audit

- [ ] Auth middleware verified (JWT + session validation)
- [ ] Permission matrix centralized and tested
- [ ] Rate limiting on all sensitive endpoints (getById, create, update, delete, list)
- [ ] Audit logging enabled for all mutations
- [ ] PII minimization in API responses (author DTO)
- [ ] Idempotency keys working for retries
- [ ] Alert thresholds documented
- [ ] No sensitive data in logs (passwords, tokens, emails)

### Documentation

- [ ] `docs/PROJECT_CONTEXT.md` updated with current state
- [ ] `docs/DEVELOPMENT.md` verified (Docker setup)
- [ ] `docs/security-alert-thresholds.md` complete
- [ ] `docs/CODEX_PROMPT_FRAMEWORK.md` aligns with implementation

---

## 🐳 Staging Environment Setup

### Option A: Self-Hosted (Recommended for testing)

Use the same Docker setup locally:

```bash
# From project root
docker-compose up -d

# Verify services
docker-compose ps
# Both should show (healthy)
```

Then deploy Next.js app:

```bash
cd apps/web
pnpm build
pnpm start
```

Visit `http://localhost:3000`

### Option B: Cloud Deployment (Vercel + Managed DB)

1. **Push code to GitHub**:

   ```bash
   git add .
   git commit -m "MVP: Workspace + Discussion + Comment"
   git push origin main
   ```

2. **Deploy to Vercel**:
   - Link repository: https://vercel.com/new
   - Select `apps/web` as root directory
   - Configure environment variables (see below)
   - Deploy

3. **Set up managed PostgreSQL** (Neon or Supabase):
   - Create account
   - Create database
   - Get connection string
   - Add to Vercel environment: `DATABASE_URL`

4. **Set up managed Redis** (Upstash):
   - Create account
   - Create Redis instance
   - Get connection string
   - Add to Vercel environment: `REDIS_URL`

---

## 🔐 Environment Variables (Staging)

Create `.env.staging` or configure in deployment platform:

```bash
# Database (managed PostgreSQL)
DATABASE_URL="postgresql://user:pass@host:5432/db"

# Cache (managed Redis)
REDIS_URL="redis://:pass@host:6379"

# Auth
JWT_SECRET="<generate-random-32-char-secret>"
JWT_REFRESH_SECRET="<generate-random-32-char-secret>"
TRUSTED_PROXY_TOKEN="<if-using-proxy>"

# App
NODE_ENV="staging"
NEXT_PUBLIC_APP_URL="https://staging.yourdomain.com"

# Observability
LOG_LEVEL="info"
```

**Generate secrets safely**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 Database Migrations (Staging)

1. **Connect to staging database**:

   ```bash
   export DATABASE_URL="postgresql://..."
   ```

2. **Run Prisma migrations**:

   ```bash
   cd apps/web
   pnpm exec prisma migrate deploy
   ```

3. **Verify migrations applied**:
   ```bash
   pnpm exec prisma studio
   # Check tables: User, Workspace, Discussion, Comment
   ```

---

## 🧪 Staging Validation Checklist

### Functionality Tests

- [ ] **Authentication**:
  - [ ] User can sign up
  - [ ] User can log in
  - [ ] JWT token works
  - [ ] Session persists across pages
  - [ ] Logout clears session

- [ ] **Workspace**:
  - [ ] Create workspace
  - [ ] Invite user as ADMIN
  - [ ] User sees workspace
  - [ ] Remove user from workspace
  - [ ] User cannot access removed workspace

- [ ] **Discussion**:
  - [ ] Create discussion in workspace
  - [ ] List discussions with pagination
  - [ ] Non-members cannot see discussions
  - [ ] Edit own discussion
  - [ ] Admin can delete any discussion

- [ ] **Comments**:
  - [ ] Create root comment
  - [ ] Create threaded reply
  - [ ] Cannot exceed nesting depth
  - [ ] Author can edit own comment
  - [ ] Admin can delete any comment
  - [ ] Non-author cannot edit

### Performance Tests

- [ ] API response time < 200ms (average)
- [ ] Page load time < 2s
- [ ] LCP < 2.5s
- [ ] Database queries use proper indexes
- [ ] Redis cache is working (check via `KEYS *` in Redis CLI)

### Security Tests

- [ ] Cannot access workspace without membership
- [ ] Cannot escalate roles (MEMBER → OWNER)
- [ ] Rate limiting returns 429 after threshold
- [ ] Spoofed headers are rejected
- [ ] Cursor from other workspace doesn't leak data
- [ ] Audit logs are being written

### Observability Tests

- [ ] Logs are flowing (check Docker logs or cloud logs)
- [ ] Audit events are recorded
- [ ] Error tracing works (correlation IDs visible)
- [ ] Metrics are being collected
- [ ] Alerts are configured and testable

---

## 📈 Monitoring Setup (Staging)

### Logs

**Local (Docker)**:

```bash
docker-compose logs -f postgres
docker-compose logs -f redis
```

**Cloud** (Vercel, Neon, Upstash):

- Access logs via each platform's dashboard
- Set up log aggregation if available

### Metrics

Track via `security-events.ts` collectors:

- Workspace operations (create, update, remove)
- Discussion operations (create, update, delete, list)
- Comment operations (create, update, delete, list)
- Permission denials
- Rate limit hits
- Auth failures
- Idempotency replays

### Alerts

Test alert thresholds in `security-alert-thresholds.md`:

- Auth failures: >5 / 5min → alert
- Permission denials: >1000 / 5min → alert
- Rate limit violations: >100 / 5min → alert
- Idempotency replays: >50 / 5min → alert

---

## 🚚 Staging Deployment Procedure

### Step 1: Prepare

```bash
# Update version
echo "1.0.0-staging" > VERSION.txt
git add VERSION.txt
git commit -m "chore: staging deployment v1.0.0"
git push origin main
```

### Step 2: Deploy App

**Vercel** (automatic):

- Push to main → automatic deploy
- Check Vercel dashboard for build status

**Self-hosted**:

```bash
cd apps/web
pnpm build
pnpm start
# Behind reverse proxy (nginx, etc.)
```

### Step 3: Run Migrations

```bash
cd apps/web
DATABASE_URL="<staging-db>" pnpm exec prisma migrate deploy
```

### Step 4: Verify Health

```bash
# Check app is running
curl https://staging.yourdomain.com/health

# Run integration tests against staging
TEST_URL="https://staging.yourdomain.com" pnpm -C apps/web run test:integration

# Check logs
# Vercel: Dashboard → Logs
# Self-hosted: docker-compose logs
```

### Step 5: Smoke Tests

- [ ] Sign up works
- [ ] Create workspace works
- [ ] Create discussion works
- [ ] Create comment works
- [ ] Permissions enforced
- [ ] Rate limiting works
- [ ] Audit logs flowing

---

## 🔄 Rollback Procedure

If issues arise in staging:

```bash
# Revert code
git revert <commit-hash>
git push origin main

# If database schema needs rollback
cd apps/web
DATABASE_URL="<staging-db>" pnpm exec prisma migrate resolve --rolled-back <migration-name>

# Redeploy
# Vercel: automatic
# Self-hosted: rebuild and restart
```

---

## ✅ Production Readiness Checklist

Before deploying to production:

- [ ] Staging validation passed (all tests)
- [ ] Performance benchmarks met
- [ ] Security audit passed (no findings)
- [ ] Monitoring/alerting configured
- [ ] Runbooks written for alerts
- [ ] On-call rotation established
- [ ] Backup strategy tested
- [ ] Rollback procedure tested
- [ ] Team trained on deployment
- [ ] Customer communication ready

---

## 📝 Post-Deployment

### Day 1

- [ ] Monitor error rates (should be 0)
- [ ] Monitor API latency (should be <200ms)
- [ ] Monitor auth success rate (should be ~100%)
- [ ] Test key workflows manually
- [ ] Check audit logs for anomalies

### Week 1

- [ ] Gather performance metrics
- [ ] Identify optimization opportunities
- [ ] Collect user feedback
- [ ] Plan Phase 2 (Notifications)

---

## 🎯 Next Steps

1. ✅ **Local validation**: All tests passing
2. → **Staging deployment**: Deploy to staging environment
3. → **Staging validation**: Run checklist above
4. → **Production deployment**: Deploy to production
5. → **Phase 2**: Build Notifications module

---

**Questions? Refer to:**

- `docs/PROJECT_CONTEXT.md` — Architecture & decisions
- `docs/DEVELOPMENT.md` — Local Docker setup
- `docs/security-alert-thresholds.md` — Alert configuration
- `docs/CODEX_PROMPT_FRAMEWORK.md` — How to prompt for future work
