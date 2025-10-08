import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import fetch from 'node-fetch';

export class ConfluenceSearchTool extends DynamicStructuredTool {
  constructor(baseUrl, email, apiToken) {
    super({
      name: 'search_confluence',
      description: 'Search Confluence pages by keyword to find relevant documentation and information',
      schema: z.object({
        query: z.string().describe('Search term for Confluence content'),
      }),
      func: async ({ query }) => {
        try {
          const authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
          const url = `${baseUrl}/wiki/rest/api/content/search?cql=text~"${encodeURIComponent(query)}"`;
          
          const response = await fetch(url, {
            headers: {
              Authorization: authHeader,
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(`Confluence API error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();

          if (!data.results?.length) {
            return `No results found for "${query}". Try different keywords or check if the content exists.`;
          }

          const results = data.results
            .slice(0, 10)
            .map((page) => ({
              title: page.title,
              url: `${baseUrl}/wiki${page._links.webui}`,
              excerpt: page.excerpt || 'No excerpt available',
              type: page.type,
              space: page.space?.name || 'Unknown space',
              lastModified: page.version?.when ? new Date(page.version.when).toLocaleDateString() : 'Unknown',
            }));

          return `Found ${results.length} results for "${query}":\n\n` +
            results.map((result, index) => 
              `${index + 1}. **${result.title}**\n` +
              `   URL: ${result.url}\n` +
              `   Space: ${result.space}\n` +
              `   Last Modified: ${result.lastModified}\n` +
              `   Excerpt: ${result.excerpt}\n`
            ).join('\n');
        } catch (error) {
          return `Error searching Confluence: ${error.message}`;
        }
      },
    });
  }
}

export class ConfluencePageTool extends DynamicStructuredTool {
  constructor(baseUrl, email, apiToken) {
    super({
      name: 'get_confluence_page',
      description: 'Fetch the full content (title and HTML) of a Confluence page by URL',
      schema: z.object({
        url: z.string().describe('Confluence page URL returned by search_confluence'),
      }),
      func: async ({ url }) => {
        try {
          const authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
          
          // Extract content ID from URL
          let contentId = "";
          try {
            const parsedUrl = new URL(url, baseUrl);
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
            return 'Unable to extract Confluence page ID from URL. Please provide a URL containing either "?pageId=..." or "/pages/{id}/...".';
          }

          const apiUrl = `${baseUrl}/wiki/rest/api/content/${contentId}?expand=body.storage,version,history,space,metadata.labels`;
          const response = await fetch(apiUrl, {
            headers: {
              Authorization: authHeader,
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            const errText = await response.text();
            return `Failed to fetch page ${contentId}: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}`;
          }

          const data = await response.json();
          const title = data.title || "Untitled";
          const html = data.body?.storage?.value || "";
          const webUrl = `${baseUrl}/wiki${data._links?.webui || ""}`;
          const space = data.space?.name || "Unknown space";
          const lastModified = data.version?.when ? new Date(data.version.when).toLocaleDateString() : "Unknown";
          const labels = data.metadata?.labels?.results?.map((label) => label.name) || [];

          return `**Page: ${title}**\n` +
            `URL: ${webUrl}\n` +
            `Space: ${space}\n` +
            `Last Modified: ${lastModified}\n` +
            `Labels: ${labels.join(', ') || 'None'}\n\n` +
            `**Content:**\n${html}`;
        } catch (error) {
          return `Error fetching Confluence page: ${error.message}`;
        }
      },
    });
  }
}
