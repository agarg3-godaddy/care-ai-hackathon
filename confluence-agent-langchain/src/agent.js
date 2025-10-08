import { ChatGroq } from '@langchain/groq';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { PromptTemplate } from '@langchain/core/prompts';
import { 
  ConfluenceSearchTool, 
  ConfluencePageTool, 
  ConfluenceSolutionsTool,
  JiraSearchTool,
  JiraIssueTool,
  JiraNaturalLanguageTool
} from './tools.js';

export class ConfluenceAgent {
  constructor(groqApiKey, confluenceBaseUrl, confluenceEmail, confluenceApiToken) {

    console.log('groqApiKey: ', groqApiKey)
    console.log('confluenceBaseUrl: ', confluenceBaseUrl)
    console.log('confluenceEmail: ', confluenceEmail)
    console.log('confluenceApiToken: ', confluenceApiToken)

    // Initialize the LLM
    this.llm = new ChatGroq({
      model: 'llama-3.1-8b-instant',
      temperature: 0.3,
      groqApiKey: groqApiKey,
    });

    // Initialize tools
    this.tools = [
      new ConfluenceSearchTool(confluenceBaseUrl, confluenceEmail, confluenceApiToken),
      new ConfluencePageTool(confluenceBaseUrl, confluenceEmail, confluenceApiToken),
      new ConfluenceSolutionsTool(confluenceBaseUrl, confluenceEmail, confluenceApiToken),
      new JiraSearchTool(confluenceBaseUrl, confluenceEmail, confluenceApiToken),
      new JiraIssueTool(confluenceBaseUrl, confluenceEmail, confluenceApiToken),
      new JiraNaturalLanguageTool(confluenceBaseUrl, confluenceEmail, confluenceApiToken),
    ];

    // Create the prompt template
    this.prompt = PromptTemplate.fromTemplate(`
You are a helpful AI assistant specialized in searching and finding information in Confluence documentation and Jira issues.

You have access to the following tools:

**Confluence Tools:**
- search_confluence: Search for Confluence pages by keyword
- get_confluence_page: Fetch the full content of a specific Confluence page
- search_confluence_solutions: Find troubleshooting/how-to Confluence pages for specific issues

**Jira Tools:**
- search_jira: Search Jira issues by JQL or free text query
- get_jira_issue: Fetch a specific Jira issue by key (e.g., ENG-123)
- search_jira_nl: Search Jira with natural language prompts (e.g., "show issues assigned to me last week")

When users ask questions or need information, you should:

1. **For Confluence queries**: Use search_confluence to find relevant documentation
2. **For troubleshooting**: Use search_confluence_solutions to find how-to guides and solutions
3. **For Jira queries**: Use search_jira or search_jira_nl to find relevant issues
4. **For specific content**: Use get_confluence_page or get_jira_issue to fetch full details
5. Analyze results and provide helpful summaries with direct links
6. Help users refine their search queries if initial results aren't helpful

Guidelines:
- Use appropriate tools based on the user's question (Confluence vs Jira)
- For troubleshooting questions, prefer search_confluence_solutions
- For Jira queries, use natural language search when possible
- Provide clear, concise summaries with direct links
- If no results are found, suggest alternative search terms or approaches
- Be helpful and professional in your responses
- Combine information from multiple sources when relevant

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
