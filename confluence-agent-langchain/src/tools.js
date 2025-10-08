import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import fetch from 'node-fetch';

export class ConfluenceSearchTool extends DynamicStructuredTool {
  constructor(baseUrl, email, apiToken) {
    super({
      name: 'search_confluence',
      description: 'Search Confluence pages by keyword to find relevant documentation and information. Use this for implementation details, specifications, and documentation searches.',
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

export class ConfluenceSolutionsTool extends DynamicStructuredTool {
  constructor(baseUrl, email, apiToken) {
    super({
      name: 'search_confluence_solutions',
      description: 'Find troubleshooting/how-to Confluence pages relevant to a described issue',
      schema: z.object({
        issue: z.string().describe('Describe your problem or error to find solutions'),
        spaces: z.array(z.string()).optional().describe('Optional space keys to restrict the search (e.g., ENG, DOCS)'),
        labels: z.array(z.string()).optional().describe('Optional extra labels to prioritize (e.g., troubleshooting)'),
        limit: z.number().int().min(1).max(20).optional().describe('Max results to return (default 5)'),
      }),
      func: async ({ issue, spaces, labels, limit }) => {
        try {
          const authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
          
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
          const url = `${baseUrl}/wiki/rest/api/search?cql=${encodeURIComponent(cql)}&limit=${max}`;

          const response = await fetch(url, {
            headers: {
              Authorization: authHeader,
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            const errText = await response.text();
            return `Failed to search solutions: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}`;
          }

          const data = await response.json();
          const results = Array.isArray(data.results) ? data.results : [];
          if (results.length === 0) {
            return `No solution-like pages found for: ${issue}`;
          }

          const items = results.slice(0, max).map((r) => {
            const title = r.content?.title || r.title || "Untitled";
            const webui = r.content?._links?.webui || r.url || "";
            const pageUrl = webui.startsWith("http") ? webui : `${baseUrl}/wiki${webui}`;
            const rawExcerpt = r.excerpt || r.content?.excerpt || "";
            const textExcerpt = rawExcerpt
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 400);
            return `• ${title}\n  ${pageUrl}\n  ${textExcerpt}`;
          });

          return `Top solution-focused results for:\n"${issue}"\n\n${items.join("\n\n")}`;
        } catch (error) {
          return `Error searching for solutions in Confluence: ${error.message}`;
        }
      },
    });
  }
}

export class JiraSearchTool extends DynamicStructuredTool {
  constructor(baseUrl, email, apiToken) {
    super({
      name: 'search_jira',
      description: 'Search Jira issues by JQL or free text query. Use this to find issues related to specific topics, features, or problems. Best for finding issues by content, not status queries.',
      schema: z.object({
        jql: z.string().optional().describe('JQL to execute (overrides query if provided)'),
        query: z.string().optional().describe('Free text to search in Jira issues'),
        maxResults: z.number().int().min(1).max(50).optional().describe('Max results to return (default 10)'),
        fields: z.array(z.string()).optional().describe('Optional fields to return (e.g., [\'summary\',\'status\',\'assignee\'])'),
      }),
      func: async ({ jql, query, maxResults, fields }) => {
        try {
          const authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
          
          const effectiveMax = typeof maxResults === "number" ? maxResults : 10;
          let effectiveJql = jql || "";

          if (!effectiveJql) {
            const q = (query || "").trim();
            if (!q) {
              return "Provide either 'jql' or a non-empty 'query' string.";
            }
            // Free text search using text ~ "..." across projects
            const escaped = q.replace(/\"/g, '\\"');
            effectiveJql = `text ~ \"${escaped}\" order by updated desc`;
          }

          const apiUrl = `${baseUrl}/rest/api/3/search/jql`;
          const body = {
            jql: effectiveJql,
            maxResults: effectiveMax,
            fields: fields && fields.length ? fields : ["summary", "status", "assignee", "issuetype", "priority", "updated"],
          };

          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errText = await response.text();
            return `Failed to search Jira: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}`;
          }

          const data = await response.json();
          const issues = Array.isArray(data.issues) ? data.issues : [];
          if (issues.length === 0) {
            return "No Jira issues found.";
          }

          const lines = issues.map((i) => {
            const key = i.key;
            const summary = i.fields?.summary || "";
            const status = i.fields?.status?.name || "";
            const assignee = i.fields?.assignee?.displayName || "Unassigned";
            const type = i.fields?.issuetype?.name || "";
            const url = `${baseUrl}/browse/${key}`;
            return `• ${key} [${type}] — ${status} — ${assignee}\n  ${summary}\n  ${url}`;
          });

          return lines.join("\n\n");
        } catch (error) {
          return `Error searching Jira: ${error.message}`;
        }
      },
    });
  }
}

export class JiraIssueTool extends DynamicStructuredTool {
  constructor(baseUrl, email, apiToken) {
    super({
      name: 'get_jira_issue',
      description: 'Fetch a Jira issue by key (e.g., ENG-123)',
      schema: z.object({
        key: z.string().describe('Jira issue key, e.g., ENG-123'),
      }),
      func: async ({ key }) => {
        try {
          const authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
          
          const apiUrl = `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?expand=renderedFields,changelog`;
          const response = await fetch(apiUrl, {
            headers: {
              Authorization: authHeader,
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            const errText = await response.text();
            return `Failed to fetch issue ${key}: ${response.status} ${response.statusText}\n${errText.slice(0, 500)}`;
          }

          const data = await response.json();
          const summary = data.fields?.summary || "";
          const descriptionHtml = data.renderedFields?.description || "";
          const status = data.fields?.status?.name || "";
          const assignee = data.fields?.assignee?.displayName || "Unassigned";
          const reporter = data.fields?.reporter?.displayName || "";
          const type = data.fields?.issuetype?.name || "";
          const url = `${baseUrl}/browse/${data.key}`;

          return `${data.key} [${type}] — ${status}\n` +
            `Assignee: ${assignee} | Reporter: ${reporter}\n` +
            `Summary: ${summary}\n` +
            `URL: ${url}\n` +
            descriptionHtml;
        } catch (error) {
          return `Error fetching Jira issue: ${error.message}`;
        }
      },
    });
  }
}

export class JiraNaturalLanguageTool extends DynamicStructuredTool {
  constructor(baseUrl, email, apiToken) {
    super({
      name: 'search_jira_nl',
      description: 'Search Jira with natural language prompts. BEST for task completion status queries, assignment queries, and project-specific searches. Use this for questions like "is X task completed?" or "show issues assigned to me".',
      schema: z.object({
        prompt: z.string().describe('Natural language description of what to find'),
        maxResults: z.number().int().min(1).max(50).optional().describe('Max results to return (default 10)'),
        fields: z.array(z.string()).optional().describe('Optional fields to return'),
      }),
      func: async ({ prompt, maxResults, fields }) => {
        try {
          const authHeader = "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
          
          const lower = prompt.toLowerCase();
          const conditions = [];

          // Enhanced completion status detection
          if (/\bassigned to me\b/.test(lower)) conditions.push("assignee = currentUser()");
          if (/\breported by me\b/.test(lower)) conditions.push("reporter = currentUser()");
          if (/\bunassigned\b/.test(lower)) conditions.push("assignee is EMPTY");

          // Enhanced status detection for completion queries
          if (/\b(open|unresolved|not done|to ?do|incomplete|pending)\b/.test(lower)) conditions.push("resolution = Unresolved");
          if (/\b(done|closed|resolved|completed|finished)\b/.test(lower)) conditions.push("statusCategory = Done");
          if (/\bin progress\b/.test(lower)) conditions.push('statusCategory = "In Progress"');
          
          // Special handling for completion status queries
          if (/\b(completion|completed|completion status|work.*completed|task.*completed)\b/.test(lower)) {
            // Don't add status filters for completion queries - we want to see all statuses
            // This allows us to see both completed and in-progress work
          }

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

          const apiUrl = `${baseUrl}/rest/api/3/search/jql`;
          const body = {
            jql,
            maxResults: typeof maxResults === "number" ? maxResults : 10,
            fields: fields && fields.length ? fields : ["summary", "status", "assignee", "issuetype", "priority", "updated"],
          };

          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              Authorization: authHeader,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const errText = await response.text();
            return `Failed to search Jira (NL): ${response.status} ${response.statusText}\n${errText.slice(0, 500)}`;
          }

          const data = await response.json();
          const issues = Array.isArray(data.issues) ? data.issues : [];
          if (issues.length === 0) {
            return "No Jira issues found.";
          }

          const lines = issues.map((i) => {
            const key = i.key;
            const summary = i.fields?.summary || "";
            const status = i.fields?.status?.name || "";
            const assignee = i.fields?.assignee?.displayName || "Unassigned";
            const type = i.fields?.issuetype?.name || "";
            const url = `${baseUrl}/browse/${key}`;
            return `• ${key} [${type}] — ${status} — ${assignee}\n  ${summary}\n  ${url}`;
          });

          return lines.join("\n\n");
        } catch (error) {
          return `Error searching Jira (NL): ${error.message}`;
        }
      },
    });
  }
}
