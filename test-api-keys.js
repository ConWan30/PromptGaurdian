#!/usr/bin/env node

/**
 * Test script to verify xAI and Brave API keys on Railway
 */

const axios = require('axios');

async function testApiKeys() {
  console.log('🧪 Testing API Keys on Railway...\n');
  
  const baseUrl = 'https://promptgaurdian-production.up.railway.app';
  
  try {
    // Test proxy status
    console.log('1. Testing proxy status...');
    const statusResponse = await axios.get(`${baseUrl}/proxy/status`);
    console.log('Proxy Status:', JSON.stringify(statusResponse.data, null, 2));
    
    // Test environment variables via direct threat analysis
    console.log('\n2. Testing threat analysis (which should use API keys)...');
    const threatResponse = await axios.post(`${baseUrl}/proxy/analyze-threat`, {
      content: 'test content for API key verification',
      threatType: 'api_key_test',
      useGrok: true,
      useBrave: true,
      context: { url: 'api-test' },
      meshId: 'key_verification_test',
      priority: 'high'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = threatResponse.data;
    console.log('Threat Analysis Result:', JSON.stringify(result, null, 2));
    
    // Check if APIs are working
    console.log('\n3. API Key Status Analysis:');
    const hasGrokFallback = result.fallbacks?.includes('grok_fallback_to_local_ml');
    const hasBraveFallback = result.fallbacks?.includes('brave_fallback_to_local_patterns');
    
    console.log('🔑 xAI Grok API:', hasGrokFallback ? '❌ Using fallback (key not working)' : '✅ Working');
    console.log('🔍 Brave Search API:', hasBraveFallback ? '❌ Using fallback (key not working)' : '✅ Working');
    
    if (hasGrokFallback || hasBraveFallback) {
      console.log('\n⚠️ API Keys Issues Detected:');
      if (hasGrokFallback) {
        console.log('- xAI Grok API key not detected or invalid');
        console.log('  Expected env vars: XAI_API_KEY, GROK_API_KEY, or GROK_API_KEYS');
      }
      if (hasBraveFallback) {
        console.log('- Brave Search API key not detected or invalid'); 
        console.log('  Expected env vars: BRAVE_API_KEY or BRAVE_API_KEYS');
      }
      console.log('\n💡 Please verify your Railway environment variables are set correctly.');
    } else {
      console.log('\n🎉 All API keys are working correctly!');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testApiKeys();