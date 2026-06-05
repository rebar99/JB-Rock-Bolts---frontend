# JB Rock Bolts — Frontend

React 18 + Vite marketing & sales management dashboard for JB Rock Bolts.  
All data is fetched from the FastAPI backend — zero local mock data.

## Tech Stack

| Layer | Library |
|---|---|
| UI Framework | React 18 + Vite 5 |
| Routing | React Router v6 |
| Data Fetching | TanStack React Query v5 |
| Styling | Tailwind CSS + Radix UI / shadcn |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Notifications | Sonner |

## Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | KPI cards, charts, recent sales |
| `/purchase-orders` | Purchase Orders | Full CRUD, activity log, print PO |
| `/sales-invoice` | Sales | Dispatch tracking, invoice generation, payment status |
| `/inventory` | Inventory | Stock levels, add/edit products |
| `/clients` | Clients | Grouped by location, add/delete |
| `/reports` | Reports | Filtered table + CSV export |

## Prerequisites

- Node.js 18+
- Backend running on `http://localhost:8000` (see `backend-jbrockbolts/`)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set VITE_API_URL to your backend URL

# 3. Start dev server
npm run dev
# → http://localhost:8080
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Backend API base URL |

## Build

```bash
npm run build       # Production build → dist/
npm run preview     # Preview production build locally
```

## Docker

```bash
# Build image (pass API URL at build time)
docker build --build-arg VITE_API_URL=http://your-api-host:8000 -t jbrockbolts-frontend .

# Run container
docker run -p 80:80 jbrockbolts-frontend
# → http://localhost
```

## Project Structure

```
src/
├── lib/
│   ├── api.js          # All backend API calls (single source of truth)
│   ├── constants.js    # useConstants() hook — fetches from /api/constants
│   ├── currentUser.js  # Current user name (localStorage)
│   └── format.js       # INR formatter, date formatters
├── context/
│   ├── RecordsContext.jsx          # React Query wrapper for /api/records
│   ├── PurchaseOrdersContext.jsx   # React Query wrapper for /api/purchase-orders
│   └── ThemeContext.jsx            # Light/Dark theme
├── pages/
│   ├── Dashboard.jsx
│   ├── PurchaseOrders.jsx
│   ├── SalesInvoice.jsx
│   ├── Inventory.jsx
│   ├── Clients.jsx
│   └── Reports.jsx
└── components/
    ├── layout/          # AppLayout, Sidebar, Topbar
    ├── StatusBadge.jsx
    └── ui/              # shadcn/Radix primitives
```

## Document Generation

PO receipts and sales invoices are rendered server-side by the backend.  
Clicking **Print PO** or **Generate Invoice** opens `GET /api/documents/po/{id}` or  
`GET /api/documents/invoice/{id}` in a new browser tab — ready to print.
