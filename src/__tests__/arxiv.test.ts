import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchArxiv } from '../arxiv.js';

describe('arXiv API Search Service', () => {
  it('parses valid arXiv Atom XML response correctly', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.12345v1</id>
    <published>2023-01-20T18:00:00Z</published>
    <updated>2023-01-20T18:00:00Z</updated>
    <title>  Attention Is All  \n You Need  </title>
    <summary>  The dominant sequence transduction  \n models are based on complex RNNs.  </summary>
    <author>
      <name>Ashish Vaswani</name>
    </author>
    <author>
      <name>Noam Shazeer</name>
    </author>
    <link rel="alternate" href="http://arxiv.org/abs/2301.12345" type="text/html"/>
    <category term="cs.CL"/>
    <category term="cs.AI"/>
  </entry>
</feed>`;

    const mockFetch: typeof fetch = async () => {
      return new Response(mockXml, {
        status: 200,
        headers: { 'Content-Type': 'application/atom+xml' },
      });
    };

    const papers = await searchArxiv(
      { search_query: 'cat:cs.CL', max_results: 5 },
      mockFetch
    );

    assert.equal(papers.length, 1);
    const paper = papers[0];
    assert.equal(paper.title, 'Attention Is All You Need');
    assert.equal(paper.summary, 'The dominant sequence transduction models are based on complex RNNs.');
    assert.deepEqual(paper.authors, ['Ashish Vaswani', 'Noam Shazeer']);
    assert.equal(paper.url, 'https://arxiv.org/abs/2301.12345');
    assert.deepEqual(paper.categories, ['cs.CL', 'cs.AI']);
    assert.equal(paper.published, '2023-01-20T18:00:00Z');
  });

  it('handles empty results feed gracefully', async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"></feed>`;

    const mockFetch: typeof fetch = async () => {
      return new Response(mockXml, { status: 200 });
    };

    const papers = await searchArxiv({ search_query: 'nonexistentpaperquery' }, mockFetch);
    assert.deepEqual(papers, []);
  });

  it('throws a clean rate limit error on HTTP 429 or 503', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Rate limit exceeded', { status: 429 });
    };

    await assert.rejects(
      async () => {
        await searchArxiv({ search_query: 'ai' }, mockFetch);
      },
      (err: Error) => {
        return err.message.includes('arXiv API rate limit reached') && err.message.includes('429');
      }
    );
  });

  it('throws an error on network/connection failure', async () => {
    const mockFetch: typeof fetch = async () => {
      throw new TypeError('Network connection reset');
    };

    await assert.rejects(
      async () => {
        await searchArxiv({ search_query: 'ai' }, mockFetch);
      },
      (err: Error) => {
        return err.message.includes('Failed to connect to arXiv API');
      }
    );
  });

  it('validates empty search_query', async () => {
    await assert.rejects(
      async () => {
        await searchArxiv({ search_query: '  ' });
      },
      (err: Error) => {
        return err.message.includes('search_query is required');
      }
    );
  });
});
