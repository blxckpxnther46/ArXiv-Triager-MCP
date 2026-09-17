import { z } from 'zod';
import { updateNotionPaper } from '../notion.js';

export const updateNotionPaperSchema = {
  page_id: z.string().min(1).describe('Notion page ID of the paper to update'),
  summary: z.string().min(1).describe('Updated paper summary text'),
};

export async function handleUpdateNotionPaper(args: { page_id: string; summary: string }) {
  try {
    const result = await updateNotionPaper(args);
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
