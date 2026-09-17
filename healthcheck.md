# ArXiv-Triager MCP Server Healthcheck Documentation

The ArXiv-Triager MCP Server provides a dedicated lightweight healthcheck HTTP endpoint to monitor process uptime, service readiness, and VPS container health.

---

## Endpoint Specification

- **HTTP Method**: `GET`
- **URL Path**: `/health`
- **Authentication**: None required (bypasses `MCP_AUTH_TOKEN` middleware so load balancers and uptime monitors can query without credentials).
- **Content-Type**: `application/json`

---

## Response Formats

### Healthy Response (HTTP 200 OK)

```json
{
  "status": "ok",
  "service": "arxiv-triager-mcp",
  "timestamp": "2026-09-17T12:00:00.000Z"
}
```

### Unhealthy Response (HTTP 500 Internal Server Error)

If the Node process is unresponsive or memory limits are exceeded, web servers (nginx / caddy) will receive a timeout or 500 error.

---

## Testing Healthcheck

### Using curl

```bash
curl -i http://localhost:3000/health
```

Expected Output:
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 79

{"status":"ok","service":"arxiv-triager-mcp","timestamp":"2026-09-17T12:00:00.000Z"}
```

---

## Deployment Healthcheck Configurations

### Docker Container Healthcheck

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
```

### PM2 Ecosystem File (`ecosystem.config.cjs`)

```javascript
module.exports = {
  apps: [
    {
      name: "arxiv-triager-mcp",
      script: "./dist/server.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
```

### Nginx Health Monitor

```nginx
location /health {
    proxy_pass http://127.0.0.1:3000/health;
    proxy_set_header Host $host;
    access_log off;
}
```
