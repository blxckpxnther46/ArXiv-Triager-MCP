import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { searchArxivSchema, handleSearchArxiv } from './tools/search-arxiv.js';
import { searchNotionPapersSchema, handleSearchNotionPapers } from './tools/search-notion.js';
import { savePaperToNotionSchema, handleSavePaperToNotion } from './tools/save-paper.js';
import { updateNotionPaperSchema, handleUpdateNotionPaper } from './tools/update-paper.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Creates and configures a new McpServer instance with all tools registered.
 */
export function createMcpServer(): McpServer {
  const mcpServer = new McpServer({
    name: 'arxiv-triager-mcp',
    version: '1.0.0',
    description: 'Academic research assistant MCP server for arXiv searching and Notion triaging',
  });

  mcpServer.tool(
    'search_arxiv',
    'Search the public arXiv API for academic papers with clean metadata and abstracts.',
    searchArxivSchema,
    handleSearchArxiv
  );

  mcpServer.tool(
    'search_notion_papers',
    'Check whether a paper already exists in the Notion ArXiv Research database by exact ArXiv URL.',
    searchNotionPapersSchema,
    handleSearchNotionPapers
  );

  mcpServer.tool(
    'save_paper_to_notion',
    'Create a paper entry in the Notion ArXiv Research database with built-in duplicate protection.',
    savePaperToNotionSchema,
    handleSavePaperToNotion
  );

  mcpServer.tool(
    'update_notion_paper',
    'Update an existing Notion paper entry\'s Summary property.',
    updateNotionPaperSchema,
    handleUpdateNotionPaper
  );

  return mcpServer;
}

/**
 * Initializes Express application with health and MCP endpoints.
 */
export function createServer(): { app: express.Application } {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'arxiv-triager-mcp',
      timestamp: new Date().toISOString(),
    });
  });

  // Auth Middleware for MCP endpoint
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authToken = process.env.MCP_AUTH_TOKEN;
    if (authToken && authToken.trim() !== '') {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${authToken.trim()}`) {
        res.status(401).json({ error: 'Unauthorized: Invalid or missing bearer token' });
        return;
      }
    }
    next();
  };

  // MCP Streamable HTTP endpoint
  app.all('/mcp', authMiddleware, async (req: Request, res: Response) => {
    try {
      const mcpServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport();
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('MCP Endpoint Exception:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal MCP transport error', details: String(err) });
      }
    }
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Express Unhandled Error:', err);
    res.status(500).json({ error: err?.message || 'Internal Server Error' });
  });

  return { app };
}

// Start standalone server if executed directly
const entryFile = process.argv[1] || '';
const isDirectExecution = entryFile.endsWith('server.ts') || entryFile.endsWith('server.js');
if (isDirectExecution && process.env.NODE_ENV !== 'test') {
  const { app } = createServer();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ArXiv-Triager MCP Server running on http://0.0.0.0:${PORT}`);
    console.log(`📍 MCP Streamable HTTP Endpoint: http://localhost:${PORT}/mcp`);
    console.log(`💓 Healthcheck Endpoint: http://localhost:${PORT}/health`);
  });
}
