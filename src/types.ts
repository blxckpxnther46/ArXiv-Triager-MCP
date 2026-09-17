export interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  updated: string;
  url: string;
  categories: string[];
}

export interface SearchArxivParams {
  search_query: string;
  start?: number;
  max_results?: number;
  sortBy?: 'relevance' | 'submittedDate' | 'lastUpdatedDate';
  sortOrder?: 'ascending' | 'descending';
}

export interface SearchNotionPapersParams {
  arxiv_url: string;
}

export interface SavePaperToNotionParams {
  title: string;
  authors: string;
  arxiv_url: string;
  published: string;
  summary: string;
}

export interface UpdateNotionPaperParams {
  page_id: string;
  summary: string;
}

export interface NotionMatch {
  page_id: string;
  page_url: string;
  arxiv_url: string;
  title: string;
}

export interface SearchNotionPapersResponse {
  exists: boolean;
  matches: NotionMatch[];
}

export interface SavePaperToNotionResponse {
  exists?: boolean;
  created: boolean;
  reason?: string;
  page_id?: string;
  page_url?: string;
  status?: string;
  title?: string;
  arxiv_url?: string;
  matches?: NotionMatch[];
}

export interface UpdateNotionPaperResponse {
  page_id: string;
  page_url?: string;
  updated_fields: string[];
  status: string;
}

export interface NotionApiError {
  object: string;
  status: number;
  code: string;
  message: string;
}
