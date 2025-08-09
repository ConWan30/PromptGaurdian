/**
 * Authentication and Security Middleware
 * Implements JWT-based authentication and API key management
 */

const crypto = require('crypto');
const NodeCache = require('node-cache');

// Security cache for tokens and rate limiting
const securityCache = new NodeCache({ stdTTL: 3600 }); // 1 hour

class SecurityManager {
  constructor() {
    this.extensionSecrets = new Map();
    this.bannedIPs = new Set();
    this.suspiciousActivityCache = new NodeCache({ stdTTL: 1800 }); // 30 minutes
    this.maxSuspiciousAttempts = 5;
  }

  // Generate secure extension token
  generateExtensionToken(extensionId, userAgent) {
    const payload = {
      extensionId,
      userAgent: this.hashUserAgent(userAgent),
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    const secret = process.env.JWT_SECRET || 'promptguardian-default-secret-change-this';
    const token = this.signPayload(payload, secret);
    
    // Cache token for validation
    securityCache.set(`token_${token}`, payload, 3600);
    
    return token;
  }

  // Validate extension token
  validateExtensionToken(token, ip) {
    if (this.bannedIPs.has(ip)) {
      throw new Error('IP address is banned');
    }

    const payload = securityCache.get(`token_${token}`);
    if (!payload) {
      this.recordSuspiciousActivity(ip, 'invalid_token');
      throw new Error('Invalid or expired token');
    }

    // Check token age (max 1 hour)
    if (Date.now() - payload.timestamp > 3600000) {
      securityCache.del(`token_${token}`);
      throw new Error('Token expired');
    }

    return payload;
  }

  // Record suspicious activity
  recordSuspiciousActivity(ip, type) {
    const key = `suspicious_${ip}`;
    const current = this.suspiciousActivityCache.get(key) || [];
    
    current.push({
      type,
      timestamp: Date.now()
    });

    // Ban IP if too many suspicious attempts
    if (current.length >= this.maxSuspiciousAttempts) {
      this.bannedIPs.add(ip);
      console.warn(`[Security] Banned IP ${ip} for suspicious activity:`, current);
    }

    this.suspiciousActivityCache.set(key, current, 1800);
  }

  // Sign payload with HMAC
  signPayload(payload, secret) {
    const data = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
    return Buffer.from(`${data}.${signature}`).toString('base64');
  }

  // Verify payload signature
  verifySignature(token, secret) {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [data, signature] = decoded.split('.');
      
      const expectedSignature = crypto.createHmac('sha256', secret)
        .update(data)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        throw new Error('Invalid signature');
      }
      
      return JSON.parse(data);
    } catch (error) {
      throw new Error('Invalid token format');
    }
  }

  // Hash user agent for privacy
  hashUserAgent(userAgent) {
    return crypto.createHash('sha256')
      .update(userAgent || 'unknown')
      .digest('hex')
      .slice(0, 16);
  }

  // Validate API key format
  validateApiKeyFormat(key, service) {
    const patterns = {
      grok: /^xai-[a-zA-Z0-9-_]{40,}$/,
      brave: /^[a-zA-Z0-9-_]{32,}$/
    };

    if (!patterns[service]) {
      throw new Error('Unknown service');
    }

    return patterns[service].test(key);
  }

  // Get security statistics
  getSecurityStats() {
    return {
      activeSessions: securityCache.keys().filter(k => k.startsWith('token_')).length,
      bannedIPs: this.bannedIPs.size,
      suspiciousActivities: this.suspiciousActivityCache.keys().length,
      timestamp: new Date().toISOString()
    };
  }
}

const securityManager = new SecurityManager();

// Middleware: Extension Authentication
const authenticateExtension = async (req, res, next) => {
  try {
    const token = req.headers['x-extension-token'];
    const userAgent = req.headers['user-agent'];
    const ip = req.ip || req.connection.remoteAddress;

    if (!token) {
      // For public endpoints, generate temporary token
      if (req.path === '/health' || req.path === '/about' || req.path === '/features') {
        return next();
      }
      
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Extension token missing',
        endpoint: '/auth/token'
      });
    }

    const payload = securityManager.validateExtensionToken(token, ip);
    req.extensionAuth = payload;
    req.clientIP = ip;
    
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: error.message
    });
  }
};

// Middleware: API Key Validation
const validateApiKey = (service) => {
  return (req, res, next) => {
    try {
      const apiKey = req.headers[`x-${service}-api-key`] || req.body.apiKey;
      
      if (apiKey) {
        if (!securityManager.validateApiKeyFormat(apiKey, service)) {
          return res.status(400).json({
            error: 'Invalid API key format',
            service,
            expectedFormat: service === 'grok' ? 'xai-*' : 'standard format'
          });
        }
        
        req.apiKeys = req.apiKeys || {};
        req.apiKeys[service] = apiKey;
      }
      
      next();
    } catch (error) {
      return res.status(400).json({
        error: 'API key validation failed',
        message: error.message
      });
    }
  };
};

// Middleware: Request Signing Validation
const validateRequestSignature = (req, res, next) => {
  try {
    const signature = req.headers['x-request-signature'];
    const timestamp = req.headers['x-request-timestamp'];
    const body = JSON.stringify(req.body);
    
    if (!signature || !timestamp) {
      return next(); // Optional for backward compatibility
    }
    
    // Check timestamp (prevent replay attacks)
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    
    if (Math.abs(now - requestTime) > 300000) { // 5 minutes tolerance
      return res.status(400).json({
        error: 'Request timestamp too old',
        maxAge: '5 minutes'
      });
    }
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.REQUEST_SIGNING_KEY || 'default-key')
      .update(`${timestamp}${body}`)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      securityManager.recordSuspiciousActivity(req.ip, 'invalid_signature');
      return res.status(400).json({
        error: 'Invalid request signature'
      });
    }
    
    next();
  } catch (error) {
    return res.status(400).json({
      error: 'Signature validation failed',
      message: error.message
    });
  }
};

// Middleware: Content Security Policy
const contentSecurityPolicy = (req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "connect-src 'self' https://api.x.ai https://api.search.brave.com",
    "frame-ancestors 'none'",
    "base-uri 'self'"
  ].join('; '));
  
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  next();
};

// Authentication routes
const authRoutes = (app) => {
  // Get extension token
  app.post('/auth/token', (req, res) => {
    try {
      const { extensionId } = req.body;
      const userAgent = req.headers['user-agent'];
      
      if (!extensionId) {
        return res.status(400).json({
          error: 'Extension ID required'
        });
      }
      
      const token = securityManager.generateExtensionToken(extensionId, userAgent);
      
      res.json({
        token,
        expiresIn: 3600,
        tokenType: 'extension',
        usage: 'Include in X-Extension-Token header'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Token generation failed',
        message: error.message
      });
    }
  });
  
  // Security status (admin endpoint)
  app.get('/auth/security-status', authenticateExtension, (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    res.json(securityManager.getSecurityStats());
  });
  
  // Unban IP (admin endpoint)
  app.delete('/auth/ban/:ip', authenticateExtension, (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    const { ip } = req.params;
    
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    securityManager.bannedIPs.delete(ip);
    securityManager.suspiciousActivityCache.del(`suspicious_${ip}`);
    
    res.json({
      message: `IP ${ip} unbanned successfully`,
      timestamp: new Date().toISOString()
    });
  });
};

module.exports = {
  SecurityManager,
  authenticateExtension,
  validateApiKey,
  validateRequestSignature,
  contentSecurityPolicy,
  authRoutes,
  securityManager
};