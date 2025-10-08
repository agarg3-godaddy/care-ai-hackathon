import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const { CONFLUENCE_BASE_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN } = process.env;

const mcp = new McpServer({ name: "ConfluenceMCP", version: "1.0.0" });

mcp.tool(
  "search_confluence",
  "Search Confluence pages by keyword",
  { query: z.string().describe("Search term for Confluence content") },
  async ({ query }) => {
    try {
      const url = `${CONFLUENCE_BASE_URL}/wiki/rest/api/content/search?cql=text~"${encodeURIComponent(query)}"`;
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
        .map((p) => `• ${p.title} — ${CONFLUENCE_BASE_URL}/wiki${p._links.webui}`);

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

const transport = new StdioServerTransport();
await mcp.connect(transport);
console.error("Confluence MCP server ready on stdio");