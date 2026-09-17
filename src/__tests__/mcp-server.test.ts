import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { createServer } from '../server.js';

describe('MCP Server Integration Tests', () => {
  let httpServer: Server;
  let serverPort: number;

  function getTestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (process.env.MCP_AUTH_TOKEN && process.env.MCP_AUTH_TOKEN.trim() !== '') {
      headers['Authorization'] = `Bearer ${process.env.MCP_AUTH_TOKEN.trim()}`;
    }
    return headers;
  }

  before(async () => {
    process.env.NODE_ENV = 'test';
    const { app } = createServer();

    await new Promise<void>((resolve) => {
      httpServer = app.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it('serves healthcheck endpoint successfully', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'arxiv-triager-mcp');
  });

  it('discovers all 4 registered MCP tools over Streamable HTTP endpoint', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: 'POST',
      headers: getTestHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    assert.equal(res.status, 200);
    const responseText = await res.text();
    assert.ok(responseText.includes('search_arxiv'));
    assert.ok(responseText.includes('search_notion_papers'));
    assert.ok(responseText.includes('save_paper_to_notion'));
    assert.ok(responseText.includes('update_notion_paper'));
  });

  it('invokes search_arxiv tool via JSON-RPC over Streamable HTTP endpoint', async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
      method: 'POST',
      headers: getTestHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'search_arxiv',
          arguments: {
            search_query: 'cat:cs.AI',
            max_results: 1,
          },
        },
      }),
    });

    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('data:'));
    assert.ok(text.includes('jsonrpc'));
  });

  it('rejects unauthorized request when MCP_AUTH_TOKEN is configured on a protected server', async () => {
    const originalToken = process.env.MCP_AUTH_TOKEN;
    try {
      process.env.MCP_AUTH_TOKEN = 'secret_test_bearer_token';
      const { app: protectedApp } = createServer();

      let authPort = 0;
      const authServer = protectedApp.listen(0, '127.0.0.1');
      await new Promise<void>((r) => {
        authServer.on('listening', () => {
          const addr = authServer.address();
          if (addr && typeof addr === 'object') authPort = addr.port;
          r();
        });
      });

      try {
        const unauthorizedRes = await fetch(`http://127.0.0.1:${authPort}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        });
        assert.equal(unauthorizedRes.status, 401);

        const authorizedRes = await fetch(`http://127.0.0.1:${authPort}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Authorization': 'Bearer secret_test_bearer_token',
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
        });
        assert.equal(authorizedRes.status, 200);
      } finally {
        authServer.close();
      }
    } finally {
      if (originalToken !== undefined) {
        process.env.MCP_AUTH_TOKEN = originalToken;
      } else {
        delete process.env.MCP_AUTH_TOKEN;
      }
    }
  });
});
