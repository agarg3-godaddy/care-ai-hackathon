import 'dotenv/config';
import { createServer } from '@careai/http-server';
import { httpAgent } from '@careai/agent-server';
import agent from './index.js';

// Validate environment variables
const requiredEnvVars = ['CONFLUENCE_BASE_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Error: Missing required environment variables:', missingVars.join(', '));
  console.error('Please set these variables in your .env file or environment');
  process.exit(1);
}

// Create HTTP server using care-agent-sdk
const server = createServer({
  cors: {
    origin: true, // Allow all origins for development
    credentials: true,
  },
});

// Create agent routes using care-agent-sdk
const agentRoutes = httpAgent()
  .allowAnonymous()
  .createRoutes(agent);

// Mount the agent routes on the HTTP server
server.app.use('/agent', agentRoutes);

// Health check endpoint
server.app.get('/health', (req: any, res: any) => {
  res.json({
    status: 'healthy',
    service: 'confluence-agent',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.app.listen(PORT, () => {
  console.log(`🚀 Confluence Agent server running on http://localhost:${PORT}`);
  console.log(`📚 Agent endpoint: http://localhost:${PORT}/agent`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log(`🔍 Confluence Base URL: ${process.env.CONFLUENCE_BASE_URL}`);
});
