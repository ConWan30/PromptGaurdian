/**
 * PromptGuardian Railway Backend
 * API Proxy and Threat Intelligence Server
 * Enhanced with security, circuit breakers, and local ML fallbacks
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const NodeCache = require('node-cache');
require('dotenv').config();

// Import security and resilience middleware
const { 
  authenticateExtension, 
  contentSecurityPolicy, 
  authRoutes 
} = require('./middleware/auth');
const { 
  circuitBreakerStatsMiddleware 
} = require('./middleware/circuit-breaker');
const { localThreatDetector } = require('./services/local-ml');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize caching and rate limiting
const cache = new NodeCache({ stdTTL: 600 }); // 10 minutes
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // We'll use our custom CSP
  crossOriginEmbedderPolicy: false
}));
app.use(contentSecurityPolicy);

app.use(cors({
  origin: (origin, callback) => {
    // Allow chrome-extension origins and configured domains
    const allowedOrigins = [
      ...(process.env.ALLOWED_ORIGINS?.split(',') || []),
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//
    ];
    
    if (!origin || allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') return allowed === origin;
      return allowed.test(origin);
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Circuit breaker middleware
app.use(circuitBreakerStatsMiddleware);

// Rate limiting middleware
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Auth routes (public)
authRoutes(app);

// Routes with authentication
const apiRoutes = require('./routes/api');
const threatRoutes = require('./routes/threats');
const proxyRoutes = require('./routes/proxy');

app.use('/api/v1', authenticateExtension, apiRoutes);
app.use('/threats', authenticateExtension, threatRoutes);
app.use('/proxy', authenticateExtension, proxyRoutes);

// Local ML fallback endpoint
app.post('/local/analyze', authenticateExtension, async (req, res) => {
  try {
    const { content, context } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }
    
    const analysis = await localThreatDetector.analyzeThreat(content, context);
    
    res.json({
      ...analysis,
      fallback: true,
      message: 'Analysis performed using local ML model'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Local analysis failed',
      message: error.message
    });
  }
});

// Circuit breaker status endpoint
app.get('/system/circuit-breakers', authenticateExtension, (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  res.json(req.circuitBreakers.manager.getAllStats());
});

// Local ML model stats
app.get('/system/ml-stats', authenticateExtension, (req, res) => {
  res.json(localThreatDetector.getModelStats());
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// About endpoint
app.get('/about', (req, res) => {
  res.json({
    name: 'PromptGuardian Backend',
    description: 'API proxy and threat intelligence for PromptGuardian browser extension',
    features: [
      'API key pooling and rotation',
      'Threat intelligence aggregation',
      'Crowdsourced threat data',
      'Enterprise team sharing',
      'SOC 2/GDPR compliant data handling'
    ],
    endpoints: {
      '/api/v1': 'API management and configuration',
      '/threats': 'Threat intelligence and sharing',
      '/proxy': 'API proxy for xAI Grok and Brave Search',
      '/health': 'Health check',
      '/about': 'Service information'
    }
  });
});

// Features endpoint
app.get('/features', (req, res) => {
  res.json({
    api_proxy: {
      description: 'Proxy requests to xAI Grok and Brave Search APIs',
      benefits: ['Key pooling', 'Rate limit management', 'Failover support']
    },
    threat_intelligence: {
      description: 'Crowdsourced threat pattern sharing',
      benefits: ['Community detection', 'Real-time updates', 'Anonymous sharing']
    },
    enterprise: {
      description: 'Team collaboration and analytics',
      benefits: ['Centralized management', 'Usage analytics', 'Custom policies']
    },
    security: {
      description: 'SOC 2 and GDPR compliant data handling',
      benefits: ['Encrypted storage', 'Audit trails', 'Data anonymization']
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`PromptGuardian Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;