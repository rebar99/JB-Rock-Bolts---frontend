# JB Rock Bolts — Deployment Documentation

## Overview

The application is split into three independently deployed services:

```
┌─────────────────────────────────────────────────────────┐
│                        USER                             │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────┐
│              VERCEL  (Frontend)                         │
│         yourdomain.com / www.yourdomain.com             │
│              React + Vite (Static Build)                │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS API calls (VITE_API_URL)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              RENDER  (Backend)                          │
│               api.yourdomain.com                        │
│            FastAPI + Python 3.12 (Docker)               │
└──────────────────────┬──────────────────────────────────┘
                       │ TCP (MYSQL_PUBLIC_URL)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              RAILWAY  (Database)                        │
│                  MySQL 8                                │
│           roundhouse.proxy.rlwy.net                     │
└─────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer     | Technology          | Version  | Hosted On |
|-----------|---------------------|----------|-----------|
| Frontend  | React + Vite        | React 18 | Vercel    |
| Backend   | FastAPI + Uvicorn   | Python 3.12 | Render |
| Database  | MySQL               | 8.x      | Railway   |
| Styling   | Tailwind CSS + shadcn/ui | —   | —         |
| Auth      | JWT (python-jose)   | —        | —         |

---

## Service 1 — Railway (MySQL Database)

### What it does
Railway hosts the MySQL 8 database. It is the single source of truth for all
application data — purchase orders, sales, inventory, clients, users, etc.

### How tables are created
On every backend startup, SQLAlchemy's `Base.metadata.create_all()` runs
automatically. It creates any missing tables and leaves existing ones untouched.
No manual migrations are needed for new deployments.

### Two connection URLs Railway provides

| Variable          | Hostname                          | Use case                        |
|-------------------|-----------------------------------|---------------------------------|
| `DATABASE_URL`    | `mysql.railway.internal`          | Internal (Railway-to-Railway only) |
| `MYSQL_PUBLIC_URL`| `roundhouse.proxy.rlwy.net:PORT`  | External (Render, local machine) |

> **Important:** Always use `MYSQL_PUBLIC_URL` when connecting from Render or
> your local machine. `DATABASE_URL` only works between services inside the
> same Railway project.

### Environment variables (Railway Variables tab)
Railway auto-generates all of these — you only need to read them:

```
MYSQLHOST
MYSQLPORT
MYSQLUSER
MYSQLPASSWORD
MYSQLDATABASE
DATABASE_URL       ← internal, do not use from Render
MYSQL_PUBLIC_URL   ← use this in Render's MYSQL_URL
```

---

## Service 2 — Render (FastAPI Backend)

### What it does
Render runs the FastAPI application inside a Docker container. It handles all
business logic, authentication, file uploads, and database operations.

### How it is deployed
Render builds and runs the `Dockerfile` from the `main` branch of the backend
repository. On every push to `main`, Render automatically redeploys.

### Dockerfile explained

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install MySQL client libraries needed by pymysql
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc default-libmysqlclient-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# PORT is injected by Render automatically at runtime
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
```

### Environment variables to set in Render dashboard

| Variable                    | Value                                      | Description                              |
|-----------------------------|--------------------------------------------|------------------------------------------|
| `MYSQL_URL`                 | Railway's `MYSQL_PUBLIC_URL` value         | Database connection (public URL)         |
| `SECRET_KEY`                | Random string, 32+ characters              | JWT token signing key                    |
| `APP_ENV`                   | `production`                               | Enables production mode                  |
| `DEBUG`                     | `False`                                    | Disables SQL echo and debug logs         |
| `CORS_ORIGINS`              | `https://yourdomain.com,https://www.yourdomain.com` | Allowed frontend origins       |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60`                                     | JWT expiry duration                      |

> `PORT` is set automatically by Render — do not add it manually.

### How MYSQL_URL works in the code
`app/config.py` reads `MYSQL_URL` and converts the `mysql://` scheme to
`mysql+pymysql://` so SQLAlchemy can use it:

```python
# If MYSQL_URL = "mysql://root:pass@host:3306/railway"
# The code produces: "mysql+pymysql://root:pass@host:3306/railway"
```

### API endpoints
Once deployed, these URLs are available:

| URL                                    | Description              |
|----------------------------------------|--------------------------|
| `https://api.yourdomain.com/`          | Health check (root)      |
| `https://api.yourdomain.com/health`    | Health check endpoint    |
| `https://api.yourdomain.com/docs`      | Swagger UI (API docs)    |
| `https://api.yourdomain.com/redoc`     | ReDoc (API docs)         |
| `https://api.yourdomain.com/api/...`   | All application routes   |

### Free tier behaviour
Render's free web service **sleeps after 15 minutes of inactivity**. The first
request after idle takes 30–60 seconds to wake up. Subsequent requests are
instant. Upgrading to a paid plan removes this limitation.

---

## Service 3 — Vercel (React Frontend)

### What it does
Vercel builds the React/Vite app into static files and serves them globally
via its CDN. It does not run any server-side code.

### How it is deployed
Vercel detects the Vite framework automatically and runs `npm run build` on
every push to the `main` branch of the frontend repository.

### vercel.json explained

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

This tells Vercel to serve `index.html` for every URL path. Without this,
directly visiting a route like `yourdomain.com/sales` would return a 404
because there is no actual `sales.html` file — React Router handles routing
client-side.

### Environment variable to set in Vercel dashboard

| Variable       | Value                                    | Description                    |
|----------------|------------------------------------------|--------------------------------|
| `VITE_API_URL` | `https://api.yourdomain.com`             | Backend URL used at build time |

> `VITE_API_URL` is baked into the JavaScript bundle at build time by Vite.
> If you change this value in Vercel, you must trigger a redeploy for it to
> take effect.

### How VITE_API_URL is used in the code
`src/lib/api.js` reads the variable and falls back to localhost for development:

```javascript
const BASE =
    import.meta.env.VITE_API_URL ||
    "http://127.0.0.1:8000";
```

---

## Domain Setup (GoDaddy)

### DNS records to add in GoDaddy

| Type  | Name  | Value                                          | TTL |
|-------|-------|------------------------------------------------|-----|
| A     | `@`   | `76.76.21.21` (Vercel's IP)                   | 600 |
| CNAME | `www` | `cname.vercel-dns.com`                         | 600 |
| CNAME | `api` | `your-service-name.onrender.com`               | 600 |

### What each record does
- `@` (root domain) → points `yourdomain.com` to Vercel
- `www` → points `www.yourdomain.com` to Vercel
- `api` → points `api.yourdomain.com` to Render (backend)

### SSL certificates
Both Vercel and Render automatically provision free HTTPS certificates via
Let's Encrypt once DNS is verified. No manual setup is needed.

### DNS propagation
Changes take 5 minutes to 48 hours to propagate globally. With TTL 600
(10 minutes), most regions update within 30 minutes. Check propagation at
[dnschecker.org](https://dnschecker.org).

---

## Local Development Setup

To run the project locally, you do not need Docker. Use the `.env.example`
files as a reference.

### Backend

```bash
cd JB-Rock-Bolts---backend

# Create .env file
cp .env.example .env
# Edit .env — set DB_HOST, DB_USER, DB_PASSWORD for your local MySQL

# Install dependencies
pip install -r requirements.txt

# Run the server
python run_backend.py --reload
# API available at http://localhost:8000
```

### Frontend

```bash
cd JB-Rock-Bolts---frontend

# Create .env.local file
echo "VITE_API_URL=http://localhost:8000" > .env.local

# Install dependencies
npm install

# Run dev server
npm run dev
# App available at http://localhost:8080
```

---

## File Uploads

The backend stores uploaded PDFs in the `uploads/` directory and serves them
at `/uploads/<filename>`.

**Limitation:** Render's free tier has an ephemeral filesystem. Uploaded files
are lost when the service redeploys or restarts. For persistent uploads in
production, replace the local storage with a cloud bucket:

- **Cloudflare R2** — free 10 GB/month (recommended)
- **AWS S3** — free 5 GB for 12 months
- **Backblaze B2** — free 10 GB

---

## Deployment Checklist

Use this checklist whenever deploying a new version:

- [ ] Push changes to `main` branch
- [ ] Render redeploys automatically (check Render dashboard for build status)
- [ ] Vercel redeploys automatically (check Vercel dashboard for build status)
- [ ] Visit `https://api.yourdomain.com/health` → confirm `{"status":"ok"}`
- [ ] Visit `https://yourdomain.com` → confirm frontend loads
- [ ] Test login to confirm database connection is working

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Can't connect to MySQL server on 'mysql.railway.internal'` | Using Railway's internal URL from Render | Set `MYSQL_URL` to Railway's `MYSQL_PUBLIC_URL` value |
| `CORS error` in browser | Frontend origin not in `CORS_ORIGINS` | Add the Vercel URL to `CORS_ORIGINS` in Render env vars |
| Frontend shows blank page on direct URL | Missing SPA routing config | Ensure `vercel.json` with rewrites is in the repo root |
| `VITE_API_URL` not working after update | Value is baked in at build time | Trigger a manual redeploy in Vercel after changing the env var |
| Render cold start slow (30–60s) | Free tier service sleeping | Upgrade to paid plan or use an uptime monitor to ping `/health` every 10 min |
| Railway database connection refused | Railway free credit exhausted | Check Railway billing — add a payment method for the $5/month credit |
