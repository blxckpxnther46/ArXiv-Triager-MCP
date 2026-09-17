import { z } from 'zod';
import { searchArxiv } from '../arxiv.js';

export const searchArxivSchema = {
  search_query: z
    .string()
    .min(1)
    .describe('Search query for arXiv papers (e.g. cat:cs.AI OR ti:transformer)'),
  start: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe('Zero-based start index for pagination'),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(10)
    .describe('Maximum number of paper results to return (max 10)'),
  sortBy: z
    .enum(['relevance', 'submittedDate', 'lastUpdatedDate'])
    .optional()
    .describe('Sort criterion for search results'),
  sortOrder: z
    .enum(['ascending', 'descending'])
    .optional()
    .describe('Sort direction for search results'),
};

export async function handleSearchArxiv(args: {
  search_query: string;
  start?: number;
  max_results?: number;
  sortBy?: 'relevance' | 'submittedDate' | 'lastUpdatedDate';
  sortOrder?: 'ascending' | 'descending';
}) {
  try {
    const papers = await searchArxiv(args);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(papers, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
    };
  }
}
