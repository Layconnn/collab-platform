# 🐳 Docker Development Setup

This guide walks you through setting up the local development environment using Docker.

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

## 🚀 Quick Start

### 1. Start Docker Services

From the **project root** (`my-platform/`):

```bash
docker-compose up -d
```

This starts:

- **PostgreSQL** (port 5432)
- **Redis** (port 6379)

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

This creates all database tables (including Comment, Discussion, Workspace, User, etc.).

### 4. Start Development Server

```bash
pnpm dev
```

Navigate to `http://localhost:3000`

---

## 📊 Accessing Services

### PostgreSQL

**CLI**:

```bash
docker exec -it my-platform-postgres psql -U postgres
```

**GUI** (Prisma Studio):

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

```bash
docker-compose down -v
```

---

## 🐛 Troubleshooting

### Port Already In Use

If you get "port 5432 already in use":

```bash
# Find process using port 5432
lsof -i :5432

# Or for Windows:
netstat -ano | findstr :5432

# Stop the container
docker-compose down
```

### Database Connection Refused

Make sure services are healthy:

```bash
docker-compose ps
# Status should be "Up (healthy)"

# If not healthy, check logs
docker-compose logs postgres
docker-compose logs redis
```

### Prisma Migration Fails

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

Your `.env` is already configured for Docker:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
REDIS_URL="redis://localhost:6379"
```

If you need to change:

- Database name: edit `docker-compose.yml` (`POSTGRES_DB`)
- Credentials: edit `docker-compose.yml` (`POSTGRES_USER`, `POSTGRES_PASSWORD`)

---

## 🔄 Resetting Everything

Full reset (fresh slate):

```bash
# Stop and remove everything
docker-compose down -v

# Start fresh
docker-compose up -d

# Run migrations
cd apps/web
pnpm exec prisma migrate dev

# Restart dev server
pnpm dev
```

---

## 📚 Next Steps

Once Docker is running:

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
