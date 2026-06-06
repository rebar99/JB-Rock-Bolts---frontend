# # ── Stage 1: Build ────────────────────────────────────────────────────────────
# FROM node:20-alpine AS builder

# WORKDIR /app

# COPY package*.json ./
# RUN npm ci

# COPY . .

# # Inject API URL at build time (override with --build-arg)
# ARG VITE_API_URL=http://localhost:8000
# ENV VITE_API_URL=$VITE_API_URL

# RUN npm run build

# # ── Stage 2: Serve ─────────────────────────────────────────────────────────────
# FROM nginx:1.27-alpine

# COPY --from=builder /app/dist /usr/share/nginx/html

# # SPA routing: redirect all 404s to index.html
# RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' \
#     > /etc/nginx/conf.d/default.conf

# EXPOSE 80

# CMD ["nginx", "-g", "daemon off;"]

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Inject API URL at build time (override with --build-arg or Railway env var)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2: Serve ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing + dynamic port from Railway's $PORT env var
RUN printf 'server {\n  listen $PORT;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' \
    > /etc/nginx/conf.d/default.conf.template

# Substitute $PORT at runtime, then start nginx
CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
