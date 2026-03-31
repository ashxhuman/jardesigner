# Docker Deployment Guide

## 1. Setup

```bash
git clone <repo>
cd jardesigner
cp .env.example .env
# Fill in CLOUDFLARE_TUNNEL_TOKEN and GRAFANA_ADMIN_PASSWORD in .env
```

## 2. Build

```bash
docker compose build
```

## 3. Run

### App only (local)

```bash
docker compose up -d
```

### App + Cloudflare tunnel (public access)

Requires `CLOUDFLARE_TUNNEL_TOKEN` in `.env`.
Get the token from: Cloudflare Dashboard → Zero Trust → Tunnels → your tunnel → Configure.
Set the public hostname in the dashboard to point to `http://nginx:80`.

```bash
docker compose -f docker-compose.yml -f compose.cloudflare.yaml up -d
```

### App + Monitoring (Prometheus + Grafana)

```bash
docker compose -f docker-compose.yml -f compose.monitor.yaml up -d
```

| Service | URL |
|---|---|
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 |

First login: admin / value of `GRAFANA_ADMIN_PASSWORD` in `.env`.
Add datasource in Grafana: Connections → Data sources → Prometheus → URL: `http://prometheus:9090`.

### All services

```bash
docker compose -f docker-compose.yml -f compose.cloudflare.yaml -f compose.monitor.yaml up -d
```

## 4. Stop

```bash
docker compose down
```

## 5. Logs

```bash
docker compose logs -f           # all
docker logs -f backend           # Flask backend
docker logs -f nginx             # nginx
docker logs -f cloudflared       # tunnel
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CLOUDFLARE_TUNNEL_TOKEN` | For tunnel | Token from Cloudflare dashboard |
| `GRAFANA_ADMIN_PASSWORD` | For monitoring | Default: `admin` — change in production |
