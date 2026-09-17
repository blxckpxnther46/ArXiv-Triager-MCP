import { z } from 'zod';
import { searchNotionPapers } from '../notion.js';

export const searchNotionPapersSchema = {
  arxiv_url: z
    .string()
    .url()
    .describe('Exact arXiv URL to search for in Notion database'),
};

export async function handleSearchNotionPapers(args: { arxiv_url: string }) {
  try {
    const result = await searchNotionPapers(args.arxiv_url);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
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
