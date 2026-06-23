# JB Rock Bolts — All-on-Railway Deployment Documentation

This document describes how to deploy the entire application stack — **Frontend (React)**, **Backend (FastAPI)**, and **Database (MySQL)** — onto **Railway**, using your custom domain.

```
┌─────────────────────────────────────────────────────────┐
│                        USER                             │
│                  (Web Browser)                          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────┐
│              RAILWAY (React Frontend)                   │
│         yourdomain.com / www.yourdomain.com             │
│            React + Vite served via Nginx                │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS API calls (VITE_API_URL)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              RAILWAY (FastAPI Backend)                  │
│               api.yourdomain.com                        │
│            FastAPI + Python 3.12 (Docker)               │
└──────────────────────┬──────────────────────────────────┘
                       │ Private Network (DATABASE_URL)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              RAILWAY (MySQL Database)                   │
│         mysql.railway.internal:3306/railway             │
│                       MySQL 8                           │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Pre-deployment Prerequisites

Before starting, ensure both the backend and frontend folders are pushed to separate GitHub repositories:
1. **Backend Repository:** Contains the contents of `JB-Rock-Bolts---backend` (with its `Dockerfile` and `requirements.txt`).
2. **Frontend Repository:** Contains the contents of `JB-Rock-Bolts---frontend` (with its `Dockerfile`, `package.json`, and `vite.config.ts`).

---

## 🛠️ Step-by-Step Deployment on Railway

### Step 1: Provision the MySQL Database

1. Sign in to your [Railway.app Dashboard](https://railway.app/).
2. Click **New Project** -> Select **Provision MySQL**.
   - *This will instantly create a MySQL 8 database service named `MySQL` in your project.*
3. Go to the **Variables** tab of the newly created MySQL service. Notice that Railway automatically generates connection variables like:
   - `DATABASE_URL` (e.g., `mysql://root:password@mysql.railway.internal:3306/railway`)
   - `MYSQLPORT`
   - `MYSQLUSER`
   - `MYSQLPASSWORD`
   - `MYSQLDATABASE`

---

### Step 2: Deploy the FastAPI Backend

1. In your Railway project dashboard, click **+ Add Service** or **New** -> Select **GitHub Repo**.
2. Search and select your **Backend GitHub Repository**.
3. Railway will immediately detect the `Dockerfile` and begin building the service.
4. While the build is running, go to the **Variables** tab of the backend service. Click **Raw Editor** (or add them manually) and set the following environment variables:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `MYSQL_URL` | `${{MySQL.DATABASE_URL}}` | **Crucial:** References the database connection string dynamically. *(Note: Make sure `MySQL` matches the exact name of your database service in Railway).* |
| `SECRET_KEY` | *[Your-Long-Random-String]* | Secure key used to sign JWT authentication tokens. |
| `APP_ENV` | `production` | Enables production settings. |
| `DEBUG` | `False` | Disables database engine logging and debug logs. |
| `CORS_ORIGINS` | `https://yourdomain.com,https://www.yourdomain.com` | Whitelists your custom domain so the frontend can make requests. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Duration (in minutes) for JWT token validity. |

5. Once variables are added, Railway will automatically redeploy the backend with the new settings.
6. Go to the **Settings** tab of the backend service.
   - Under **Domains**, click **Generate Domain** to get a temporary public URL (e.g., `jb-backend.up.railway.app`). Keep this handy.

---

### Step 3: Deploy the React Frontend

1. In your Railway project dashboard, click **+ Add Service** or **New** -> Select **GitHub Repo**.
2. Select your **Frontend GitHub Repository**.
3. Go to the **Variables** tab of this frontend service.
4. Add the build-time environment variable:
   - `VITE_API_URL` = `https://api.yourdomain.com` *(This is your final backend URL. If you don't have the domain configured yet, you can temporarily use your backend's generated Railway URL like `https://jb-backend.up.railway.app` and update it later)*.
5. Click deploy/redeploy. The Vite build process will pick up this variable and inject it into the compiled static files.

---

## 🌐 Step 4: Configure Your Custom Domain

Railway manages custom domain routing and SSL certificates (HTTPS) automatically. You just need to link your domain and update your DNS records.

### 1. Add Custom Domains on Railway
* **For Frontend Service:**
  - Open the Frontend service -> **Settings** tab -> **Domains** section.
  - Click **Custom Domain** and add:
    1. `yourdomain.com`
    2. `www.yourdomain.com`
  - Railway will generate the required DNS targets (e.g., `yourdomain.com.herokucdn.com` or a specific IP for `A` record). Write these down.
* **For Backend Service:**
  - Open the Backend service -> **Settings** tab -> **Domains** section.
  - Click **Custom Domain** and add:
    1. `api.yourdomain.com` (or `backend.yourdomain.com`).
  - Write down the target generated by Railway.

### 2. Configure DNS Records (at GoDaddy, Namecheap, etc.)
Log in to the dashboard of the provider where you purchased the domain and add the following records:

| Type | Name (Host) | Value (Points to) | TTL |
| :--- | :--- | :--- | :--- |
| **A** or **CNAME** | `@` | The IP address or CNAME target provided by Railway for `yourdomain.com` | `3600` (1 hour) |
| **CNAME** | `www` | The CNAME target provided by Railway for `www.yourdomain.com` | `3600` |
| **CNAME** | `api` | The CNAME target provided by Railway for `api.yourdomain.com` | `3600` |

> ⏳ **Note on DNS Propagation:** DNS changes can take anywhere from a few minutes up to 24–48 hours to update worldwide. You can monitor the status at [dnschecker.org](https://dnschecker.org/).

---

## 🔄 File Uploads & Storage (Production Warning)

By default, the backend stores uploaded purchase orders and invoices in a local `uploads/` folder.
* **Important:** Railway services use an **ephemeral filesystem**. Every time the service redeploys, restarts, or goes to sleep, files in the `uploads/` directory will be deleted.
* **Solution:** To keep your files safe in production, configure **Cloudflare R2** (10 GB free/month) or **Amazon S3**. Add these keys to your Railway Backend environment variables:
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME`
  - `R2_PUBLIC_URL`

---

## 🔎 Verification Checklist

Once everything is deployed and DNS propagation is complete:
- [ ] Visit `https://api.yourdomain.com/health` -> should return `{"status":"ok"}`.
- [ ] Visit `https://yourdomain.com` -> your login screen should load successfully.
- [ ] Attempt logging in with your credentials -> confirms successful database connectivity.
- [ ] Upload a document (Invoice/PO) -> check if it uploads and views successfully.
