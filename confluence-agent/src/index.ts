import { sessionExecutor, Session } from '@careai/agent-server';
import { Agent, tool } from '@openai/agents';
import { z } from 'zod';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Dict } from '@careai/agent-core';

dotenv.config();

const { CONFLUENCE_BASE_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN } = process.env;

// Validate required environment variables
if (!CONFLUENCE_BASE_URL || !ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) {
  throw new Error('Missing required environment variables: CONFLUENCE_BASE_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN');
}

// Define the Confluence search tool based on mcp-confluence.js
const searchConfluenceTool = tool({
  name: 'search_confluence',
  description: 'Search Confluence pages by keyword to find relevant documentation and information',
  parameters: z.object({
    query: z.string().describe('Search term for Confluence content'),
  }),
  execute: async ({ query }) => {
    try {
      const url = `${CONFLUENCE_BASE_URL}/wiki/rest/api/content/search?cql=text~"${encodeURIComponent(query)}"`;
      const response = await fetch(url, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString("base64"),
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Confluence API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;

      if (!data.results?.length) {
        return {
          success: true,
          results: [],
          message: `No results found for "${query}". Try different keywords or check if the content exists.`,
        };
      }

      const results = data.results
        .slice(0, 10) // Limit to top 10 results
        .map((page: any) => ({
          title: page.title,
          url: `${CONFLUENCE_BASE_URL}/wiki${page._links.webui}`,
          excerpt: page.excerpt || 'No excerpt available',
          type: page.type,
          space: page.space?.name || 'Unknown space',
          lastModified: page.version?.when ? new Date(page.version.when).toLocaleDateString() : 'Unknown',
        }));

      return {
        success: true,
        results,
        message: `Found ${results.length} results for "${query}"`,
      };
    } catch (error) {
      console.error('Confluence search error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Failed to search Confluence. Please check your configuration and try again.',
      };
    }
  },
});

// Define the Confluence page content tool based on mcp-confluence.js
const getConfluencePageTool = tool({
  name: 'get_confluence_page',
  description: 'Fetch the full content (title and HTML) of a Confluence page by URL',
  parameters: z.object({
    url: z.string().describe('Confluence page URL returned by search_confluence'),
  }),
  execute: async ({ url }) => {
    try {
      if (!CONFLUENCE_BASE_URL || !ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) {
        return {
          success: false,
          error: 'Missing required environment variables for Confluence access',
          message: 'Confluence configuration is incomplete. Please check your environment variables.',
        };
      }

      // Derive content ID from provided URL; supports both ?pageId=... and /pages/{id}/... forms
      let contentId = "";
      try {
        const parsedUrl = new URL(url, CONFLUENCE_BASE_URL);
        contentId = parsedUrl.searchParams.get("pageId") || "";
        if (!contentId) {
          const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
          const pagesIndex = pathParts.findIndex((p) => p === "pages");
          if (pagesIndex !== -1 && pathParts[pagesIndex + 1] && /^\d+$/.test(pathParts[pagesIndex + 1])) {
            contentId = pathParts[pagesIndex + 1];
          }
        }
      } catch (_) {
        // If URL constructor fails, fall back to simple parsing
      }

      if (!contentId) {
        return {
          success: false,
          error: 'Unable to extract Confluence page ID from URL',
          message: 'Unable to extract Confluence page ID from the provided URL. Please provide a URL containing either "?pageId=..." or "/pages/{id}/...".',
        };
      }

      const apiUrl = `${CONFLUENCE_BASE_URL}/wiki/rest/api/content/${contentId}?expand=body.storage,version,history,space,metadata.labels`;
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString("base64"),
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          error: `Failed to fetch page ${contentId}: ${response.status} ${response.statusText}`,
          message: `Failed to fetch page ${contentId}: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}`,
        };
      }

      const data = await response.json() as any;
      const title = data.title || "Untitled";
      const html = data.body?.storage?.value || "";
      const webUrl = `${CONFLUENCE_BASE_URL}/wiki${data._links?.webui || ""}`;
      const space = data.space?.name || "Unknown space";
      const lastModified = data.version?.when ? new Date(data.version.when).toLocaleDateString() : "Unknown";
      const labels = data.metadata?.labels?.results?.map((label: any) => label.name) || [];

      return {
        success: true,
        page: {
          title,
          url: webUrl,
          content: html,
          space,
          lastModified,
          labels,
          contentId,
        },
        message: `Successfully fetched page: ${title}`,
      };
    } catch (error) {
      console.error('Confluence page fetch error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        message: 'Failed to fetch Confluence page. Please check the URL and try again.',
      };
    }
  },
});

// Create the agent executor using care-agent-sdk patterns
export default sessionExecutor()
  .info({
    name: 'confluence-assistant',
    description: 'AI assistant that helps you search and find information in Confluence documentation',
    version: '1.0.0',
    details: {
      capabilities: ['confluence-search', 'documentation-help'],
      supportedLanguages: ['en'],
    },
  })
  .authorizeAllAuthenticated()
  .initializeBasic()
  .agentFactory(async (session: Session<Dict>) => {
    const { caller, conversationId } = session;

    return new Agent({
      name: 'confluence-assistant',
      model: 'gpt-4o',
      modelSettings: {
        temperature: 0.3,
      },
      instructions: `You are a helpful AI assistant specialized in searching and finding information in Confluence documentation.

You have two powerful tools to help users find and access Confluence content:

1. **search_confluence** - Search for Confluence pages by keyword
2. **get_confluence_page** - Fetch the full content of a specific Confluence page

When users ask questions or need information, you should:

1. Use the search_confluence tool to find relevant documentation
2. Analyze the search results and provide helpful summaries
3. If users want to see the full content of a specific page, use get_confluence_page with the URL from search results
4. Direct users to specific Confluence pages when relevant
5. Help users refine their search queries if initial results aren't helpful

Guidelines:
- Always use the search_confluence tool when users ask about documentation, processes, or information that might be in Confluence
- When users want to read the full content of a page, use get_confluence_page with the URL from search results
- Provide clear, concise summaries of search results and page content
- Include direct links to relevant Confluence pages
- If no results are found, suggest alternative search terms or approaches
- Be helpful and professional in your responses
- If users ask about topics unrelated to Confluence, politely redirect them to use the search functionality

Current user: ${caller.id}
Conversation ID: ${conversationId}`,
      tools: [searchConfluenceTool, getConfluencePageTool],
    }) as any;
  })
  .build();
