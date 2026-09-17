import {
  SavePaperToNotionParams,
  SavePaperToNotionResponse,
  SearchNotionPapersResponse,
  UpdateNotionPaperParams,
  UpdateNotionPaperResponse,
  NotionMatch,
} from './types.js';

export const NOTION_DATABASE_ID = '3dec193f-e914-8047-a93a-f988e6ae987a';
export const NOTION_DATA_SOURCE_ID = '3dec193f-e914-8001-94f8-000bcd8c5c4e';
export const NOTION_API_VERSION = '2026-03-11';

/**
 * Retrieves the Notion Integration Token from environment variables.
 * Throws a clear error if missing or invalid.
 */
export function getNotionToken(): string {
  const token = process.env.NOTION_TOKEN;
  if (!token || token.trim() === '' || token === 'your_notion_integration_token') {
    throw new Error(
      'NOTION_TOKEN environment variable is not set or contains default placeholder. Please set a valid Notion Integration Token in your .env file.'
    );
  }
  return token.trim();
}

/**
 * Helper to construct Notion API headers.
 */
function getHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_API_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * Splits a text string into an array of rich_text items, ensuring no single chunk exceeds Notion's 2000-character limit.
 */
export function createRichTextChunks(text: string): Array<{ type: 'text'; text: { content: string } }> {
  if (!text) {
    return [{ type: 'text', text: { content: '' } }];
  }

  const chunkSize = 2000;
  const chunks: Array<{ type: 'text'; text: { content: string } }> = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({
      type: 'text',
      text: {
        content: text.slice(i, i + chunkSize),
      },
    });
  }

  return chunks;
}

/**
 * Extracts plain text from a Notion title property array.
 */
function extractTitlePlainText(titleProperty: any): string {
  if (!titleProperty || !Array.isArray(titleProperty.title)) return '';
  return titleProperty.title.map((item: any) => item.plain_text || item.text?.content || '').join('');
}

/**
 * Searches the Notion ArXiv Research database for existing papers with a matching ArXiv URL.
 * Uses the Data Source ID as required by Notion API version 2026-03-11.
 */
export async function searchNotionPapers(
  arxivUrl: string,
  customFetch: typeof fetch = fetch,
  overrideToken?: string
): Promise<SearchNotionPapersResponse> {
  if (!arxivUrl || arxivUrl.trim() === '') {
    throw new Error('arxiv_url parameter is required.');
  }

  const token = overrideToken || getNotionToken();
  const endpoint = `https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`;

  const body = {
    filter: {
      property: 'ArXiv URL',
      url: {
        equals: arxivUrl.trim(),
      },
    },
    page_size: 10,
  };

  let response: Response;
  try {
    response = await customFetch(endpoint, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Failed to connect to Notion API: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.message || response.statusText || 'Unknown error';
    throw new Error(
      `Notion API error (HTTP ${response.status}): ${message}`
    );
  }

  const data = await response.json();
  const results: any[] = data.results || [];

  if (results.length === 0) {
    return {
      exists: false,
      matches: [],
    };
  }

  const matches: NotionMatch[] = results.map((page: any) => {
    const props = page.properties || {};
    const pageArxivUrl = props['ArXiv URL']?.url || arxivUrl;
    const title = extractTitlePlainText(props['Title']);

    return {
      page_id: page.id,
      page_url: page.url,
      arxiv_url: pageArxivUrl,
      title: title || 'Untitled Paper',
    };
  });

  return {
    exists: true,
    matches,
  };
}

/**
 * Saves a paper to the Notion ArXiv Research database.
 * Includes built-in duplicate protection layer via searchNotionPapers before creation.
 */
export async function savePaperToNotion(
  params: SavePaperToNotionParams,
  customFetch: typeof fetch = fetch,
  overrideToken?: string
): Promise<SavePaperToNotionResponse> {
  const { title, authors, arxiv_url, published, summary } = params;

  if (!title || !authors || !arxiv_url || !published || !summary) {
    throw new Error('title, authors, arxiv_url, published, and summary are all required.');
  }

  const token = overrideToken || getNotionToken();

  // 1. Duplicate Protection Check
  const searchResult = await searchNotionPapers(arxiv_url, customFetch, token);
  if (searchResult.exists) {
    return {
      exists: true,
      created: false,
      reason: 'duplicate',
      matches: searchResult.matches,
    };
  }

  // 2. Format Published Date (Ensure YYYY-MM-DD format)
  let formattedDate = published.trim();
  if (formattedDate.includes('T')) {
    formattedDate = formattedDate.split('T')[0];
  }

  // 3. Create Page in Notion
  const endpoint = 'https://api.notion.com/v1/pages';

  const body = {
    parent: {
      type: 'database_id',
      database_id: NOTION_DATABASE_ID,
    },
    properties: {
      Title: {
        title: [
          {
            type: 'text',
            text: {
              content: title.trim(),
            },
          },
        ],
      },
      Authors: {
        rich_text: createRichTextChunks(authors.trim()),
      },
      'ArXiv URL': {
        url: arxiv_url.trim(),
      },
      Published: {
        date: {
          start: formattedDate,
        },
      },
      Summary: {
        rich_text: createRichTextChunks(summary.trim()),
      },
    },
  };

  let response: Response;
  try {
    response = await customFetch(endpoint, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Failed to create page in Notion: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.message || response.statusText || 'Unknown error';
    throw new Error(
      `Notion API error creating page (HTTP ${response.status}): ${message}`
    );
  }

  const data = await response.json();

  return {
    exists: false,
    created: true,
    page_id: data.id,
    page_url: data.url,
    status: 'created',
    title: title.trim(),
    arxiv_url: arxiv_url.trim(),
  };
}

/**
 * Updates an existing paper's Summary property in Notion.
 * Only modifies the Summary property.
 */
export async function updateNotionPaper(
  params: UpdateNotionPaperParams,
  customFetch: typeof fetch = fetch,
  overrideToken?: string
): Promise<UpdateNotionPaperResponse> {
  const { page_id, summary } = params;

  if (!page_id || page_id.trim() === '') {
    throw new Error('page_id is required.');
  }
  if (!summary || summary.trim() === '') {
    throw new Error('summary is required.');
  }

  const token = overrideToken || getNotionToken();
  const endpoint = `https://api.notion.com/v1/pages/${page_id.trim()}`;

  const body = {
    properties: {
      Summary: {
        rich_text: createRichTextChunks(summary.trim()),
      },
    },
  };

  let response: Response;
  try {
    response = await customFetch(endpoint, {
      method: 'PATCH',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Failed to update page in Notion: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.message || response.statusText || 'Unknown error';
    throw new Error(
      `Notion API error updating page (HTTP ${response.status}): ${message}`
    );
  }

  const data = await response.json();

  return {
    page_id: data.id,
    page_url: data.url,
    updated_fields: ['Summary'],
    status: 'updated',
  };
}
