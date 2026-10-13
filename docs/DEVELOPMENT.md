# 🐳 Docker Development Setup

This guide covers the verified Windows setup and a separate Docker PostgreSQL setup for other environments. Choose the intended database before running database commands.

## Prerequisites

### Windows (your setup)

1. **Download Docker Desktop for Windows**:
   - Visit: https://www.docker.com/products/docker-desktop
   - Click "Download for Windows"
   - Run the installer and follow the wizard
   - Restart your computer when prompted
   - Docker will start automatically

2. **Verify Installation**:
   ```bash
   docker --version
   docker-compose --version
   ```

### macOS

```bash
# Using Homebrew (recommended)
brew install docker docker-compose

# Or download Docker Desktop:
# https://www.docker.com/products/docker-desktop
```

### Linux (Ubuntu/Debian)

```bash
# Install Docker
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Add user to docker group (optional, avoid sudo)
sudo usermod -aG docker $USER
newgrp docker
```

---

## Verified Windows Setup

On the current Windows machine, Next.js runs directly on Windows and connects to the existing PostgreSQL 18 service at `localhost:5433`. That database contains the Commons accounts, workspaces, memberships, and discussions. Docker Compose PostgreSQL is a different, currently empty PostgreSQL 16 database, even though Compose advertises host port 5433. Preserve the Windows database; do not switch Next.js to the empty container or run migrations or resets to resolve a notification issue.

Redis runs in Docker. `RUN_WORKER_IN_API=1` enables the development worker inside Next.js, using the same database and Redis settings as the web app. The separate Docker worker connects to Compose PostgreSQL by default and must stay stopped in this setup.

From the project root in Git Bash:

```bash
docker-compose stop postgres notification-worker
docker-compose up -d redis
pnpm.cmd dev
```

Stopping the containers does not delete their volumes. Windows PostgreSQL (`postgresql-x64-18`) must be running. Open `http://localhost:3000`; do not run plain `docker-compose up -d`, which would start the mismatched worker again. If the dev server is already running, do not start a second copy.

---

## Docker PostgreSQL Setup

### 1. Start Docker Services

The following Docker PostgreSQL steps are for environments intentionally using that database. They are **not** the startup path for the populated Windows database above. Confirm the destination before running the migration step.

From the **project root** (`my-platform/`):

```bash
docker-compose up -d postgres redis
```

This starts:

- **PostgreSQL** (host port 5433, container port 5432)
- **Redis** (port 6379)

With `RUN_WORKER_IN_API=1` in `apps/web/.env`, the development web app starts the notification worker. Do not also start the Compose worker: two workers on one Redis queue can use different databases and claim each other's jobs.

### 2. Verify Services Are Running

```bash
docker-compose ps
```

You should see:

```
NAME                      STATUS
my-platform-postgres      Up (healthy)
my-platform-redis         Up (healthy)
```

### 3. Run Database Migrations

```bash
cd apps/web
pnpm exec prisma migrate dev
```

This creates all database tables (including Comment, Discussion, Workspace, User, etc.) in the configured database. Do not run it against the existing Windows database just to diagnose notifications.

### 4. Start Development Server

```bash
pnpm dev
```

Navigate to `http://localhost:3000`

### Try in-app notifications

In the verified Windows setup, use the commands above: run only Docker Redis and start the web app with `pnpm.cmd dev`. Its API worker starts when the tRPC route loads and uses the same database and Redis configuration as the web app. The Windows-hosted web app reaches Docker Redis at `localhost:6379`.

In the alternative Docker PostgreSQL setup, start `postgres redis` and use the in-app worker only if the web app actually points at that Compose database.

For a separate-container worker, disable `RUN_WORKER_IN_API` and run `docker-compose up -d --build notification-worker` only after verifying that its `DATABASE_URL` targets the same development database as the web app. The Compose worker defaults to `postgres:5432` and `redis:6379` inside Docker; it does not inherit `apps/web/.env`. Do not use this mode with the current Windows database until the worker's database connectivity has been deliberately aligned.

Register two local accounts. In a workspace owned by the first account, add the second account on the Members page using its user ID (find it in `pnpm -C apps/web exec prisma studio` if needed). Confirm the member appears in that workspace, then create a discussion or comment mentioning the other account's `@username`. Open the recipient's notification bell. The author does not receive a notification for their own action. In the separate-container mode, check delivery with `docker-compose logs --tail=50 notification-worker`; in API-worker mode, inspect the `pnpm dev` output.

---

## 📊 Accessing Services

### PostgreSQL

**Docker PostgreSQL CLI** (the empty Compose database on the verified Windows machine):

```bash
docker exec -it my-platform-postgres psql -U postgres
```

**Application database GUI** (Prisma Studio follows the app's database configuration):

```bash
cd apps/web
pnpm exec prisma studio
```

### Redis

**CLI**:

```bash
docker exec -it my-platform-redis redis-cli
```

Commands:

```redis
KEYS *              # List all keys
GET key_name        # Get value
FLUSHALL            # Clear all data
```

---

## 🛑 Stopping / Cleaning Up

### Stop Services (keep data)

```bash
docker-compose stop
```

### Stop & Remove Containers (keep volumes)

```bash
docker-compose down
```

### Full Reset (delete all data)

Only for a disposable Docker database, never as a way to fix the verified Windows setup. This removes Docker volumes; it does not migrate or repair the existing Windows database.

```bash
docker-compose down -v
```

---

## 🐛 Troubleshooting

### Redis Hostname Errors

`redis` is a Docker Compose service name, resolvable by containers on the Compose network. The Windows-hosted Next.js app uses `localhost:6379` instead. For `getaddrinfo ENOTFOUND redis`, check the error timestamp before changing configuration; an old error does not mean Redis is currently unavailable. Run `docker-compose ps` and `docker-compose exec -T redis redis-cli PING` to check the current service.

### Duplicate Notification Workers

Use either `RUN_WORKER_IN_API=1` with the Next.js development server **or** the separate Compose worker, never both against the same Redis queue. In the verified Windows setup, keep the Compose worker stopped with `docker-compose stop notification-worker`. A plain `docker-compose up -d` starts it again; `docker-compose up -d redis` does not.

### Dropped Notification Jobs

`notification.operation.drop_non_member` means the worker found no membership for the job's recipient and workspace **in the worker's database**. A BullMQ `completed` event after that drop does not mean a notification row was created. If the recipient appears in the web app's Members page, compare database destinations before changing membership: the Docker worker may be reading the empty Compose database while Next.js reads Windows PostgreSQL. Do not add fake memberships or bypass authorization to make delivery succeed.

### Check Destinations Without Revealing Credentials

Run this in the same terminal used for `pnpm.cmd dev`. It prints only protocol, host, port, and database path, never the username or password:

```bash
pnpm.cmd -C apps/web exec node -r dotenv/config -e "for (const key of ['DATABASE_URL','REDIS_URL']) { const url = new URL(process.env[key]); console.log(key, url.protocol, url.hostname, url.port, url.pathname); }"
```

Next.js inherits terminal variables and loads app environment files; an inherited value can override `apps/web/.env`. Check `apps/web/.env.local` if it exists. On the verified Windows machine, root `.env` files and `apps/web/.env.local` are absent. A host and port alone may still be ambiguous when Windows PostgreSQL and Docker both advertise port 5433. Compare read-only PostgreSQL server fingerprints without displaying connection strings:

```bash
pnpm.cmd -C apps/web exec node -r dotenv/config -e "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});try{await c.connect();console.log((await c.query('SELECT current_database(), system_identifier FROM pg_control_system()')).rows[0])}finally{await c.end()}})()"
docker-compose exec -T postgres psql -U postgres -d postgres -At -c 'SELECT current_database(), system_identifier FROM pg_control_system();'
```

Different system identifiers mean different PostgreSQL servers. `netstat -ano | findstr :5433` can help identify which Windows process owns the host port. Do not paste full connection strings into logs or support requests.

### Port Already In Use

If you get a host port conflict on 5433:

On the verified Windows machine, the populated Windows PostgreSQL service intentionally owns this port. Keep it running and use the Windows setup above. The commands below are for diagnosing a Docker PostgreSQL setup elsewhere.

```bash
# Find process using host port 5433
lsof -i :5433

# Or for Windows:
netstat -ano | findstr :5433

# Stop Compose services only if you intend to stop the Docker setup
docker-compose down
```

### Database Connection Refused

For the verified Windows setup, check that the `postgresql-x64-18` Windows service is running and Redis is healthy. The Compose PostgreSQL status does not describe the database used by Next.js on that machine.

For a Docker PostgreSQL setup, make sure services are healthy:

```bash
docker-compose ps
# Status should be "Up (healthy)"

# If not healthy, check logs
docker-compose logs postgres
docker-compose logs redis
```

### Prisma Migration Fails

These commands apply only to an environment intentionally using Docker PostgreSQL. Do not run migrations as a notification troubleshooting step against the populated Windows database.

```bash
# Make sure PostgreSQL is running
docker-compose up -d postgres

# Wait a few seconds for it to start
sleep 5

# Then try migration again
cd apps/web
pnpm exec prisma migrate dev
```

### Out of Disk Space

If Docker is using lots of space:

```bash
# Clean up unused images/containers
docker system prune -a

# This will ask for confirmation
```

---

## 📝 Environment Variables

Example variables for a Docker PostgreSQL environment:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/postgres"
REDIS_URL="redis://localhost:6379"
```

On the verified Windows machine, `localhost:5433` reaches the populated Windows PostgreSQL service, not the empty Compose database. Use the read-only identity checks above rather than assuming the URL identifies the container.

For a Docker PostgreSQL environment, if you need to change:

- Database name: edit `docker-compose.yml` (`POSTGRES_DB`)
- Credentials: edit `docker-compose.yml` (`POSTGRES_USER`, `POSTGRES_PASSWORD`)

---

## 🔄 Resetting Everything

Full reset (fresh slate):

**Docker PostgreSQL setup only.** This deletes Docker volumes and is not part of the verified Windows workflow. Never use it to troubleshoot the existing Commons database.

```bash
# Stop and remove everything
docker-compose down -v

# Start fresh (the API worker handles notifications in development)
docker-compose up -d postgres redis

# Run migrations
cd apps/web
pnpm exec prisma migrate dev

# Restart dev server
pnpm dev
```

---

## 📚 Next Steps

Once Docker is running:

For the verified Windows setup, start only Redis and use the existing Windows database. The migration step below is for a new, intentionally selected Docker PostgreSQL database only.

1. ✅ Verify services are healthy: `docker-compose ps`
2. ✅ Run migrations: `pnpm -C apps/web exec prisma migrate dev`
3. ✅ Start dev server: `pnpm dev`
4. ✅ Check Prisma Studio: `pnpm -C apps/web exec prisma studio`

---

**Stuck?** Check the logs:

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs postgres
docker-compose logs redis
```
