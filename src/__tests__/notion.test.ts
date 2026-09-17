import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchNotionPapers,
  savePaperToNotion,
  updateNotionPaper,
  createRichTextChunks,
  NOTION_DATA_SOURCE_ID,
  NOTION_DATABASE_ID,
} from '../notion.js';

describe('Notion Integration Service', () => {
  const mockToken = 'secret_test_notion_token_12345';
  const testArxivUrl = 'https://arxiv.org/abs/2301.12345';

  it('correctly chunks long text into 2000 character blocks', () => {
    const longText = 'a'.repeat(4500);
    const chunks = createRichTextChunks(longText);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].text.content.length, 2000);
    assert.equal(chunks[1].text.content.length, 2000);
    assert.equal(chunks[2].text.content.length, 500);
  });

  it('returns exists: true and matches when duplicate paper found in Notion', async () => {
    const mockFetch: typeof fetch = async (url, init) => {
      assert.equal(url.toString(), `https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`);
      const body = JSON.parse(init?.body as string);
      assert.equal(body.filter.property, 'ArXiv URL');
      assert.equal(body.filter.url.equals, testArxivUrl);

      return new Response(
        JSON.stringify({
          object: 'list',
          results: [
            {
              id: 'page_id_123',
              url: 'https://notion.so/page_id_123',
              properties: {
                'ArXiv URL': { url: testArxivUrl },
                Title: { title: [{ plain_text: 'Existing Paper Title' }] },
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const result = await searchNotionPapers(testArxivUrl, mockFetch, mockToken);
    assert.equal(result.exists, true);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].page_id, 'page_id_123');
    assert.equal(result.matches[0].title, 'Existing Paper Title');
  });

  it('returns exists: false when no duplicate paper found in Notion', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({ object: 'list', results: [] }),
        { status: 200 }
      );
    };

    const result = await searchNotionPapers(testArxivUrl, mockFetch, mockToken);
    assert.equal(result.exists, false);
    assert.deepEqual(result.matches, []);
  });

  it('prevents saving duplicates when paper already exists in Notion', async () => {
    const mockFetch: typeof fetch = async (url) => {
      // Query response returning existing page
      if (url.toString().includes('/query')) {
        return new Response(
          JSON.stringify({
            object: 'list',
            results: [
              {
                id: 'existing_page_999',
                url: 'https://notion.so/existing_page_999',
                properties: {
                  'ArXiv URL': { url: testArxivUrl },
                  Title: { title: [{ plain_text: 'Attention Is All You Need' }] },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      assert.fail('Should not attempt to create a page if duplicate exists');
    };

    const saveResult = await savePaperToNotion(
      {
        title: 'Attention Is All You Need',
        authors: 'Vaswani et al.',
        arxiv_url: testArxivUrl,
        published: '2023-01-20',
        summary: 'Transformer architecture paper.',
      },
      mockFetch,
      mockToken
    );

    assert.equal(saveResult.exists, true);
    assert.equal(saveResult.created, false);
    assert.equal(saveResult.reason, 'duplicate');
    assert.equal(saveResult.matches?.length, 1);
  });

  it('creates new page when paper does not exist in Notion', async () => {
    let pageCreated = false;

    const mockFetch: typeof fetch = async (url, init) => {
      if (url.toString().includes('/query')) {
        return new Response(
          JSON.stringify({ object: 'list', results: [] }),
          { status: 200 }
        );
      }

      if (url.toString() === 'https://api.notion.com/v1/pages') {
        pageCreated = true;
        const body = JSON.parse(init?.body as string);
        assert.equal(body.parent.database_id, NOTION_DATABASE_ID);
        assert.equal(body.properties.Title.title[0].text.content, 'New AI Research Paper');
        assert.equal(body.properties.Published.date.start, '2023-01-20');

        return new Response(
          JSON.stringify({
            id: 'created_page_001',
            url: 'https://notion.so/created_page_001',
          }),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const saveResult = await savePaperToNotion(
      {
        title: 'New AI Research Paper',
        authors: 'Alice, Bob',
        arxiv_url: testArxivUrl,
        published: '2023-01-20T18:00:00Z',
        summary: 'A novel neural architecture.',
      },
      mockFetch,
      mockToken
    );

    assert.equal(pageCreated, true);
    assert.equal(saveResult.created, true);
    assert.equal(saveResult.page_id, 'created_page_001');
    assert.equal(saveResult.status, 'created');
  });

  it('updates page summary property in Notion', async () => {
    const pageId = 'target_page_777';

    const mockFetch: typeof fetch = async (url, init) => {
      assert.equal(url.toString(), `https://api.notion.com/v1/pages/${pageId}`);
      assert.equal(init?.method, 'PATCH');
      const body = JSON.parse(init?.body as string);
      assert.ok(body.properties.Summary);
      assert.equal(body.properties.Summary.rich_text[0].text.content, 'Updated paper summary text');

      return new Response(
        JSON.stringify({
          id: pageId,
          url: `https://notion.so/${pageId}`,
        }),
        { status: 200 }
      );
    };

    const updateResult = await updateNotionPaper(
      { page_id: pageId, summary: 'Updated paper summary text' },
      mockFetch,
      mockToken
    );

    assert.equal(updateResult.page_id, pageId);
    assert.equal(updateResult.status, 'updated');
    assert.deepEqual(updateResult.updated_fields, ['Summary']);
  });

  it('does NOT treat 403 / 401 / 404 / 429 as "not found" and throws structured errors', async () => {
    const errorCodes = [400, 401, 403, 404, 429];

    for (const statusCode of errorCodes) {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({
            object: 'error',
            status: statusCode,
            code: 'unauthorized_or_forbidden',
            message: `Notion API error with code ${statusCode}`,
          }),
          { status: statusCode }
        );
      };

      await assert.rejects(
        async () => {
          await searchNotionPapers(testArxivUrl, mockFetch, mockToken);
        },
        (err: Error) => {
          return err.message.includes(`Notion API error (HTTP ${statusCode})`);
        }
      );
    }
  });

  it('throws an error if NOTION_TOKEN is not set', async () => {
    const originalToken = process.env.NOTION_TOKEN;
    delete process.env.NOTION_TOKEN;

    try {
      await assert.rejects(
        async () => {
          await searchNotionPapers(testArxivUrl);
        },
        (err: Error) => {
          return err.message.includes('NOTION_TOKEN environment variable is not set');
        }
      );
    } finally {
      if (originalToken) {
        process.env.NOTION_TOKEN = originalToken;
      }
    }
  });
});
