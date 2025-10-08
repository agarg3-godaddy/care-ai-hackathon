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
const requiredEnvVars = ['CONFLUENCE_BASE_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN', 'OPENAI_API_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Error: Missing required environment variables:', missingVars.join(', '));
  console.error('Please set these variables in your .env file or environment');
  process.exit(1);
}

// Initialize the agent
const agent = new ConfluenceAgent(
  process.env.OPENAI_API_KEY,
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
    openai: {
      configured: !!process.env.OPENAI_API_KEY,
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Confluence AI Agent - LangChain Version',
    version: '1.0.0',
    framework: 'LangChain.js',
    endpoints: {
      health: 'GET /health',
      query: 'POST /agent/query',
      tools: 'GET /agent/tools',
      search: 'POST /confluence/search',
      page: 'POST /confluence/page',
    },
    usage: {
      query: {
        method: 'POST',
        url: '/agent/query',
        body: { 
          query: 'Your question about Confluence content',
          chatHistory: [] // Optional: previous conversation
        },
      },
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
  console.log(`🤖 OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
});

export default app;
