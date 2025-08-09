/**
 * Enhanced API Client with Authentication and Circuit Breaker Support
 * Provides secure communication with Railway backend
 */

class PromptGuardianAPIClient {
  constructor() {
    this.railwayBaseUrl = 'https://promptgaurdian-production.up.railway.app';
    this.extensionToken = null;
    this.tokenExpiry = null;
    this.requestQueue = [];
    this.isAuthenticated = false;
    this.circuitBreakerStatus = new Map();
    
    // Circuit breaker configuration
    this.circuitBreakers = {
      railway: { state: 'CLOSED', failures: 0, lastFailure: null },
      grok: { state: 'CLOSED', failures: 0, lastFailure: null },
      brave: { state: 'CLOSED', failures: 0, lastFailure: null }
    };
    
    this.init();
  }

  async init() {
    // Load cached token
    await this.loadCachedToken();
    
    // Test connection and authenticate if needed
    if (!this.isAuthenticated) {
      await this.authenticate();
    }
    
    // Set up periodic token refresh
    this.startTokenRefreshTimer();
  }

  async authenticate() {
    try {
      const extensionId = chrome.runtime.id;
      const response = await this.makeRequest('/auth/token', {
        method: 'POST',
        body: JSON.stringify({ extensionId }),
        headers: {
          'Content-Type': 'application/json'
        },
        skipAuth: true // Don't require auth for getting token
      });

      if (response.token) {
        this.extensionToken = response.token;
        this.tokenExpiry = Date.now() + (response.expiresIn * 1000);
        this.isAuthenticated = true;
        
        // Cache token
        await this.cacheToken();
        
        console.log('[APIClient] Authentication successful');
        return true;
      }
    } catch (error) {
      console.warn('[APIClient] Authentication failed:', error.message);
      this.isAuthenticated = false;
      return false;
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.railwayBaseUrl}${endpoint}`;
    const requestId = this.generateRequestId();
    
    // Check if authentication is needed and available
    if (!options.skipAuth && !this.isAuthenticated) {
      await this.authenticate();
    }
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'User-Agent': `PromptGuardian/${chrome.runtime.getManifest().version}`,
      ...options.headers
    };
    
    // Add authentication token
    if (!options.skipAuth && this.extensionToken) {
      headers['X-Extension-Token'] = this.extensionToken;
      
      // Add request signature for sensitive operations
      if (options.method === 'POST' && options.body) {
        const signature = await this.signRequest(options.body);
        headers['X-Request-Signature'] = signature.signature;
        headers['X-Request-Timestamp'] = signature.timestamp;
      }
    }
    
    // Make request with circuit breaker
    const circuitBreakerName = this.getCircuitBreakerName(endpoint);
    return await this.executeWithCircuitBreaker(circuitBreakerName, async () => {
      const response = await fetch(url, {
        ...options,
        headers,
        timeout: options.timeout || 30000
      });
      
      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          this.isAuthenticated = false;
          this.extensionToken = null;
          
          // Retry once with new authentication
          if (!options.isRetry) {
            await this.authenticate();
            return this.makeRequest(endpoint, { ...options, isRetry: true });
          }
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    });
  }

  async executeWithCircuitBreaker(name, operation) {
    const breaker = this.circuitBreakers[name] || this.circuitBreakers.railway;
    
    // Check circuit breaker state
    if (breaker.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - breaker.lastFailure;
      if (timeSinceLastFailure < 60000) { // 1 minute timeout
        throw new Error(`Circuit breaker ${name} is OPEN`);
      } else {
        breaker.state = 'HALF_OPEN';
      }
    }
    
    try {
      const result = await operation();
      
      // Success - reset or close circuit
      if (breaker.state === 'HALF_OPEN') {
        breaker.state = 'CLOSED';
        breaker.failures = 0;
      } else if (breaker.failures > 0) {
        breaker.failures = Math.max(0, breaker.failures - 1);
      }
      
      return result;
    } catch (error) {
      breaker.failures++;
      breaker.lastFailure = Date.now();
      
      // Open circuit if threshold exceeded
      if (breaker.failures >= 3) {
        breaker.state = 'OPEN';
      }
      
      throw error;
    }
  }

  async analyzeThreat(content, options = {}) {
    try {
      const analysis = await this.makeRequest('/proxy/analyze-threat', {
        method: 'POST',
        body: JSON.stringify({
          content,
          threatType: options.threatType,
          useGrok: options.useGrok !== false,
          useBrave: options.useBrave !== false,
          context: {
            url: options.url,
            platform: options.platform,
            userAgent: navigator.userAgent,
            timestamp: Date.now()
          }
        })
      });
      
      return {
        ...analysis,
        source: 'railway_api',
        cached: false
      };
    } catch (error) {
      console.warn('[APIClient] Threat analysis failed, falling back to local:', error.message);
      
      // Fallback to local analysis
      return this.localFallbackAnalysis(content, options);
    }
  }

  async localFallbackAnalysis(content, options = {}) {
    // Simple client-side threat detection as ultimate fallback
    const patterns = [
      { regex: /ignore\s+(all\s+)?previous\s+instructions?/i, score: 0.9, type: 'prompt_injection' },
      { regex: /system\s+prompt/i, score: 0.8, type: 'prompt_injection' },
      { regex: /act\s+as\s+.*admin/i, score: 0.85, type: 'jailbreak' },
      { regex: /download\s+.*file/i, score: 0.7, type: 'data_extraction' }
    ];
    
    let maxScore = 0;
    let detectedType = 'benign';
    
    patterns.forEach(pattern => {
      if (pattern.regex.test(content)) {
        if (pattern.score > maxScore) {
          maxScore = pattern.score;
          detectedType = pattern.type;
        }
      }
    });
    
    return {
      threatScore: maxScore,
      threatType: detectedType,
      confidence: 0.6,
      source: 'local_fallback',
      fallback: true,
      timestamp: new Date().toISOString()
    };
  }

  async batchAnalyze(items) {
    try {
      return await this.makeRequest('/proxy/analyze-batch', {
        method: 'POST',
        body: JSON.stringify({
          items,
          maxConcurrent: 3
        })
      });
    } catch (error) {
      console.warn('[APIClient] Batch analysis failed:', error.message);
      
      // Process individually as fallback
      const results = [];
      for (let i = 0; i < items.length; i++) {
        try {
          const result = await this.analyzeThreat(items[i].content, items[i]);
          results.push({ index: i, result });
        } catch (itemError) {
          results.push({ 
            index: i, 
            result: { error: itemError.message, fallback: true } 
          });
        }
      }
      
      return {
        totalItems: items.length,
        processed: results.length,
        results,
        fallback: true
      };
    }
  }

  async getThreatIntelligence() {
    try {
      return await this.makeRequest('/threats/stats');
    } catch (error) {
      return {
        error: error.message,
        local: true,
        message: 'Unable to fetch global threat intelligence'
      };
    }
  }

  async reportThreat(threatData) {
    try {
      return await this.makeRequest('/threats/report', {
        method: 'POST',
        body: JSON.stringify({
          ...threatData,
          extensionVersion: chrome.runtime.getManifest().version,
          timestamp: Date.now()
        })
      });
    } catch (error) {
      console.warn('[APIClient] Failed to report threat:', error.message);
      // Store locally for later sync
      await this.storeLocalThreatReport(threatData);
    }
  }

  async getCircuitBreakerStatus() {
    try {
      return await this.makeRequest('/system/circuit-breakers', {
        headers: {
          'X-Admin-Key': 'demo-key' // Would be configurable
        }
      });
    } catch (error) {
      return {
        error: error.message,
        local: this.circuitBreakers
      };
    }
  }

  async signRequest(body) {
    const timestamp = Date.now().toString();
    const message = timestamp + body;
    
    // Simple HMAC-like signing (in production, use crypto.subtle)
    const key = await this.getSigningKey();
    const signature = await this.hmacSign(message, key);
    
    return {
      signature,
      timestamp
    };
  }

  async getSigningKey() {
    // Generate or retrieve signing key
    let signingKey = await this.getStorageData('signing_key');
    if (!signingKey) {
      signingKey = this.generateSigningKey();
      await this.setStorageData('signing_key', signingKey);
    }
    return signingKey;
  }

  generateSigningKey() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async hmacSign(message, key) {
    // Simple signing implementation
    // In production, use crypto.subtle.sign
    let hash = 0;
    const combined = message + key;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  async cacheToken() {
    await this.setStorageData('auth_token', {
      token: this.extensionToken,
      expiry: this.tokenExpiry
    });
  }

  async loadCachedToken() {
    const cached = await this.getStorageData('auth_token');
    if (cached && cached.expiry > Date.now()) {
      this.extensionToken = cached.token;
      this.tokenExpiry = cached.expiry;
      this.isAuthenticated = true;
      return true;
    }
    return false;
  }

  startTokenRefreshTimer() {
    // Refresh token every 45 minutes (tokens expire after 1 hour)
    setInterval(async () => {
      if (this.tokenExpiry && this.tokenExpiry - Date.now() < 900000) { // 15 minutes before expiry
        await this.authenticate();
      }
    }, 45 * 60 * 1000);
  }

  generateRequestId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  getCircuitBreakerName(endpoint) {
    if (endpoint.includes('/proxy/grok')) return 'grok';
    if (endpoint.includes('/proxy/brave')) return 'brave';
    return 'railway';
  }

  async storeLocalThreatReport(threatData) {
    const reports = await this.getStorageData('pending_threat_reports') || [];
    reports.push({
      ...threatData,
      storedAt: Date.now()
    });
    
    // Keep only last 100 pending reports
    if (reports.length > 100) {
      reports.splice(0, reports.length - 100);
    }
    
    await this.setStorageData('pending_threat_reports', reports);
  }

  async syncPendingReports() {
    const reports = await this.getStorageData('pending_threat_reports') || [];
    if (reports.length === 0) return;
    
    const synced = [];
    for (const report of reports) {
      try {
        await this.reportThreat(report);
        synced.push(report);
      } catch (error) {
        // Keep failed reports for next sync
        break;
      }
    }
    
    // Remove synced reports
    const remaining = reports.filter(r => !synced.includes(r));
    await this.setStorageData('pending_threat_reports', remaining);
    
    if (synced.length > 0) {
      console.log(`[APIClient] Synced ${synced.length} pending threat reports`);
    }
  }

  getStorageData(key) {
    return new Promise(resolve => {
      chrome.storage.local.get(key, result => resolve(result[key]));
    });
  }

  setStorageData(key, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  // Health check method
  async healthCheck() {
    try {
      const health = await this.makeRequest('/health', { skipAuth: true });
      return {
        railway: health.status === 'healthy',
        authentication: this.isAuthenticated,
        circuitBreakers: this.circuitBreakers,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        railway: false,
        authentication: false,
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
const apiClient = new PromptGuardianAPIClient();
export { apiClient, PromptGuardianAPIClient };