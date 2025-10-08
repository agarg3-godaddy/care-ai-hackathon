#!/usr/bin/env node

// Interactive test script for manual testing of the Confluence agent
import fetch from 'node-fetch';
import readline from 'readline';
import { randomUUID } from 'crypto';

const BASE_URL = 'http://localhost:3000';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// Helper function to send message to agent
async function sendMessage(input, conversationId = null) {
  try {
    // Generate a UUID for the message ID
    const messageId = randomUUID();
    
    // Use the correct OpenAI Agents format
    const requestBody = {
      conversationId: conversationId || randomUUID(),
      input: {
        id: messageId,
        type: "message",
        role: "user",
        content: input
      }
    };

    const response = await fetch(`${BASE_URL}/agent/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error sending message:', error.message);
    return null;
  }
}

async function interactiveTest() {
  console.log('🤖 Interactive Confluence Agent Test');
  console.log('=====================================\n');
  
  // Check if server is running
  try {
    const healthResponse = await fetch(`http://localhost:3000/health`);
    if (!healthResponse.ok) {
      throw new Error('Server not responding');
    }
    const healthData = await healthResponse.json();
    console.log(`✅ Connected to ${healthData.service} v${healthData.version}\n`);
  } catch (error) {
    console.log(error)
    console.error('❌ Cannot connect to agent server. Make sure it\'s running with: npm start');
    process.exit(1);
  }

  let conversationId = null;
  let running = true;

  console.log('💡 Test Scenarios:');
  console.log('1. "Search for deployment documentation"');
  console.log('2. "Find information about coding standards"');
  console.log('3. "Get the full content of [URL from search results]"');
  console.log('4. "Search for database migration guides"');
  console.log('5. Type "quit" to exit\n');

  while (running) {
    try {
      const input = await askQuestion('🤔 Your question (or "quit" to exit): ');
      
      if (input.toLowerCase() === 'quit') {
        running = false;
        break;
      }

      if (!input.trim()) {
        console.log('Please enter a question or "quit" to exit.\n');
        continue;
      }

      console.log('\n🔄 Sending to agent...');
      const response = await sendMessage(input, conversationId);
      
      if (response) {
        conversationId = response.conversationId;
        console.log(`\n🤖 Agent Response:`);
        console.log('─'.repeat(50));
        console.log(response.output);
        console.log('─'.repeat(50));
        console.log(`\n📝 Conversation ID: ${conversationId}`);
        console.log(`⏰ Timestamp: ${response.timestamp || 'N/A'}\n`);
      } else {
        console.log('❌ Failed to get response from agent\n');
      }
    } catch (error) {
      console.error('❌ Error:', error.message, '\n');
    }
  }

  console.log('\n👋 Thanks for testing! Goodbye!');
  rl.close();
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  rl.close();
  process.exit(0);
});

// Start the interactive test
interactiveTest();
