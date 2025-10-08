import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { PromptTemplate } from '@langchain/core/prompts';
import { ConfluenceSearchTool, ConfluencePageTool } from './tools.js';

export class ConfluenceAgent {
  constructor(openaiApiKey, confluenceBaseUrl, confluenceEmail, confluenceApiToken) {

    console.log('openaiApiKey: ', openaiApiKey)
    console.log('confluenceBaseUrl: ', confluenceBaseUrl)
    console.log('confluenceEmail: ', confluenceEmail)
    console.log('confluenceApiToken: ', confluenceApiToken)

    // Initialize the LLM
    this.llm = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0.3,
      openAIApiKey: openaiApiKey,
    });

    // Initialize tools
    this.tools = [
      new ConfluenceSearchTool(confluenceBaseUrl, confluenceEmail, confluenceApiToken),
      new ConfluencePageTool(confluenceBaseUrl, confluenceEmail, confluenceApiToken),
    ];

    // Create the prompt template
    this.prompt = PromptTemplate.fromTemplate(`
You are a helpful AI assistant specialized in searching and finding information in Confluence documentation.

You have access to the following tools:
- search_confluence: Search for Confluence pages by keyword
- get_confluence_page: Fetch the full content of a specific Confluence page

When users ask questions or need information, you should:

1. Use the search_confluence tool to find relevant documentation
2. Analyze the search results and provide helpful summaries
3. If users want to see the full content of a specific page, use get_confluence_page with the URL from search results
4. Direct users to specific Confluence pages when relevant
5. Help users refine their search queries if initial results aren't helpful

Guidelines:
- Always use the search_confluence tool when users ask about documentation, processes, or information that might be in Confluence
- When users want to read the full content of a page, use get_confluence_page with the URL from search results
- Provide clear, concise summaries of search results and page content
- Include direct links to relevant Confluence pages
- If no results are found, suggest alternative search terms or approaches
- Be helpful and professional in your responses
- If users ask about topics unrelated to Confluence, politely redirect them to use the search functionality

Previous conversation:
{chat_history}

Current user question: {input}

{agent_scratchpad}`);

    // Initialize the agent
    this.agent = null;
    this.agentExecutor = null;
  }

  async initialize() {
    try {
      // Create the agent
      this.agent = await createOpenAIFunctionsAgent({
        llm: this.llm,
        tools: this.tools,
        prompt: this.prompt,
      });

      // Create the agent executor
      this.agentExecutor = new AgentExecutor({
        agent: this.agent,
        tools: this.tools,
        verbose: true,
        maxIterations: 5,
        returnIntermediateSteps: true,
      });

      console.log('✅ Confluence Agent initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Confluence Agent:', error);
      throw error;
    }
  }

  async processQuery(query, chatHistory = []) {
    try {
      if (!this.agentExecutor) {
        throw new Error('Agent not initialized. Call initialize() first.');
      }

      console.log(`🤖 Processing query: "${query}"`);

      // Format chat history for the prompt
      const formattedHistory = chatHistory
        .map((msg, index) => `${index % 2 === 0 ? 'Human' : 'Assistant'}: ${msg}`)
        .join('\n');

      // Execute the agent
      const result = await this.agentExecutor.invoke({
        input: query,
        chat_history: formattedHistory,
      });

      return {
        success: true,
        response: result.output,
        intermediateSteps: result.intermediateSteps || [],
        query: query,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Agent processing error:', error);
      return {
        success: false,
        error: error.message,
        response: 'I encountered an error while processing your request. Please try again.',
        query: query,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getAvailableTools() {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
    }));
  }
}
