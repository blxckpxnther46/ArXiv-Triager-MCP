import { XMLParser } from 'fast-xml-parser';
import { ArxivPaper, SearchArxivParams } from './types.js';

const ARXIV_API_URL = 'https://export.arxiv.org/api/query';

/**
 * Normalizes multiline text by converting all whitespace sequences (newlines, tabs, multiple spaces)
 * into single spaces and trimming leading/trailing whitespace.
 */
function normalizeWhitespace(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Searches the public arXiv API for academic papers.
 */
export async function searchArxiv(
  params: SearchArxivParams,
  customFetch: typeof fetch = fetch
): Promise<ArxivPaper[]> {
  const {
    search_query,
    start = 0,
    max_results = 10,
    sortBy,
    sortOrder,
  } = params;

  if (!search_query || search_query.trim() === '') {
    throw new Error('search_query is required and cannot be empty.');
  }

  // Enforce max_results limit of 10 as specified
  const limit = Math.min(10, Math.max(1, max_results));

  const url = new URL(ARXIV_API_URL);
  url.searchParams.set('search_query', search_query);
  url.searchParams.set('start', Math.max(0, start).toString());
  url.searchParams.set('max_results', limit.toString());

  if (sortBy) {
    url.searchParams.set('sortBy', sortBy);
  }
  if (sortOrder) {
    url.searchParams.set('sortOrder', sortOrder);
  }

  let response: Response;
  try {
    response = await customFetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'ArXiv-Triager-MCP/1.0',
      },
    });
  } catch (err) {
    throw new Error(
      `Failed to connect to arXiv API: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (response.status === 429 || response.status === 503) {
    throw new Error(
      `arXiv API rate limit reached (HTTP ${response.status}). Please wait before sending another search request.`
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `arXiv API error (HTTP ${response.status}): ${errorText || response.statusText}`
    );
  }

  const xmlData = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'entry' || name === 'author' || name === 'link' || name === 'category',
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlData);
  } catch (err) {
    throw new Error('Failed to parse XML response from arXiv API.');
  }

  const feed = parsed?.feed;
  if (!feed) {
    return [];
  }

  const entries: any[] = feed.entry || [];

  return entries.map((entry: any): ArxivPaper => {
    const rawId = typeof entry.id === 'string' ? entry.id.trim() : '';
    
    // Title
    const rawTitle = typeof entry.title === 'string' ? entry.title : entry.title?.['#text'] || '';
    const title = normalizeWhitespace(rawTitle);

    // Summary / Abstract
    const rawSummary = typeof entry.summary === 'string' ? entry.summary : entry.summary?.['#text'] || '';
    const summary = normalizeWhitespace(rawSummary);

    // Authors
    const authorEntries: any[] = entry.author || [];
    const authors = authorEntries
      .map((a: any) => {
        if (typeof a === 'string') return a;
        if (typeof a?.name === 'string') return a.name;
        if (typeof a?.name?.['#text'] === 'string') return a.name['#text'];
        return '';
      })
      .map(normalizeWhitespace)
      .filter((name: string) => name.length > 0);

    // Publication dates
    const published = typeof entry.published === 'string' ? entry.published.trim() : '';
    const updated = typeof entry.updated === 'string' ? entry.updated.trim() : '';

    // URL resolution
    const links: any[] = entry.link || [];
    const alternateLink = links.find((l: any) => l['@_rel'] === 'alternate' || l['@_type'] === 'text/html');
    let paperUrl = alternateLink?.['@_href'] || rawId;
    if (paperUrl.startsWith('http://')) {
      paperUrl = paperUrl.replace(/^http:\/\//, 'https://');
    }

    // Categories
    const categoriesList: any[] = entry.category || [];
    const categories = categoriesList
      .map((c: any) => c['@_term'])
      .filter((term: any): term is string => typeof term === 'string' && term.length > 0);

    return {
      id: rawId,
      title,
      authors,
      summary,
      published,
      updated,
      url: paperUrl,
      categories,
    };
  });
}
