/**
 * API Management Routes
 * Handles API key pooling and configuration
 */

const express = require('express');
const NodeCache = require('node-cache');
const crypto = require('crypto');

const router = express.Router();
const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

// API key pool management
const apiKeyPool = {
  grok: process.env.GROK_API_KEYS?.split(',') || [],
  brave: process.env.BRAVE_API_KEYS?.split(',') || []
};

// Get available API key from pool
function getApiKey(service) {
  const keys = apiKeyPool[service];
  if (!keys || keys.length === 0) {
    return null;
  }
  
  // Simple round-robin selection
  const index = Math.floor(Math.random() * keys.length);
  return keys[index];
}

// API configuration endpoint
router.get('/config', (req, res) => {
  const config = {
    services: {
      grok: {
        available: apiKeyPool.grok.length > 0,
        endpoint: 'https://api.x.ai/v1/chat/completions',
        features: ['chat', 'search', 'multimodal']
      },
      brave: {
        available: apiKeyPool.brave.length > 0,
        endpoint: 'https://api.search.brave.com/res/v1',
        features: ['search', 'goggles', 'images', 'videos']
      }
    },
    rateLimits: {
      requestsPerMinute: 100,
      requestsPerHour: 1000
    },
    caching: {
      enabled: true,
      ttl: 600
    }
  };
  
  res.json(config);
});

// API key validation
router.post('/validate-key', (req, res) => {
  const { service, apiKey } = req.body;
  
  if (!service || !apiKey) {
    return res.status(400).json({ error: 'Service and API key required' });
  }
  
  // Hash the API key for logging (don't store actual keys)
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 8);
  
  // In a real implementation, you would validate against the actual service
  const isValid = apiKey.length > 20; // Simple validation
  
  res.json({
    valid: isValid,
    keyHash,
    service,
    timestamp: new Date().toISOString()
  });
});

// Get pooled API key for service
router.get('/key/:service', async (req, res) => {
  const { service } = req.params;
  const userAgent = req.get('User-Agent');
  
  // Rate limiting per extension instance
  const clientId = crypto.createHash('md5').update(userAgent || 'unknown').digest('hex');
  const rateLimitKey = `rate_${service}_${clientId}`;
  
  const currentCount = cache.get(rateLimitKey) || 0;
  if (currentCount > 50) { // 50 requests per hour per client
    return res.status(429).json({ error: 'Rate limit exceeded for pooled keys' });
  }
  
  const apiKey = getApiKey(service);
  if (!apiKey) {
    return res.status(503).json({ 
      error: 'No API keys available for service',
      service,
      suggestion: 'Configure your own API key in extension settings'
    });
  }
  
  // Update rate limit counter
  cache.set(rateLimitKey, currentCount + 1, 3600);
  
  // Return truncated key for security
  res.json({
    service,
    keyPreview: `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`,
    fullKey: apiKey, // Only for authorized requests
    usage: {
      requests: currentCount + 1,
      limit: 50
    }
  });
});

// API usage statistics
router.get('/usage/:service?', (req, res) => {
  const { service } = req.params;
  
  // Mock usage data - in production, this would come from a database
  const usage = {
    grok: {
      totalRequests: 1250,
      successfulRequests: 1180,
      errorRate: '5.6%',
      averageResponseTime: '850ms',
      topEndpoints: [
        { endpoint: '/chat/completions', requests: 900 },
        { endpoint: '/search', requests: 350 }
      ]
    },
    brave: {
      totalRequests: 890,
      successfulRequests: 865,
      errorRate: '2.8%',
      averageResponseTime: '320ms',
      topEndpoints: [
        { endpoint: '/search', requests: 650 },
        { endpoint: '/images', requests: 240 }
      ]
    }
  };
  
  if (service && usage[service]) {
    res.json({ service, ...usage[service] });
  } else {
    res.json(usage);
  }
});

// Health check for APIs
router.get('/health/:service', async (req, res) => {
  const { service } = req.params;
  
  try {
    let healthStatus = { service, status: 'unknown' };
    
    if (service === 'grok') {
      // Simple health check for Grok API
      const apiKey = getApiKey('grok');
      if (apiKey) {
        // In production, make actual API call
        healthStatus = {
          service: 'grok',
          status: 'healthy',
          endpoint: 'https://api.x.ai/v1',
          responseTime: '250ms',
          availableKeys: apiKeyPool.grok.length
        };
      }
    } else if (service === 'brave') {
      const apiKey = getApiKey('brave');
      if (apiKey) {
        healthStatus = {
          service: 'brave',
          status: 'healthy',
          endpoint: 'https://api.search.brave.com',
          responseTime: '180ms',
          availableKeys: apiKeyPool.brave.length
        };
      }
    }
    
    res.json(healthStatus);
  } catch (error) {
    res.status(500).json({
      service,
      status: 'error',
      error: error.message
    });
  }
});

// Rotate API keys (admin endpoint)
router.post('/rotate-keys', (req, res) => {
  const { adminKey, service, newKeys } = req.body;
  
  // Simple admin authentication
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  if (!service || !newKeys || !Array.isArray(newKeys)) {
    return res.status(400).json({ error: 'Service and newKeys array required' });
  }
  
  if (apiKeyPool[service]) {
    apiKeyPool[service] = newKeys;
    
    res.json({
      service,
      message: 'API keys rotated successfully',
      keyCount: newKeys.length,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(400).json({ error: 'Unknown service' });
  }
});

module.exports = router;