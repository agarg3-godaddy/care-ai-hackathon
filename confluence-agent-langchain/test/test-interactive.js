#!/usr/bin/env node

import fetch from 'node-fetch';
import readline from 'readline';

const BASE_URL = 'http://localhost:3009';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to ask a question
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Helper function to send query to agent
async function sendQuery(query, chatHistory = []) {
  try {
    const response = await fetch(`${BASE_URL}/agent/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        query,
        chatHistory 
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending query:', error.message);
    return null;
  }
}

// Helper function to get available tools
async function getAvailableTools() {
  try {
    const response = await fetch(`${BASE_URL}/agent/tools`);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.success ? data.tools : [];
  } catch (error) {
    console.error('Error getting tools:', error.message);
    return [];
  }
}

// Helper function to test tools directly
async function testToolDirectly(toolName, params) {
  try {
    let endpoint = '';
    
    // Map tool names to endpoints
    switch (toolName) {
      case 'search':
        endpoint = '/confluence/search';
        break;
      case 'page':
        endpoint = '/confluence/page';
        break;
      case 'solutions':
        endpoint = '/confluence/solutions';
        break;
      case 'jira-search':
        endpoint = '/jira/search';
        break;
      case 'issue':
        endpoint = '/jira/issue';
        break;
      case 'search-nl':
        endpoint = '/jira/search-nl';
        break;
      default:
        endpoint = `/confluence/${toolName}`;
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error testing ${toolName}:`, error.message);
    return null;
  }
}

// Display help information
function displayHelp() {
  console.log('\n📚 Available Commands:');
  console.log('======================');
  console.log('• Type your question normally to test the agent');
  console.log('• "help" - Show this help message');
  console.log('• "tools" - Show available tools');
  console.log('• "health" - Check server health');
  console.log('• "clear" - Clear chat history');
  console.log('• "quit" or "exit" - Exit the interactive test');
  console.log('\n🔧 Direct Tool Testing:');
  console.log('• "test-search <query>" - Test Confluence search');
  console.log('• "test-page <url>" - Test Confluence page fetch');
  console.log('• "test-solutions <issue>" - Test Confluence solutions');
  console.log('• "test-jira <query>" - Test Jira search');
  console.log('• "test-jira-nl <prompt>" - Test Jira natural language');
  console.log('• "test-issue <key>" - Test Jira issue fetch');
  console.log('\n💡 Example Queries:');
  console.log('• "Is CI opt out lambda task completed?"');
  console.log('• "Find troubleshooting guides for deployment issues"');
  console.log('• "Show me Jira issues assigned to me this week"');
  console.log('• "Search for CI/CD documentation"');
  console.log('• "What are the current bugs in the ENG project?"');
  console.log('');
}

// Display server health
async function displayHealth() {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    
    console.log('\n🏥 Server Health:');
    console.log('==================');
    console.log(`Status: ${data.status}`);
    console.log(`Service: ${data.service}`);
    console.log(`Version: ${data.version}`);
    console.log(`Agent Ready: ${data.agentReady ? '✅ Yes' : '❌ No'}`);
    console.log(`Confluence: ${data.confluence.configured ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`Groq: ${data.groq.configured ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`Timestamp: ${data.timestamp}`);
  } catch (error) {
    console.log('❌ Failed to get health status:', error.message);
  }
}

// Display available tools
async function displayTools() {
  const tools = await getAvailableTools();
  
  console.log('\n🛠️  Available Tools:');
  console.log('====================');
  if (tools.length > 0) {
    tools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name}`);
      console.log(`   ${tool.description}`);
    });
  } else {
    console.log('No tools available or failed to fetch tools');
  }
  console.log('');
}

// Main interactive test function
async function interactiveTest() {
  console.log('🤖 Interactive Confluence Agent Test (LangChain Version)');
  console.log('========================================================\n');

  let chatHistory = [];

  // Initial health check
  try {
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log(`✅ Connected to ${healthData.service} v${healthData.version}`);
    console.log(`   Agent Ready: ${healthData.agentReady ? '✅' : '❌'}`);
    console.log(`   Confluence: ${healthData.confluence.baseUrl}`);
    console.log(`   Groq: ${healthData.groq.configured ? 'Configured' : 'Not configured'}\n`);
    
    if (!healthData.agentReady) {
      console.log('⚠️  Warning: Agent is not ready yet. Some features may not work.\n');
    }
  } catch (error) {
    console.error(`❌ Failed to connect to agent server at ${BASE_URL}. Is it running?`);
    rl.close();
    return;
  }

  displayHelp();

  while (true) {
    const input = await askQuestion('🤔 Your command or question (or "help" for commands): ');

    if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
      break;
    }

    if (input.toLowerCase() === 'help') {
      displayHelp();
      continue;
    }

    if (input.toLowerCase() === 'health') {
      await displayHealth();
      continue;
    }

    if (input.toLowerCase() === 'tools') {
      await displayTools();
      continue;
    }

    if (input.toLowerCase() === 'clear') {
      chatHistory = [];
      console.log('✅ Chat history cleared\n');
      continue;
    }

    if (input.toLowerCase().startsWith('test-search ')) {
      const query = input.substring(12);
      console.log(`\n🔍 Testing search tool directly with: "${query}"`);
      const result = await testToolDirectly('search', { query });
      if (result) {
        console.log('✅ Search Result:');
        console.log(result);
      } else {
        console.log('❌ Search failed');
      }
      console.log('');
      continue;
    }

    if (input.toLowerCase().startsWith('test-page ')) {
      const url = input.substring(10);
      console.log(`\n📄 Testing page tool directly with: "${url}"`);
      const result = await testToolDirectly('page', { url });
      if (result) {
        console.log('✅ Page Result:');
        console.log(result);
      } else {
        console.log('❌ Page fetch failed');
      }
      console.log('');
      continue;
    }

    if (input.toLowerCase().startsWith('test-solutions ')) {
      const issue = input.substring(15);
      console.log(`\n🔧 Testing solutions tool directly with: "${issue}"`);
      const result = await testToolDirectly('solutions', { issue, limit: 3 });
      if (result) {
        console.log('✅ Solutions Result:');
        console.log(result);
      } else {
        console.log('❌ Solutions search failed');
      }
      console.log('');
      continue;
    }

    if (input.toLowerCase().startsWith('test-jira ')) {
      const query = input.substring(10);
      console.log(`\n🎫 Testing Jira search tool directly with: "${query}"`);
      const result = await testToolDirectly('jira-search', { query, maxResults: 5 });
      if (result) {
        console.log('✅ Jira Search Result:');
        console.log(result);
      } else {
        console.log('❌ Jira search failed');
      }
      console.log('');
      continue;
    }

    if (input.toLowerCase().startsWith('test-jira-nl ')) {
      const prompt = input.substring(13);
      console.log(`\n🗣️ Testing Jira natural language tool directly with: "${prompt}"`);
      const result = await testToolDirectly('search-nl', { prompt, maxResults: 5 });
      if (result) {
        console.log('✅ Jira NL Result:');
        console.log(result);
      } else {
        console.log('❌ Jira natural language search failed');
      }
      console.log('');
      continue;
    }

    if (input.toLowerCase().startsWith('test-issue ')) {
      const key = input.substring(11);
      console.log(`\n🎫 Testing Jira issue tool directly with: "${key}"`);
      const result = await testToolDirectly('issue', { key });
      if (result) {
        console.log('✅ Jira Issue Result:');
        console.log(result);
      } else {
        console.log('❌ Jira issue fetch failed');
      }
      console.log('');
      continue;
    }

    // Regular agent query
    console.log('\n🔄 Processing query with LangChain agent...');
    const response = await sendQuery(input, chatHistory);

    if (response) {
      if (response.success) {
        console.log('\n✅ Agent Response:');
        console.log('─'.repeat(60));
        console.log(response.response);
        console.log('─'.repeat(60));
        
        // Show intermediate steps if available
        if (response.intermediateSteps && response.intermediateSteps.length > 0) {
          console.log(`\n🔧 Agent Actions (${response.intermediateSteps.length} steps):`);
          response.intermediateSteps.forEach((step, index) => {
            console.log(`   ${index + 1}. ${step.action?.tool || 'Unknown tool'}`);
            if (step.action?.toolInput) {
              console.log(`      Input: ${JSON.stringify(step.action.toolInput)}`);
            }
            if (step.observation) {
              console.log(`      Result: ${step.observation.substring(0, 100)}...`);
            }
          });
        }

        // Update chat history
        chatHistory.push(input, response.response);
        
        console.log(`\n📊 Query processed at: ${response.timestamp}`);
      } else {
        console.log('\n❌ Agent Error:');
        console.log('─'.repeat(60));
        console.log(response.error || response.message);
        console.log('─'.repeat(60));
        
        if (response.error && response.error.includes('quota')) {
          console.log('\n💡 Tip: Groq quota exceeded. The tools work fine, but AI reasoning is unavailable.');
          console.log('   Try using "test-search" or "test-page" commands to test tools directly.');
        }
      }
    } else {
      console.log('\n❌ Failed to get response from agent');
    }
    console.log('\n');
  }

  rl.close();
  console.log('👋 Exiting interactive test.');
  console.log('\n📝 Summary:');
  console.log('• LangChain agent provides detailed execution logs');
  console.log('• Tools work independently of Groq quota issues');
  console.log('• Agent can maintain conversation context');
  console.log('• Professional-grade AI agent architecture');
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Exiting interactive test...');
  rl.close();
  process.exit(0);
});

interactiveTest();
