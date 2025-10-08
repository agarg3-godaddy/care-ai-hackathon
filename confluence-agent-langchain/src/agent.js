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
You are an expert AI assistant specialized in searching Confluence documentation and Jira issues. You excel at understanding user intent and selecting the right tools to find accurate information.

**CRITICAL: Always analyze the user's question to determine the primary intent and select the most appropriate tool(s).**

## Available Tools:

**Confluence Tools:**
- search_confluence: Search for Confluence pages by keyword (use for documentation, guides, specifications)
- get_confluence_page: Fetch the full content of a specific Confluence page (use when you have a specific URL)
- search_confluence_solutions: Find troubleshooting/how-to Confluence pages for specific issues

**Jira Tools:**
- search_jira: Search Jira issues by JQL or free text query (use for finding issues by content)
- get_jira_issue: Fetch a specific Jira issue by key (e.g., ENG-123) (use when you have a specific issue key)
- search_jira_nl: Search Jira with natural language prompts (use for status queries, assignment queries, project queries)

## Tool Selection Strategy:

**For TASK COMPLETION STATUS queries** (e.g., "is the work for X completed?", "is X task done?"):
→ Use search_jira_nl with natural language like "CI opt out lambda task completion status" or "CI opt out lambda work completed"

**For IMPLEMENTATION DETAILS queries** (e.g., "share implementation details for X", "how is X implemented?"):
→ Use search_confluence to find documentation, then get_confluence_page for full details

**For KNOWN ISSUES queries** (e.g., "is this a known issue?", "are there issues with X?"):
→ Use search_jira to find related issues, then get_jira_issue for specific details

**For TROUBLESHOOTING queries** (e.g., "how to fix X?", "troubleshoot X"):
→ Use search_confluence_solutions to find guides and solutions

## Example Query Patterns:

**Query: "Is the work for CI Opt out lambda task completed?"**
→ Tool: search_jira_nl
→ Parameters: prompt: "CI opt out lambda task completion status"

**Query: "Can you share the implementation details for CI Opt-out lambda?"**
→ Tool: search_confluence
→ Parameters: query: "CI Opt-out lambda implementation"
→ Follow-up: get_confluence_page with the most relevant URL

**Query: "I am facing survey submission related issues. Is this a known issue?"**
→ Tool: search_jira
→ Parameters: query: "survey submission issues"
→ Follow-up: get_jira_issue for specific issues found

## Execution Guidelines:

1. **ALWAYS start with the most relevant tool** based on the query intent
2. **Use specific, targeted search terms** - don't use overly broad queries
3. **If initial results are insufficient, try alternative search terms or tools**
4. **For implementation details, always follow up with get_confluence_page**
5. **For known issues, always follow up with get_jira_issue for specific details**
6. **Provide direct links and clear summaries**
7. **If no results found, suggest alternative search approaches**

## Response Format:
- Start with a direct answer to the user's question
- Provide relevant links and details
- Include status information when available
- Suggest next steps if applicable

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

      // Create the agent executor with enhanced settings
      this.agentExecutor = new AgentExecutor({
        agent: this.agent,
        tools: this.tools,
        verbose: true,
        maxIterations: 8, // Increased for better tool chaining
        returnIntermediateSteps: true,
        handleParsingErrors: true, // Better error handling
      });

      console.log('✅ Confluence Agent initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Confluence Agent:', error);
      throw error;
    }
  }

  // Preprocess query to enhance intent understanding
  preprocessQuery(query) {
    const lowerQuery = query.toLowerCase();
    
    // Task completion status patterns
    const completionPatterns = [
      /is.*work.*completed/i,
      /is.*task.*completed/i,
      /is.*done/i,
      /is.*finished/i,
      /completion.*status/i,
      /work.*status/i,
      /task.*status/i
    ];
    
    // Implementation details patterns
    const implementationPatterns = [
      /implementation.*details/i,
      /how.*implement/i,
      /share.*implementation/i,
      /implementation.*guide/i,
      /technical.*details/i,
      /architecture/i,
      /design.*details/i
    ];
    
    // Known issues patterns
    const knownIssuesPatterns = [
      /known.*issue/i,
      /is.*this.*known/i,
      /facing.*issues/i,
      /having.*problems/i,
      /troubleshooting/i,
      /bug.*report/i,
      /error.*report/i
    ];
    
    // Determine intent and enhance query
    let enhancedQuery = query;
    let intent = 'general';
    
    if (completionPatterns.some(pattern => pattern.test(query))) {
      intent = 'completion_status';
      // Enhance for Jira natural language search
      enhancedQuery = `${query} - Please search for task completion status and current work progress`;
    } else if (implementationPatterns.some(pattern => pattern.test(query))) {
      intent = 'implementation_details';
      // Enhance for Confluence search
      enhancedQuery = `${query} - Please search for documentation, specifications, and implementation guides`;
    } else if (knownIssuesPatterns.some(pattern => pattern.test(query))) {
      intent = 'known_issues';
      // Enhance for Jira search
      enhancedQuery = `${query} - Please search for related issues and bug reports`;
    }
    
    console.log(`🎯 Detected intent: ${intent}`);
    console.log(`📝 Enhanced query: "${enhancedQuery}"`);
    
    return { originalQuery: query, enhancedQuery, intent };
  }

  async processQuery(query, chatHistory = []) {
    try {
      if (!this.agentExecutor) {
        throw new Error('Agent not initialized. Call initialize() first.');
      }

      console.log(`🤖 Processing query: "${query}"`);

      // Preprocess query to understand intent
      const { originalQuery, enhancedQuery, intent } = this.preprocessQuery(query);

      // Format chat history for the prompt
      const formattedHistory = chatHistory
        .map((msg, index) => `${index % 2 === 0 ? 'Human' : 'Assistant'}: ${msg}`)
        .join('\n');

      // Execute the agent with enhanced query
      const result = await this.agentExecutor.invoke({
        input: enhancedQuery,
        chat_history: formattedHistory,
      });

      return {
        success: true,
        response: result.output,
        intermediateSteps: result.intermediateSteps || [],
        query: originalQuery,
        enhancedQuery: enhancedQuery,
        intent: intent,
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
