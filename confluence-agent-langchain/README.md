# Confluence AI Agent (LangChain Version)

A powerful AI agent for Confluence queries built with **LangChain.js** - the industry-standard framework for building AI applications.

## 🚀 Why LangChain.js?

**LangChain.js** is specifically designed for building AI agents and offers significant advantages:

- ✅ **Purpose-built for AI agents** - Not just a web framework
- ✅ **Tool integration** - Easy to add custom tools and functions
- ✅ **Memory management** - Built-in conversation memory
- ✅ **Streaming responses** - Real-time response streaming
- ✅ **Error handling** - Robust error management and retry logic
- ✅ **Multiple LLM support** - Not just OpenAI, supports many models
- ✅ **Agent orchestration** - Built-in agent execution and planning
- ✅ **Industry standard** - Used by thousands of AI applications

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Query    │───▶│   Express.js     │───▶│  LangChain      │
│                 │    │   Server         │    │  Agent          │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │  Confluence      │    │  OpenAI GPT-4   │
                       │  Tools           │    │  (Reasoning)    │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Confluence API  │
                       └──────────────────┘
```

## 🛠️ Technology Stack

- **LangChain.js** - AI agent framework
- **Express.js** - Web server
- **OpenAI GPT-4** - Language model
- **Confluence REST API** - Content management
- **Node.js** - Runtime environment

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install --legacy-peer-deps
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3002`

### 4. Test the Agent

```bash
npm test
```

## 📡 API Endpoints

### Main Agent Endpoint

**POST** `/agent/query`

Send a natural language query to the LangChain agent.

```bash
curl -X POST http://localhost:3002/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Give me the link of the confluence page that has CI Opt-Out Lambda Implementation Details",
    "chatHistory": []
  }'
```

**Response:**
```json
{
  "success": true,
  "response": "I found the CI Opt-Out Lambda Implementation page...",
  "intermediateSteps": [
    {
      "action": {
        "tool": "search_confluence",
        "toolInput": { "query": "CI Opt-Out Lambda Implementation" }
      },
      "observation": "Found 3 results..."
    }
  ],
  "query": "Give me the link...",
  "timestamp": "2024-01-12T10:30:00.000Z"
}
```

### Get Available Tools

**GET** `/agent/tools`

Get list of available tools the agent can use.

```bash
curl http://localhost:3002/agent/tools
```

### Health Check

**GET** `/health`

Check if the service is running and configured.

```bash
curl http://localhost:3002/health
```

## 🔧 Key Features

### 1. **Intelligent Tool Selection**
The agent automatically decides which tools to use based on your query:
- `search_confluence` - For finding pages
- `get_confluence_page` - For getting full content

### 2. **Conversation Memory**
Maintains context across multiple queries in a conversation.

### 3. **Multi-step Reasoning**
Can perform complex multi-step operations:
1. Search for relevant pages
2. Analyze results
3. Fetch full content if needed
4. Provide comprehensive answers

### 4. **Error Handling & Retries**
Built-in error handling and retry logic for robust operation.

### 5. **Intermediate Steps Visibility**
See exactly what the agent did to answer your question.

## 🆚 Comparison with Other Approaches

| Feature | Express + OpenAI | LangChain.js | care-agent-sdk |
|---------|------------------|--------------|----------------|
| **Setup Complexity** | ⭐⭐ Simple | ⭐⭐⭐ Moderate | ⭐⭐⭐⭐⭐ Complex |
| **AI Agent Features** | ⭐⭐ Basic | ⭐⭐⭐⭐⭐ Advanced | ⭐⭐⭐⭐ Good |
| **Tool Integration** | ⭐⭐ Manual | ⭐⭐⭐⭐⭐ Built-in | ⭐⭐⭐⭐ Good |
| **Memory Management** | ⭐ None | ⭐⭐⭐⭐⭐ Built-in | ⭐⭐⭐⭐ Good |
| **Error Handling** | ⭐⭐ Basic | ⭐⭐⭐⭐⭐ Advanced | ⭐⭐⭐⭐ Good |
| **Streaming** | ⭐⭐ Manual | ⭐⭐⭐⭐⭐ Built-in | ⭐⭐⭐⭐ Good |
| **Debugging** | ⭐⭐⭐ Good | ⭐⭐⭐⭐⭐ Excellent | ⭐⭐ Limited |
| **Industry Adoption** | ⭐⭐⭐ Common | ⭐⭐⭐⭐⭐ Standard | ⭐⭐ Niche |

## 🎯 Example Queries

The LangChain agent can handle complex queries:

- "Find all pages about CI Opt-Out Lambda and show me the implementation details"
- "Search for deployment documentation and get the full content of the most relevant page"
- "What are the coding standards? Show me the full guidelines"
- "Find database migration guides and summarize the key steps"

## 🔍 How It Works

1. **Query Analysis**: LangChain agent analyzes your natural language query
2. **Tool Selection**: Automatically selects appropriate tools (search, get page)
3. **Execution**: Executes tools in the right sequence
4. **Reasoning**: Uses GPT-4 to reason about results
5. **Response**: Provides comprehensive, contextual answers

## 🛠️ Development

### Project Structure

```
confluence-agent-langchain/
├── src/
│   ├── server.js           # Express server
│   ├── agent.js            # LangChain agent setup
│   └── tools.js            # Confluence tools
├── test/
│   └── test-agent.js       # Automated tests
├── package.json
└── README.md
```

### Adding New Tools

1. Create a new tool class in `tools.js`:

```javascript
export class NewTool extends DynamicStructuredTool {
  constructor() {
    super({
      name: 'new_tool',
      description: 'Description of what this tool does',
      schema: z.object({
        param: z.string().describe('Parameter description'),
      }),
      func: async ({ param }) => {
        // Tool implementation
        return 'Tool result';
      },
    });
  }
}
```

2. Add it to the tools array in `agent.js`:

```javascript
this.tools = [
  new ConfluenceSearchTool(...),
  new ConfluencePageTool(...),
  new NewTool(), // Add your new tool
];
```

## 🚀 Advantages of LangChain Approach

1. **Professional AI Agent**: Built specifically for AI applications
2. **Tool Orchestration**: Automatic tool selection and execution
3. **Memory & Context**: Maintains conversation context
4. **Error Recovery**: Built-in retry and error handling
5. **Extensibility**: Easy to add new tools and capabilities
6. **Industry Standard**: Used by major AI companies
7. **Active Development**: Constantly updated and improved
8. **Rich Ecosystem**: Many pre-built tools and integrations

## 📚 Next Steps

1. **Add More Tools**: Integrate with other APIs (Jira, Slack, etc.)
2. **Memory Persistence**: Store conversation history in database
3. **Streaming Responses**: Implement real-time response streaming
4. **Custom Prompts**: Fine-tune prompts for your specific use case
5. **Multi-modal**: Add support for images and documents

This LangChain-based approach provides a much more robust and professional foundation for building AI agents compared to the simple Express + OpenAI approach!
