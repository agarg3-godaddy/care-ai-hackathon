import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ConfluenceAgent } from './agent.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3009; // Use different port

// Middleware
app.use(cors());
app.use(express.json());

// Validate required environment variables
const requiredEnvVars = ['CONFLUENCE_BASE_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN', 'GROQ_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Error: Missing required environment variables:', missingVars.join(', '));
  console.error('Please set these variables in your .env file or environment');
  process.exit(1);
}

// Initialize the agent
const agent = new ConfluenceAgent(
  process.env.GROQ_API_KEY,
  process.env.CONFLUENCE_BASE_URL,
  process.env.ATLASSIAN_EMAIL,
  process.env.ATLASSIAN_API_TOKEN
);

// Initialize agent on startup
let agentReady = false;
agent.initialize()
  .then(() => {
    agentReady = true;
    console.log('🚀 Confluence Agent (LangChain) ready!');
  })
  .catch((error) => {
    console.error('Failed to initialize agent:', error);
    process.exit(1);
  });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'confluence-agent-langchain',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    agentReady: agentReady,
    confluence: {
      baseUrl: process.env.CONFLUENCE_BASE_URL,
      configured: true,
    },
    groq: {
      configured: !!process.env.GROQ_API_KEY,
    },
  });
});

// Main agent endpoint
app.post('/agent/query', async (req, res) => {
  try {
    if (!agentReady) {
      return res.status(503).json({
        success: false,
        error: 'Agent not ready yet. Please wait a moment and try again.',
      });
    }

    const { query, chatHistory = [] } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string',
      });
    }

    console.log(`📝 Processing query: "${query}"`);

    // Process the query using LangChain agent
    const result = await agent.processQuery(query, chatHistory);

    res.json(result);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Get available tools endpoint
app.get('/agent/tools', async (req, res) => {
  try {
    if (!agentReady) {
      return res.status(503).json({
        success: false,
        error: 'Agent not ready yet. Please wait a moment and try again.',
      });
    }

    const tools = await agent.getAvailableTools();
    res.json({
      success: true,
      tools: tools,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting tools:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available tools',
      message: error.message,
    });
  }
});

// Direct tool testing endpoints (for interactive testing)

// Confluence search endpoint
app.post('/confluence/search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required and must be a string',
      });
    }

    // Use the first tool (search tool) directly
    const searchTool = agent.tools[0];
    const result = await searchTool.func({ query });
    
    res.json({
      success: true,
      result: result,
      tool: 'search_confluence',
      query: query,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Confluence search error:', error);
    res.status(500).json({
      success: false,
      error: 'Confluence search failed',
      message: error.message,
    });
  }
});

// Confluence page endpoint
app.post('/confluence/page', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'URL is required and must be a string',
      });
    }

    // Use the second tool (page tool) directly
    const pageTool = agent.tools[1];
    const result = await pageTool.func({ url });
    
    res.json({
      success: true,
      result: result,
      tool: 'get_confluence_page',
      url: url,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Confluence page fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch page content',
      message: error.message,
    });
  }
});

// Confluence solutions endpoint
app.post('/confluence/solutions', async (req, res) => {
  try {
    const { issue, spaces, labels, limit } = req.body;

    if (!issue || typeof issue !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Issue description is required and must be a string',
      });
    }

    // Use the third tool (solutions tool) directly
    const solutionsTool = agent.tools[2];
    const result = await solutionsTool.func({ issue, spaces, labels, limit });
    
    res.json({
      success: true,
      result: result,
      tool: 'search_confluence_solutions',
      issue: issue,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Confluence solutions error:', error);
    res.status(500).json({
      success: false,
      error: 'Confluence solutions search failed',
      message: error.message,
    });
  }
});

// Jira search endpoint
app.post('/jira/search', async (req, res) => {
  try {
    const { jql, query, maxResults, fields } = req.body;

    if (!jql && !query) {
      return res.status(400).json({
        success: false,
        error: 'Either jql or query is required',
      });
    }

    // Use the fourth tool (jira search tool) directly
    const jiraSearchTool = agent.tools[3];
    const result = await jiraSearchTool.func({ jql, query, maxResults, fields });
    
    res.json({
      success: true,
      result: result,
      tool: 'search_jira',
      jql: jql,
      query: query,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Jira search error:', error);
    res.status(500).json({
      success: false,
      error: 'Jira search failed',
      message: error.message,
    });
  }
});

// Jira issue endpoint
app.post('/jira/issue', async (req, res) => {
  try {
    const { key } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Issue key is required and must be a string',
      });
    }

    // Use the fifth tool (jira issue tool) directly
    const jiraIssueTool = agent.tools[4];
    const result = await jiraIssueTool.func({ key });
    
    res.json({
      success: true,
      result: result,
      tool: 'get_jira_issue',
      key: key,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Jira issue fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Jira issue',
      message: error.message,
    });
  }
});

// Jira natural language search endpoint
app.post('/jira/search-nl', async (req, res) => {
  try {
    const { prompt, maxResults, fields } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string',
      });
    }

    // Use the sixth tool (jira natural language tool) directly
    const jiraNLTool = agent.tools[5];
    const result = await jiraNLTool.func({ prompt, maxResults, fields });
    
    res.json({
      success: true,
      result: result,
      tool: 'search_jira_nl',
      prompt: prompt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Jira natural language search error:', error);
    res.status(500).json({
      success: false,
      error: 'Jira natural language search failed',
      message: error.message,
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Confluence & Jira AI Agent - LangChain Version',
    version: '1.0.0',
    framework: 'LangChain.js + Groq',
    endpoints: {
      health: 'GET /health',
      query: 'POST /agent/query',
      tools: 'GET /agent/tools',
      confluence: {
        search: 'POST /confluence/search',
        page: 'POST /confluence/page',
        solutions: 'POST /confluence/solutions',
      },
      jira: {
        search: 'POST /jira/search',
        issue: 'POST /jira/issue',
        searchNl: 'POST /jira/search-nl',
      },
    },
    usage: {
      query: {
        method: 'POST',
        url: '/agent/query',
        body: { 
          query: 'Your question about Confluence or Jira content',
          chatHistory: [] // Optional: previous conversation
        },
      },
      confluence: {
        search: {
          method: 'POST',
          url: '/confluence/search',
          body: { query: 'Search term for Confluence content' },
        },
        page: {
          method: 'POST',
          url: '/confluence/page',
          body: { url: 'Confluence page URL' },
        },
        solutions: {
          method: 'POST',
          url: '/confluence/solutions',
          body: { 
            issue: 'Describe your problem to find solutions',
            spaces: ['ENG', 'DOCS'], // Optional
            labels: ['troubleshooting'], // Optional
            limit: 5 // Optional
          },
        },
      },
      jira: {
        search: {
          method: 'POST',
          url: '/jira/search',
          body: { 
            jql: 'project = ENG AND status = "In Progress"', // Optional
            query: 'CI opt out lambda', // Optional
            maxResults: 10, // Optional
            fields: ['summary', 'status', 'assignee'] // Optional
          },
        },
        issue: {
          method: 'POST',
          url: '/jira/issue',
          body: { key: 'ENG-123' },
        },
        searchNl: {
          method: 'POST',
          url: '/jira/search-nl',
          body: { 
            prompt: 'show issues assigned to me last week in ENG',
            maxResults: 10, // Optional
            fields: ['summary', 'status', 'assignee'] // Optional
          },
        },
      },
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `The endpoint ${req.method} ${req.path} does not exist`,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Confluence Agent (LangChain) running on http://localhost:${PORT}`);
  console.log(`📚 Agent endpoint: http://localhost:${PORT}/agent/query`);
  console.log(`🔧 Tools endpoint: http://localhost:${PORT}/agent/tools`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Confluence Base URL: ${process.env.CONFLUENCE_BASE_URL}`);
  console.log(`🤖 Groq configured: ${!!process.env.GROQ_API_KEY}`);
});

export default app;
