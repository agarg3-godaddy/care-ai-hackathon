# Confluence Agent

An AI-powered agent that helps you search and find information in Confluence documentation. This agent integrates the Confluence MCP tool from `mcp-confluence.js` into an AI assistant using the care-agent-sdk framework.

## Features

- 🔍 Search Confluence pages by keyword
- 🤖 AI-powered responses with context-aware search suggestions
- 🔗 Direct links to relevant Confluence pages
- 📊 Structured search results with metadata
- 🛡️ Secure authentication and authorization
- 🚀 Production-ready HTTP server

## Prerequisites

- Node.js 18+ and npm
- Confluence instance with API access
- Atlassian API token
- OpenAI API key (for the AI model)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your details:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```bash
# Confluence Configuration
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
ATLASSIAN_EMAIL=your-email@example.com
ATLASSIAN_API_TOKEN=your-api-token-here

# Server Configuration
PORT=3000

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here
```

### 3. Get Your Atlassian API Token

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a label (e.g., "Confluence Agent")
4. Copy the token and add it to your `.env` file

### 4. Build and Run

```bash
# Build the project
npm run build

# Start the server
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## Usage

### HTTP API

The agent exposes a REST API at `http://localhost:3000/agent/`:

#### Send a Message

```bash
curl -X POST http://localhost:3000/agent/send \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Find documentation about deployment processes"
  }'
```

#### Stream Responses

```bash
curl -X GET "http://localhost:3000/agent/stream?input=How%20do%20I%20deploy%20to%20production?"
```

#### Get Conversation History

```bash
curl -X GET "http://localhost:3000/agent/history?conversationId=conv_abc123"
```

### Example Queries

- "Find documentation about API authentication"
- "Show me the deployment process"
- "What are the coding standards for this project?"
- "Find information about database migrations"
- "How do I set up the development environment?"

## Architecture

This agent integrates the Confluence MCP tool using the care-agent-sdk framework:

- **AI Agent**: Uses care-agent-sdk with OpenAI's Agents library and GPT-4o model
- **Confluence Tool**: Custom tool that searches Confluence via REST API (based on mcp-confluence.js)
- **HTTP Server**: Production-ready server with authentication, logging, and CORS support
- **Session Management**: Built-in conversation persistence and session handling
- **Security**: Initiator-only authorization and secure authentication patterns

## Development

### Project Structure

```
confluence-agent/
├── src/
│   ├── index.ts             # Agent definition with Confluence tool
│   └── server.ts            # HTTP server setup using care-agent-sdk
├── test-agent.js            # Test script to verify functionality
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── env.example              # Environment variables template
└── README.md                # This file
```

### Adding New Tools

To add more Confluence-related tools, extend the agent in `src/index.ts`:

```typescript
const newTool = tool({
  name: 'new_confluence_tool',
  description: 'Description of what this tool does',
  parameters: z.object({
    // Define parameters
  }),
  execute: async ({ param }) => {
    // Implement tool logic
  },
});

// Add to the agent
return new Agent({
  // ... existing config
  tools: [searchConfluenceTool, newTool],
});
```

## Testing

Run the test script to verify the agent is working correctly:

```bash
# Start the agent server
npm start

# In another terminal, run the test
node test-agent.js
```

The test script will:
1. Check the health endpoint
2. Verify agent info
3. Test the chat functionality
4. Provide troubleshooting guidance if issues are found

## Troubleshooting

### "Missing required environment variables"

Make sure all required environment variables are set in your `.env` file:
- `CONFLUENCE_BASE_URL`
- `ATLASSIAN_EMAIL`
- `ATLASSIAN_API_TOKEN`
- `OPENAI_API_KEY`

### "Confluence API error: 401 Unauthorized"

Check your Atlassian credentials:
1. Verify your email address is correct
2. Ensure your API token is valid and not expired
3. Make sure you have access to the Confluence instance

### "No results found"

This could mean:
1. The search query doesn't match any content
2. You don't have permission to view the content
3. The content doesn't exist in the specified Confluence instance

Try different search terms or check your permissions.

## License

This project is part of the care-agent-sdk ecosystem.
