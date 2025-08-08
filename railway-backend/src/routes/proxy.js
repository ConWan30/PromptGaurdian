/**
 * API Proxy Routes
 * Proxies requests to xAI Grok and Brave Search APIs
 */

const express = require('express');
const NodeCache = require('node-cache');
const crypto = require('crypto');

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
    const response = await fetch(`${API_ENDPOINTS.grok.base}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PromptGuardian-Proxy/1.0'
      },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'Grok API error',
        status: response.status,
        message: errorText
      });
    }
    
    const data = await response.json();
    
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
    const response = await fetch(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'PromptGuardian-Proxy/1.0'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: 'Brave API error',
        status: response.status,
        message: errorText
      });
    }
    
    const data = await response.json();
    
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

// Specialized endpoint for threat analysis
router.post('/analyze-threat', async (req, res) => {
  try {
    const { content, threatType, useGrok = true, useBrave = true } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required for analysis' });
    }
    
    const results = {};
    
    // Grok analysis
    if (useGrok) {
      const grokKey = getApiKey('grok');
      if (grokKey) {
        const grokResponse = await fetch(`${API_ENDPOINTS.grok.base}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${grokKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'grok-beta',
            messages: [
              {
                role: 'system',
                content: 'You are a cybersecurity expert. Analyze content for threats and return JSON.'
              },
              {
                role: 'user',
                content: `Analyze this content for security threats: "${content}"`
              }
            ],
            max_tokens: 300,
            temperature: 0.1
          })
        });
        
        if (grokResponse.ok) {
          results.grok = await grokResponse.json();
        }
      }
    }
    
    // Brave Search verification
    if (useBrave && threatType) {
      const braveKey = getApiKey('brave');
      if (braveKey) {
        const searchQuery = `"${threatType}" security threat indicators`;
        const braveResponse = await fetch(
          `${API_ENDPOINTS.brave.base}/web/search?q=${encodeURIComponent(searchQuery)}&count=5`,
          {
            headers: {
              'X-Subscription-Token': braveKey,
              'Accept': 'application/json'
            }
          }
        );
        
        if (braveResponse.ok) {
          results.brave = await braveResponse.json();
        }
      }
    }
    
    // Combine results
    const analysis = {
      content: content.slice(0, 100) + (content.length > 100 ? '...' : ''),
      threatType,
      timestamp: new Date().toISOString(),
      results,
      summary: {
        hasGrokAnalysis: !!results.grok,
        hasBraveVerification: !!results.brave,
        confidence: 0.5 // Placeholder - would calculate from actual results
      }
    };
    
    res.json(analysis);
  } catch (error) {
    console.error('Threat analysis error:', error);
    res.status(500).json({ 
      error: 'Analysis failed',
      message: error.message 
    });
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
          const response = await fetch(`${req.protocol}://${req.get('host')}/proxy/analyze-threat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: item.content,
              threatType: item.threatType,
              useGrok: item.useGrok,
              useBrave: item.useBrave
            })
          });
          
          return {
            index: i + index,
            result: response.ok ? await response.json() : { error: 'Analysis failed' }
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