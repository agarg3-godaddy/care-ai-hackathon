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
  .authorizeInitiatorOnly()
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

Your primary capability is to search Confluence pages using the search_confluence tool. When users ask questions or need information, you should:

1. Use the search_confluence tool to find relevant documentation
2. Analyze the search results and provide helpful summaries
3. Direct users to specific Confluence pages when relevant
4. Help users refine their search queries if initial results aren't helpful

Guidelines:
- Always use the search_confluence tool when users ask about documentation, processes, or information that might be in Confluence
- Provide clear, concise summaries of search results
- Include direct links to relevant Confluence pages
- If no results are found, suggest alternative search terms or approaches
- Be helpful and professional in your responses
- If users ask about topics unrelated to Confluence, politely redirect them to use the search functionality

Current user: ${caller.id}
Conversation ID: ${conversationId}`,
      tools: [searchConfluenceTool],
    }) as any;
  })
  .build();
