#!/usr/bin/env node

import { ConfluencePageTool } from './src/tools.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSpecificPage() {
  console.log('🧪 Testing Specific CI Opt-Out Lambda Page');
  console.log('==========================================\n');

  // Initialize page tool
  const pageTool = new ConfluencePageTool(
    process.env.CONFLUENCE_BASE_URL,
    process.env.ATLASSIAN_EMAIL,
    process.env.ATLASSIAN_API_TOKEN
  );

  // The exact URL we found earlier
  const pageUrl = 'https://godaddy-corp.atlassian.net/wiki/spaces/CRM/pages/3886843659/C-1255+CI+Opt-Out+Lambda+Implementation';

  console.log(`🔗 Testing page: ${pageUrl}\n`);

  try {
    const pageResult = await pageTool.func({ url: pageUrl });
    console.log('✅ Page content retrieved successfully!');
    console.log('📄 Full Page Content:');
    console.log('='.repeat(80));
    console.log(pageResult);
    console.log('='.repeat(80));
  } catch (error) {
    console.log('❌ Page content failed:', error.message);
  }

  console.log('\n🎉 Specific page test completed!');
}

testSpecificPage().catch(console.error);
