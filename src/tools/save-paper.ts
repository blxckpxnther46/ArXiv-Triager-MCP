import { z } from 'zod';
import { savePaperToNotion } from '../notion.js';

export const savePaperToNotionSchema = {
  title: z.string().min(1).describe('Paper title'),
  authors: z.string().min(1).describe('Paper authors (comma-separated or text string)'),
  arxiv_url: z.string().url().describe('Exact ArXiv paper URL'),
  published: z.string().min(1).describe('Publication date (e.g. YYYY-MM-DD or ISO string)'),
  summary: z.string().min(1).describe('Paper abstract or summary text'),
};

export async function handleSavePaperToNotion(args: {
  title: string;
  authors: string;
  arxiv_url: string;
  published: string;
  summary: string;
}) {
  try {
    const result = await savePaperToNotion(args);
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
