#!/usr/bin/env node

// Simple test script to verify the Confluence agent works
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testAgent() {
  console.log('🧪 Testing Confluence Agent with care-agent-sdk...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData.status);
    console.log('   Service:', healthData.service);
    console.log('   Version:', healthData.version);
    console.log('');

    // Test agent info endpoint
    console.log('2. Testing agent info endpoint...');
    const infoResponse = await fetch(`${BASE_URL}/agent/info`);
    const infoData = await infoResponse.json();
    console.log('✅ Agent info:', infoData.name);
    console.log('   Description:', infoData.description);
    console.log('   Capabilities:', infoData.details?.capabilities?.join(', ') || 'N/A');
    console.log('');

    // Test chat endpoint
    console.log('3. Testing chat endpoint...');
    const chatResponse = await fetch(`${BASE_URL}/agent/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: 'Hello! Can you help me search for documentation about deployment processes?',
        conversationId: 'test-conv-123'
      }),
    });

    if (!chatResponse.ok) {
      throw new Error(`Chat request failed: ${chatResponse.status} ${chatResponse.statusText}`);
    }

    const chatData = await chatResponse.json();
    console.log('✅ Chat response received');
    console.log('   Conversation ID:', chatData.conversationId);
    console.log('   Response type:', typeof chatData.output);
    console.log('   Timestamp:', chatData.timestamp || 'N/A');
    console.log('');

    console.log('🎉 All tests passed! The Confluence Agent is working correctly.');
    console.log('\n📝 Note: Make sure you have set up your .env file with:');
    console.log('   - CONFLUENCE_BASE_URL');
    console.log('   - ATLASSIAN_EMAIL');
    console.log('   - ATLASSIAN_API_TOKEN');
    console.log('   - OPENAI_API_KEY');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure the agent server is running: npm start');
    console.log('2. Check your .env file configuration');
    console.log('3. Verify your Confluence and OpenAI API credentials');
    process.exit(1);
  }
}

// Run the test
testAgent();