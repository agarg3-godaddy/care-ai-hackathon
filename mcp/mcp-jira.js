import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const { ATLASSIAN_BASE_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN } = process.env;

const mcp = new McpServer({ name: "JiraMCP", version: "1.0.0" });

// Search Jira issues by JQL or free text
mcp.tool(
  "search_jira",
  "Search Jira issues by JQL or free text query",
  {
    jql: z.string().optional().describe("JQL to execute (overrides query if provided)"),
    query: z.string().optional().describe("Free text to search in Jira issues"),
    maxResults: z.number().int().min(1).max(50).optional().describe("Max results to return (default 10)"),
    fields: z
      .array(z.string())
      .optional()
      .describe("Optional fields to return (e.g., ['summary','status','assignee'])"),
  },
  async ({ jql, query, maxResults, fields }) => {
    try {
      if (!ATLASSIAN_BASE_URL || !ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) {
        return {
          content: [
            { type: "text", text: "Missing required environment variables for Jira access." },
          ],
          isError: true,
        };
      }

      const effectiveMax = typeof maxResults === "number" ? maxResults : 10;
      let effectiveJql = jql || "";

      if (!effectiveJql) {
        const q = (query || "").trim();
        if (!q) {
          return {
            content: [
              { type: "text", text: "Provide either 'jql' or a non-empty 'query' string." },
            ],
            isError: true,
          };
        }
        // Free text search using text ~ "..." across projects
        const escaped = q.replace(/\"/g, '\\"');
        effectiveJql = `text ~ \"${escaped}\" order by updated desc`;
      }

      const apiUrl = `${ATLASSIAN_BASE_URL}/rest/api/3/search/jql`;
      const body = {
        jql: effectiveJql,
        maxResults: effectiveMax,
        fields: fields && fields.length ? fields : ["summary", "status", "assignee", "issuetype", "priority", "updated"],
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString("base64"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          content: [
            { type: "text", text: `Failed to search Jira: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}` },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      const issues = Array.isArray(data.issues) ? data.issues : [];
      if (issues.length === 0) {
        return { content: [{ type: "text", text: "No Jira issues found." }] };
      }

      const lines = issues.map((i) => {
        const key = i.key;
        const summary = i.fields?.summary || "";
        const status = i.fields?.status?.name || "";
        const assignee = i.fields?.assignee?.displayName || "Unassigned";
        const type = i.fields?.issuetype?.name || "";
        const url = `${ATLASSIAN_BASE_URL}/browse/${key}`;
        return `• ${key} [${type}] — ${status} — ${assignee}\n  ${summary}\n  ${url}`;
      });

      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    } catch (err) {
      console.error(err);
      return { content: [{ type: "text", text: "Error searching Jira." }], isError: true };
    }
  }
);

// Get Jira issue details by key
mcp.tool(
  "get_jira_issue",
  "Fetch a Jira issue by key (e.g., ENG-123)",
  { key: z.string().describe("Jira issue key, e.g., ENG-123") },
  async ({ key }) => {
    try {
      if (!ATLASSIAN_BASE_URL || !ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) {
        return {
          content: [
            { type: "text", text: "Missing required environment variables for Jira access." },
          ],
          isError: true,
        };
      }

      const apiUrl = `${ATLASSIAN_BASE_URL}/rest/api/3/issue/${encodeURIComponent(key)}?expand=renderedFields,changelog`;
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
            { type: "text", text: `Failed to fetch issue ${key}: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}` },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      const summary = data.fields?.summary || "";
      const descriptionHtml = data.renderedFields?.description || "";
      const status = data.fields?.status?.name || "";
      const assignee = data.fields?.assignee?.displayName || "Unassigned";
      const reporter = data.fields?.reporter?.displayName || "";
      const type = data.fields?.issuetype?.name || "";
      const url = `${ATLASSIAN_BASE_URL}/browse/${data.key}`;

      return {
        content: [
          { type: "text", text: `${data.key} [${type}] — ${status}` },
          { type: "text", text: `Assignee: ${assignee} | Reporter: ${reporter}` },
          { type: "text", text: `Summary: ${summary}` },
          { type: "text", text: `URL: ${url}` },
          { type: "text", text: descriptionHtml },
        ],
      };
    } catch (err) {
      console.error(err);
      return { content: [{ type: "text", text: "Error fetching Jira issue." }], isError: true };
    }
  }
);

// Natural language Jira search → JQL
mcp.tool(
  "search_jira_nl",
  "Search Jira with a natural language prompt (e.g., 'show issues assigned to me last week in ENG')",
  {
    prompt: z.string().describe("Natural language description of what to find"),
    maxResults: z.number().int().min(1).max(50).optional().describe("Max results to return (default 10)"),
    fields: z.array(z.string()).optional().describe("Optional fields to return"),
  },
  async ({ prompt, maxResults, fields }) => {
    try {
      if (!ATLASSIAN_BASE_URL || !ATLASSIAN_EMAIL || !ATLASSIAN_API_TOKEN) {
        return {
          content: [
            { type: "text", text: "Missing required environment variables for Jira access." },
          ],
          isError: true,
        };
      }

      const lower = prompt.toLowerCase();
      const conditions = [];

      if (/\bassigned to me\b/.test(lower)) conditions.push("assignee = currentUser()");
      if (/\breported by me\b/.test(lower)) conditions.push("reporter = currentUser()");
      if (/\bunassigned\b/.test(lower)) conditions.push("assignee is EMPTY");

      if (/\b(open|unresolved|not done|to ?do)\b/.test(lower)) conditions.push("resolution = Unresolved");
      if (/\b(done|closed|resolved)\b/.test(lower)) conditions.push("statusCategory = Done");
      if (/\bin progress\b/.test(lower)) conditions.push('statusCategory = "In Progress"');

      const projectMatch = prompt.match(/\b(?:in\s+)?project\s*[:=]?\s*([A-Z][A-Z0-9_]+)/i);
      if (projectMatch) conditions.push(`project = ${projectMatch[1].toUpperCase()}`);

      if (/\bbug\b/i.test(prompt)) conditions.push('issuetype = "Bug"');
      if (/\bstory\b/i.test(prompt)) conditions.push('issuetype = "Story"');
      if (/\btask\b/i.test(prompt)) conditions.push('issuetype = "Task"');

      if (/\bcritical\b/i.test(prompt)) conditions.push('priority = "Critical"');
      if (/\bblocker\b/i.test(prompt)) conditions.push('priority = "Blocker"');
      if (/\bhighest\b|\bp1\b/i.test(prompt)) conditions.push('priority = "Highest"');
      if (/\bhigh\b|\bp2\b/i.test(prompt)) conditions.push('priority = "High"');

      if (/\btoday\b/.test(lower)) conditions.push("updated >= startOfDay()");
      if (/\byesterday\b/.test(lower)) conditions.push("updated >= startOfDay(-1d) AND updated < startOfDay()");
      if (/\b(last|past)\s+week\b/.test(lower)) conditions.push("updated >= -1w");
      const lastNDays = prompt.match(/\blast\s+(\d{1,2})\s+days?/i);
      if (lastNDays) conditions.push(`updated >= -${lastNDays[1]}d`);
      if (/\bthis month\b/.test(lower)) conditions.push("updated >= startOfMonth()");

      const labelBlock = prompt.match(/\blabels?\s*[:=]\s*([\w, -]+)/i);
      if (labelBlock) {
        const labels = labelBlock[1]
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (labels.length) {
          const orExpr = labels.map((l) => `labels = \"${l.replace(/\"/g, '\\\"')}\"`).join(" OR ");
          conditions.push(`(${orExpr})`);
        }
      }

      const quotedPhrases = Array.from(prompt.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
      const textTerms = quotedPhrases.length ? quotedPhrases : [];
      if (!textTerms.length && conditions.length === 0) {
        const escaped = prompt.replace(/\"/g, '\\"');
        textTerms.push(escaped);
      }
      const textExpr = textTerms.length
        ? textTerms.map((t) => `text ~ \"${t.replace(/\"/g, '\\\"')}\"`).join(" AND ")
        : "";
      if (textExpr) conditions.push(textExpr);

      const jql = `${conditions.join(" AND ")} order by updated desc`.trim();

      const apiUrl = `${ATLASSIAN_BASE_URL}/rest/api/3/search/jql`;
      const body = {
        jql,
        maxResults: typeof maxResults === "number" ? maxResults : 10,
        fields: fields && fields.length ? fields : ["summary", "status", "assignee", "issuetype", "priority", "updated"],
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_API_TOKEN}`).toString("base64"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          content: [
            { type: "text", text: `Failed to search Jira (NL): ${response.status} ${response.statusText}\n${errText.slice(0, 500)}` },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      const issues = Array.isArray(data.issues) ? data.issues : [];
      if (issues.length === 0) {
        return { content: [{ type: "text", text: "No Jira issues found." }] };
      }

      const lines = issues.map((i) => {
        const key = i.key;
        const summary = i.fields?.summary || "";
        const status = i.fields?.status?.name || "";
        const assignee = i.fields?.assignee?.displayName || "Unassigned";
        const type = i.fields?.issuetype?.name || "";
        const url = `${ATLASSIAN_BASE_URL}/browse/${key}`;
        return `• ${key} [${type}] — ${status} — ${assignee}\n  ${summary}\n  ${url}`;
      });

      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    } catch (err) {
      console.error(err);
      return { content: [{ type: "text", text: "Error searching Jira (NL)." }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await mcp.connect(transport);
console.error("Jira MCP server ready on stdio");


