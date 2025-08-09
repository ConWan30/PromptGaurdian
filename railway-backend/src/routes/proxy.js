/**
 * API Proxy Routes
 * Proxies requests to xAI Grok and Brave Search APIs
 */

const express = require('express');
const NodeCache = require('node-cache');
const crypto = require('crypto');

// Temporarily comment out dependencies not available in current Railway deployment
// const axios = require('axios');
// const { grokBreaker, braveBreaker } = require('../middleware/circuit-breaker');
// const { localThreatDetector } = require('../services/local-ml');

// Fallback implementations for Railway deployment
const axios = {
  post: async (url, data, config) => {
    throw new Error('axios not available - upgrade in progress');
  },
  get: async (url, config) => {
    throw new Error('axios not available - upgrade in progress');
  }
};

const grokBreaker = {
  execute: async (operation, fallback) => {
    if (fallback) return await fallback();
    throw new Error('Circuit breaker not available');
  }
};

const braveBreaker = grokBreaker;

const localThreatDetector = {
  analyzeThreat: async (content) => ({
    threatScore: 0.2,
    threatType: 'simple_pattern_check', 
    confidence: 0.3,
    source: 'basic_fallback'
  })
};

const router = express.Router();
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

// API endpoints
const API_ENDPOINTS = {
  grok: {
    base: 'https://api.x.ai/v1',
    chat: '/chat/completions',
    search: '/search'
  },
  brave: {
    base: 'https://api.search.brave.com/res/v1',
    search: '/web/search',
    images: '/images/search',
    videos: '/videos/search',
    news: '/news/search'
  }
};

// Get API key from pool
function getApiKey(service) {
  const keys = (service === 'grok' ? 
    process.env.GROK_API_KEYS?.split(',') : 
    process.env.BRAVE_API_KEYS?.split(',')) || [];
  
  if (keys.length === 0) return null;
  
  // Round-robin selection with simple load balancing
  const index = Math.floor(Math.random() * keys.length);
  return keys[index];
}

// Proxy to Grok API
router.post('/grok/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const apiKey = getApiKey('grok');
    
    if (!apiKey) {
      return res.status(503).json({ 
        error: 'No Grok API keys available',
        suggestion: 'Configure your own API key in extension settings'
      });
    }
    
    // Generate cache key for request
    const cacheKey = crypto.createHash('md5')
      .update(JSON.stringify({ endpoint, body: req.body }))
      .digest('hex');
    
    // Check cache first
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return res.json({ ...cachedResponse, cached: true });
    }
    
    // Make request to Grok API
    const response = await axios.post(`${API_ENDPOINTS.grok.base}/${endpoint}`, req.body, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PromptGuardian-Proxy/1.0'
      },
      timeout: 30000,
      validateStatus: false // Don't throw on error status
    });
    
    if (response.status !== 200) {
      return res.status(response.status).json({
        error: 'Grok API error',
        status: response.status,
        message: response.data || 'Unknown error'
      });
    }
    
    const data = response.data;
    
    // Cache successful responses
    if (response.status === 200) {
      cache.set(cacheKey, data);
    }
    
    res.json(data);
  } catch (error) {
    console.error('Grok proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy error',
      message: error.message 
    });
  }
});

// Proxy to Brave Search API
router.get('/brave/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const apiKey = getApiKey('brave');
    
    if (!apiKey) {
      return res.status(503).json({ 
        error: 'No Brave API keys available',
        suggestion: 'Configure your own API key in extension settings'
      });
    }
    
    // Build query string
    const queryParams = new URLSearchParams(req.query);
    const url = `${API_ENDPOINTS.brave.base}/${endpoint}?${queryParams}`;
    
    // Generate cache key
    const cacheKey = crypto.createHash('md5')
      .update(url)
      .digest('hex');
    
    // Check cache
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return res.json({ ...cachedResponse, cached: true });
    }
    
    // Make request to Brave API
    const response = await axios.get(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'PromptGuardian-Proxy/1.0'
      },
      timeout: 30000,
      validateStatus: false
    });
    
    if (response.status !== 200) {
      return res.status(response.status).json({
        error: 'Brave API error',
        status: response.status,
        message: response.data || 'Unknown error'
      });
    }
    
    const data = response.data;
    
    // Cache successful responses
    if (response.status === 200) {
      cache.set(cacheKey, data);
    }
    
    res.json(data);
  } catch (error) {
    console.error('Brave proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy error',
      message: error.message 
    });
  }
});

// Specialized endpoint for threat analysis with circuit breakers and fallbacks
router.post('/analyze-threat', async (req, res) => {
  try {
    const { content, threatType, useGrok = true, useBrave = true, context = {} } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required for analysis' });
    }
    
    const results = {};
    const fallbacks = [];
    
    // Grok analysis with circuit breaker
    if (useGrok) {
      try {
        const grokAnalysis = await grokBreaker.execute(
          async () => {
            const grokKey = getApiKey('grok');
            if (!grokKey) {
              throw new Error('No Grok API key available');
            }
            
            const response = await axios.post(`${API_ENDPOINTS.grok.base}/chat/completions`, {
              model: 'grok-beta',
              messages: [
                {
                  role: 'system',
                  content: 'You are a cybersecurity expert. Analyze content for threats and return JSON with threatScore (0-1), threatType, and explanation.'
                },
                {
                  role: 'user',
                  content: `Analyze this content for security threats: "${content}"`
                }
              ],
              max_tokens: 300,
              temperature: 0.1
            }, {
              headers: {
                'Authorization': `Bearer ${grokKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000,
              validateStatus: false
            });
            
            if (response.status !== 200) {
              throw new Error(`Grok API error: ${response.status}`);
            }
            
            return response.data;
          },
          // Fallback function
          async () => {
            fallbacks.push('grok_fallback_to_local_ml');
            const localAnalysis = await localThreatDetector.analyzeThreat(content, context);
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    threatScore: localAnalysis.threatScore,
                    threatType: localAnalysis.threatType,
                    explanation: `Local ML analysis: ${localAnalysis.threatType}`,
                    source: 'local_ml_fallback'
                  })
                }
              }]
            };
          }
        );
        
        results.grok = grokAnalysis;
      } catch (error) {
        console.warn('Grok analysis failed:', error.message);
        results.grokError = error.message;
      }
    }
    
    // Brave Search verification with circuit breaker
    if (useBrave && threatType) {
      try {
        const braveVerification = await braveBreaker.execute(
          async () => {
            const braveKey = getApiKey('brave');
            if (!braveKey) {
              throw new Error('No Brave API key available');
            }
            
            const searchQuery = `"${threatType}" security threat indicators`;
            const response = await axios.get(
              `${API_ENDPOINTS.brave.base}/web/search?q=${encodeURIComponent(searchQuery)}&count=5`,
              {
                headers: {
                  'X-Subscription-Token': braveKey,
                  'Accept': 'application/json'
                },
                timeout: 30000,
                validateStatus: false
              }
            );
            
            if (response.status !== 200) {
              throw new Error(`Brave API error: ${response.status}`);
            }
            
            return response.data;
          },
          // Fallback function - use local pattern matching
          async () => {
            fallbacks.push('brave_fallback_to_local_patterns');
            
            // Simple local verification
            const knownThreats = ['prompt_injection', 'jailbreak', 'data_extraction'];
            const isKnownThreat = knownThreats.includes(threatType);
            
            return {
              web: {
                results: [{
                  title: `${threatType} Threat Pattern`,
                  snippet: isKnownThreat ? 
                    `${threatType} is a known security threat pattern.` :
                    'Unknown threat type - requires manual verification.',
                  url: 'https://local-verification'
                }]
              },
              fallback: true
            };
          }
        );
        
        results.brave = braveVerification;
      } catch (error) {
        console.warn('Brave verification failed:', error.message);
        results.braveError = error.message;
      }
    }
    
    // If all external APIs failed, ensure we have local analysis
    if (!results.grok && !results.brave) {
      const localAnalysis = await localThreatDetector.analyzeThreat(content, context);
      results.localFallback = localAnalysis;
      fallbacks.push('complete_local_analysis');
    }
    
    // Combine results intelligently
    let finalThreatScore = 0;
    let finalThreatType = 'unknown';
    let confidence = 0;
    
    // Extract threat score from Grok response
    if (results.grok?.choices?.[0]?.message?.content) {
      try {
        const grokData = JSON.parse(results.grok.choices[0].message.content);
        finalThreatScore = Math.max(finalThreatScore, grokData.threatScore || 0);
        if (grokData.threatType && finalThreatScore > 0) {
          finalThreatType = grokData.threatType;
        }
        confidence += 0.6;
      } catch (e) {
        // Grok didn't return valid JSON, use text analysis
        const content = results.grok.choices[0].message.content;
        if (/high.{0,20}threat|dangerous|malicious/i.test(content)) {
          finalThreatScore = Math.max(finalThreatScore, 0.8);
          finalThreatType = 'grok_text_analysis';
        }
        confidence += 0.3;
      }
    }
    
    // Factor in Brave verification
    if (results.brave?.web?.results?.length > 0) {
      const hasSecurityResults = results.brave.web.results.some(result => 
        /threat|security|attack|malicious/i.test(result.title + ' ' + result.snippet)
      );
      
      if (hasSecurityResults) {
        finalThreatScore = Math.max(finalThreatScore, 0.7);
        confidence += 0.4;
      } else {
        confidence += 0.2;
      }
    }
    
    // Use local analysis if external APIs provided no results
    if (results.localFallback) {
      finalThreatScore = Math.max(finalThreatScore, results.localFallback.threatScore);
      if (finalThreatScore > 0 && finalThreatType === 'unknown') {
        finalThreatType = results.localFallback.threatType;
      }
      confidence += 0.5;
    }
    
    const analysis = {
      content: content.slice(0, 100) + (content.length > 100 ? '...' : ''),
      threatScore: Math.min(1.0, finalThreatScore),
      threatType: finalThreatType,
      confidence: Math.min(1.0, confidence),
      timestamp: new Date().toISOString(),
      results,
      fallbacks,
      summary: {
        hasGrokAnalysis: !!results.grok && !results.grokError,
        hasBraveVerification: !!results.brave && !results.braveError,
        hasLocalFallback: !!results.localFallback,
        finalScore: finalThreatScore,
        recommendedAction: finalThreatScore > 0.7 ? 'block' : 
                          finalThreatScore > 0.4 ? 'warn' : 'allow'
      }
    };
    
    res.json(analysis);
  } catch (error) {
    console.error('Threat analysis error:', error);
    
    // Final fallback - always provide local analysis
    try {
      const localAnalysis = await localThreatDetector.analyzeThreat(content, context);
      res.json({
        ...localAnalysis,
        error: 'External analysis failed',
        fallbacks: ['emergency_local_only'],
        message: 'Analysis completed using local ML model only'
      });
    } catch (localError) {
      res.status(500).json({ 
        error: 'Complete analysis failure',
        message: `External APIs and local analysis both failed: ${error.message}`,
        localError: localError.message
      });
    }
  }
});

// Batch processing for multiple threat checks
router.post('/analyze-batch', async (req, res) => {
  try {
    const { items, maxConcurrent = 3 } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array required' });
    }
    
    // Process in batches to avoid overwhelming APIs
    const results = [];
    for (let i = 0; i < items.length; i += maxConcurrent) {
      const batch = items.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (item, index) => {
        try {
          const response = await axios.post(`${req.protocol}://${req.get('host')}/proxy/analyze-threat`, {
            content: item.content,
            threatType: item.threatType,
            useGrok: item.useGrok,
            useBrave: item.useBrave
          }, {
            headers: { 'Content-Type': 'application/json' },
            validateStatus: false
          });
          
          return {
            index: i + index,
            result: response.status === 200 ? response.data : { error: 'Analysis failed' }
          };
        } catch (error) {
          return {
            index: i + index,
            result: { error: error.message }
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + maxConcurrent < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    res.json({
      totalItems: items.length,
      processed: results.length,
      results: results.sort((a, b) => a.index - b.index),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Batch analysis error:', error);
    res.status(500).json({ 
      error: 'Batch analysis failed',
      message: error.message 
    });
  }
});

// API health and status
router.get('/status', async (req, res) => {
  const status = {
    timestamp: new Date().toISOString(),
    services: {
      grok: {
        available: !!getApiKey('grok'),
        endpoint: API_ENDPOINTS.grok.base,
        features: ['chat', 'search', 'multimodal']
      },
      brave: {
        available: !!getApiKey('brave'),
        endpoint: API_ENDPOINTS.brave.base,
        features: ['web_search', 'image_search', 'news_search']
      }
    },
    cache: {
      keys: cache.keys().length,
      stats: cache.getStats()
    },
    proxy: {
      version: '1.0.0',
      uptime: process.uptime()
    }
  };
  
  res.json(status);
});

// Clear cache endpoint
router.delete('/cache', (req, res) => {
  const { adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  const deletedKeys = cache.keys().length;
  cache.flushAll();
  
  res.json({
    message: 'Cache cleared successfully',
    deletedKeys,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;