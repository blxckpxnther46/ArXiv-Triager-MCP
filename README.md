# ArXiv-Triager MCP Backend

An academic research assistant Model Context Protocol (MCP) server built with **TypeScript**, **Node.js**, **Express**, and the official **@modelcontextprotocol/sdk**.

ArXiv-Triager enables ChatGPT agents and MCP clients to:
1. **Search recent AI research papers** from the public arXiv API with clean metadata and abstract parsing.
2. **Triage paper results** and analyze relevance.
3. **Query Notion database** by exact ArXiv URL to prevent duplicate paper entries.
4. **Save confirmed non-duplicate papers** to your Notion "ArXiv Research" database.
5. **Update existing paper summaries** in Notion when requested.

---

## System Architecture

```
┌─────────────────┐             Streamable HTTP / SSE              ┌──────────────────────────┐
│  ChatGPT Agent  │ ─────────────────────────────────────────────► │ ArXiv-Triager MCP Server │
│  or MCP Client  │ ◄───────────────────────────────────────────── │   (Express + Node.js)    │
└─────────────────┘                                                └────────────┬─────────────┘
                                                                                │
                                           ┌────────────────────────────────────┴────────────────────────────────────┐
                                           │                                                                         │
                                           ▼                                                                         ▼
                             ┌──────────────────────────┐                                             ┌─────────────────────────────┐
                             │     arXiv Query API      │                                             │         Notion API          │
                             │ https://export.arxiv.org │                                             │  https://api.notion.com/v1  │
                             └──────────────────────────┘                                             └─────────────────────────────┘
```

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher (tested on `v24.11.1`).
- **npm**: `v10.0.0` or higher.
- **Notion Integration Token**: Internal integration token from Notion integrations page.

---

## Project Structure

```
arxiv-triager-mcp/
├── src/
│   ├── server.ts             # Express server & MCP Streamable HTTP transport setup
│   ├── arxiv.ts              # arXiv API fetching & Atom XML parsing
│   ├── notion.ts             # Notion API query, duplicate protection, save & update
│   ├── types.ts              # TypeScript interfaces and schema types
│   ├── tools/
│   │   ├── search-arxiv.ts   # search_arxiv MCP tool handler & schema
│   │   ├── search-notion.ts  # search_notion_papers MCP tool handler & schema
│   │   ├── save-paper.ts     # save_paper_to_notion MCP tool handler & schema
│   │   └── update-paper.ts   # update_notion_paper MCP tool handler & schema
│   └── __tests__/            # Unit and integration test suites
│       ├── arxiv.test.ts
│       ├── notion.test.ts
│       └── mcp-server.test.ts
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore configuration
├── package.json              # NPM package & script definitions
├── tsconfig.json             # TypeScript compiler settings
├── AGENT_INSTRUCTIONS.md     # Prompting rules for ChatGPT agent
├── healthcheck.md            # Monitoring and endpoint documentation
└── README.md                 # System documentation
```

---

## Installation

1. **Clone or navigate to repository**:
   ```bash
   cd arxiv-triager-mcp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Edit `.env`:
   ```ini
   NOTION_TOKEN=secret_your_actual_notion_integration_token
   PORT=3000
   MCP_AUTH_TOKEN=your_secure_random_mcp_bearer_token
   ```

---

## Notion Integration Setup

### 1. Database & Data Source Identifiers

The server targets your existing Notion **"ArXiv Research"** database:

- **Database ID**: `3dec193f-e914-8047-a93a-f988e6ae987a`
- **Data Source ID**: `3dec193f-e914-8001-94f8-000bcd8c5c4e`
- **Notion API Version**: `2026-03-11`

### 2. Required Database Properties

Ensure your Notion database contains these exact property names and types:

- **Title**: `title` (Page Title)
- **Authors**: `rich_text` (Text)
- **ArXiv URL**: `url` (URL field used as primary unique identifier)
- **Published**: `date` (Date field)
- **Summary**: `rich_text` (Text)

### 3. Granting Integration Access

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) and create an **Internal Integration**.
2. Copy the **Internal Integration Token** into your `.env` as `NOTION_TOKEN`.
3. Open your "ArXiv Research" database page in Notion.
4. Click the `...` menu in the upper-right corner -> **Connections** -> **Add Connection** -> Select your integration.

---

## Available MCP Tools

| Tool Name | Purpose | Required Inputs |
| :--- | :--- | :--- |
| `search_arxiv` | Search public arXiv API for papers | `search_query` |
| `search_notion_papers` | Query Notion database for duplicate paper by ArXiv URL | `arxiv_url` |
| `save_paper_to_notion` | Create paper in Notion with built-in duplicate check | `title`, `authors`, `arxiv_url`, `published`, `summary` |
| `update_notion_paper` | Update an existing Notion paper entry's `Summary` | `page_id`, `summary` |

---

## Running Locally

### Development Mode (with hot reloading via `tsx`)

```bash
npm run dev
```

### Production Build & Execution

```bash
npm run build
npm start
```

Server endpoints:
- **MCP Endpoint**: `http://localhost:3000/mcp`
- **Healthcheck**: `http://localhost:3000/health`

---

## Testing

Run all unit and integration test suites:

```bash
npm test
```

Tests use Node native test runner (`node:test`) and mock external HTTP calls so you do not need live credentials to run unit tests.

---

## VPS Deployment Guide

### Option 1: PM2 + Nginx (Recommended)

1. **Install PM2 globally on VPS**:
   ```bash
   sudo npm install -g pm2
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

3. **Start process with PM2**:
   ```bash
   pm2 start dist/server.js --name "arxiv-triager-mcp"
   pm2 save
   pm2 startup
   ```

4. **Configure Nginx Reverse Proxy with HTTPS**:
   Create `/etc/nginx/sites-available/arxiv-triager`:

   ```nginx
   server {
       server_name arxiv-mcp.yourdomain.com;

       location /mcp {
           proxy_pass http://127.0.0.1:3000/mcp;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_buffering off;
           proxy_read_timeout 86400s;
       }

       location /health {
           proxy_pass http://127.0.0.1:3000/health;
       }
   }
   ```

5. **Enable HTTPS via Certbot**:
   ```bash
   sudo certbot --nginx -d arxiv-mcp.yourdomain.com
   ```

---

## Connecting to ChatGPT Plugins / Custom GPTs / MCP Clients

1. In your ChatGPT Custom GPT or MCP client configuration, specify the MCP Streamable HTTP endpoint:
   `https://arxiv-mcp.yourdomain.com/mcp`
2. If `MCP_AUTH_TOKEN` is enabled in your `.env`, set the Authorization Header:
   `Authorization: Bearer <MCP_AUTH_TOKEN>`
3. Refer to [AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md) for ChatGPT agent prompt configuration.

---

## Security Best Practices

- **Secrets Management**: Credentials (`NOTION_TOKEN`, `MCP_AUTH_TOKEN`) are loaded strictly from environment variables.
- **Git Safety**: `.env` is listed in `.gitignore` and must never be committed.
- **No Token Leaks**: Loggers explicitly exclude authorization headers and Notion tokens.
- **Input Validation**: All tool arguments are validated with Zod schemas.
- **Transport Security**: HTTPS reverse proxy with Bearer authentication is recommended for production.
