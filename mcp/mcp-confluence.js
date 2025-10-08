import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const { ATLASSIAN_BASE_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN } = process.env;

const mcp = new McpServer({ name: "ConfluenceMCP", version: "1.0.0" });

mcp.tool(
  "search_confluence",
  "Search Confluence pages by keyword",
  { query: z.string().describe("Search term for Confluence content") },
  async ({ query }) => {
    try {
      const url = `${ATLASSIAN_BASE_URL}/wiki/rest/api/content/search?cql=text~"${encodeURIComponent(query)}"`;
      const response = await fetch(url, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString("base64"),
          Accept: "application/json",
        },
      });
      const data = await response.json();

      if (!data.results?.length) {
        return { content: [{ type: "text", text: `No results found for "${query}".` }] };
      }

      const pages = data.results
        .slice(0, 5)
        .map((p) => `• ${p.title} — ${ATLASSIAN_BASE_URL}/wiki${p._links.webui}`);

      return {
        content: [
          { type: "text", text: `Top Confluence results for "${query}":\n${pages.join("\n")}` },
        ],
      };
    } catch (err) {
      console.error(err);
      return { content: [{ type: "text", text: "Error fetching from Confluence." }], isError: true };
    }
  }
);

// Fetch a Confluence page's content (HTML) given a URL from search results
mcp.tool(
  "get_confluence_page",
  "Fetch Confluence page content (title and HTML) by URL",
  { url: z.string().describe("Confluence page URL returned by search_confluence") },
  async ({ url }) => {
    try {
      if (!ATLASSIAN_BASE_URL || !ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) {
        return {
          content: [
            { type: "text", text: "Missing required environment variables for Confluence access." },
          ],
          isError: true,
        };
      }

      // Derive content ID from provided URL; supports both ?pageId=... and /pages/{id}/... forms
      let contentId = "";
      try {
        const parsedUrl = new URL(url, ATLASSIAN_BASE_URL);
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
          content: [
            {
              type: "text",
              text:
                "Unable to extract Confluence page ID from the provided URL. Please provide a URL containing either '?pageId=...' or '/pages/{id}/...'.",
            },
          ],
          isError: true,
        };
      }

      const apiUrl = `${ATLASSIAN_BASE_URL}/wiki/rest/api/content/${contentId}?expand=body.storage,version,history,space,metadata.labels`;
      const response = await fetch(apiUrl, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString("base64"),
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Failed to fetch page ${contentId}: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}`,
            },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      const title = data.title || "Untitled";
      const html = data.body?.storage?.value || "";
      const webUrl = `${ATLASSIAN_BASE_URL}/wiki${data._links?.webui || ""}`;

      return {
        content: [
          { type: "text", text: `Title: ${title}` },
          { type: "text", text: `URL: ${webUrl}` },
          { type: "text", text: html },
        ],
      };
    } catch (err) {
      console.error(err);
      return { content: [{ type: "text", text: "Error fetching Confluence page." }], isError: true };
    }
  }
);

// Find solution-oriented pages for a described issue, returning title, URL, and an excerpt
mcp.tool(
  "search_confluence_solutions",
  "Find troubleshooting/how-to Confluence pages relevant to a described issue",
  {
    issue: z.string().describe("Describe your problem or error to find solutions"),
    spaces: z.array(z.string()).optional().describe("Optional space keys to restrict the search (e.g., ENG, DOCS)"),
    labels: z.array(z.string()).optional().describe("Optional extra labels to prioritize (e.g., troubleshooting)"),
    limit: z.number().int().min(1).max(20).optional().describe("Max results to return (default 5)"),
  },
  async ({ issue, spaces, labels, limit }) => {
    try {
      if (!ATLASSIAN_BASE_URL || !ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) {
        return {
          content: [
            { type: "text", text: "Missing required environment variables for Confluence access." },
          ],
          isError: true,
        };
      }

      const defaultLabels = [
        "troubleshooting",
        "how-to",
        "kb-how-to-article",
        "resolution",
        "fix",
        "setup",
        "install",
        "configure",
      ];
      const prioritizedLabels = Array.from(new Set([...(labels || []), ...defaultLabels]));

      const titleKeywords = [
        "troubleshoot",
        "solution",
        "resolve",
        "error",
        "fix",
        "how to",
        "how-to",
        "setup",
        "install",
        "configure",
        "guide",
      ];

      const labelCql = prioritizedLabels
        .map((l) => `label = \"${l.replace(/\"/g, '\\\"')}\"`)
        .join(" OR ");
      const titleCql = titleKeywords
        .map((k) => `title ~ \"${k.replace(/\"/g, '\\\"')}\"`)
        .join(" OR ");

      let spaceCql = "";
      if (spaces && spaces.length > 0) {
        const spaceExpr = spaces
          .map((s) => `space = \"${s.replace(/\"/g, '\\\"')}\"`)
          .join(" OR ");
        spaceCql = `(${spaceExpr})`;
      }

      const issueEscaped = issue.replace(/\"/g, '\\\"');
      const cqlParts = [
        "type = page",
        `(text ~ \"${issueEscaped}\")`,
        `(${titleCql})`,
        `(${labelCql})`,
      ];
      if (spaceCql) cqlParts.push(spaceCql);

      const cql = `${cqlParts.join(" AND ")} order by lastmodified desc`;
      const max = typeof limit === "number" ? limit : 5;
      const url = `${ATLASSIAN_BASE_URL}/wiki/rest/api/search?cql=${encodeURIComponent(cql)}&limit=${max}`;

      const response = await fetch(url, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString("base64"),
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Failed to search solutions: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}`,
            },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results : [];
      if (results.length === 0) {
        return { content: [{ type: "text", text: `No solution-like pages found for: ${issue}` }] };
      }

      const items = results.slice(0, max).map((r) => {
        const title = r.content?.title || r.title || "Untitled";
        const webui = r.content?._links?.webui || r.url || "";
        const pageUrl = webui.startsWith("http") ? webui : `${ATLASSIAN_BASE_URL}/wiki${webui}`;
        const rawExcerpt = r.excerpt || r.content?.excerpt || "";
        const textExcerpt = rawExcerpt
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 400);
        return `• ${title}\n  ${pageUrl}\n  ${textExcerpt}`;
      });

      return {
        content: [
          { type: "text", text: `Top solution-focused results for:\n\"${issue}\"\n\n${items.join("\n\n")}` },
        ],
      };
    } catch (err) {
      console.error(err);
      return { content: [{ type: "text", text: "Error searching for solutions in Confluence." }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await mcp.connect(transport);
console.error("Confluence MCP server ready on stdio");