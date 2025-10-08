#!/usr/bin/env node

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3002';

// Test function
async function testAgent() {
  console.log('🧪 Testing Confluence Agent (LangChain Version)');
  console.log('================================================\n');

  // Test 1: Health check
  console.log('1. Testing health endpoint...');
  try {
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check passed:', healthData.status);
    console.log('   Agent ready:', healthData.agentReady);
    console.log('   Confluence configured:', healthData.confluence.configured);
    console.log('   OpenAI configured:', healthData.openai.configured);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    return;
  }

  // Test 2: Get available tools
  console.log('\n2. Testing tools endpoint...');
  try {
    const toolsResponse = await fetch(`${BASE_URL}/agent/tools`);
    const toolsData = await toolsResponse.json();
    
    if (toolsData.success) {
      console.log('✅ Tools retrieved successfully');
      console.log('   Available tools:', toolsData.tools.map(t => t.name).join(', '));
    } else {
      console.log('❌ Tools retrieval failed:', toolsData.error);
    }
  } catch (error) {
    console.log('❌ Tools test failed:', error.message);
  }

  // Test 3: Simple query
  console.log('\n3. Testing agent query...');
  try {
    const queryResponse = await fetch(`${BASE_URL}/agent/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'Give me the link of the confluence page that has CI Opt-Out Lambda Implementation Details'
      }),
    });

    const queryData = await queryResponse.json();
    
    if (queryData.success) {
      console.log('✅ Query processed successfully');
      console.log('   Response:', queryData.response.substring(0, 200) + '...');
      console.log('   Intermediate steps:', queryData.intermediateSteps?.length || 0);
    } else {
      console.log('❌ Query failed:', queryData.error);
    }
  } catch (error) {
    console.log('❌ Query test failed:', error.message);
  }

  console.log('\n🎉 Test completed!');
}

// Run the test
testAgent().catch(console.error);
