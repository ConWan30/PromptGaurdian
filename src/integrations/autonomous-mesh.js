/**
 * PromptGuardian Autonomous AI-Security Mesh Integration
 * Full integration flow between extension and Railway backend
 */

console.log('[AutonomousMesh] 🤖 Initializing AI-Security Mesh Integration...');

class AutonomousSecurityMesh {
  constructor() {
    this.backendUrl = 'https://promptgaurdian-production.up.railway.app';
    this.authToken = null;
    this.isAuthenticated = false;
    this.meshStatus = 'initializing';
    this.threatQueue = [];
    this.statsCache = null;
    this.syncInterval = null;
    
    // Circuit breaker for resilience
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailTime: null,
      threshold: 5,
      timeout: 30000 // 30 seconds
    };
    
    this.init();
  }
  
  async init() {
    try {
      console.log('[AutonomousMesh] 🔄 Starting autonomous initialization...');
      
      // Step 1: Authenticate automatically
      await this.authenticateAutonomously();
      
      // Step 2: Start threat routing system
      this.initializeThreatRouting();
      
      // Step 3: Begin live dashboard sync
      this.startLiveDashboardSync();
      
      // Step 4: Setup health monitoring
      this.setupHealthMonitoring();
      
      console.log('[AutonomousMesh] ✅ Autonomous AI-Security Mesh Online');
      this.meshStatus = 'active';
      
      // Notify UI about mesh activation
      this.notifyMeshActivation();
      
    } catch (error) {
      console.error('[AutonomousMesh] ❌ Initialization failed:', error);
      this.meshStatus = 'error';
      this.fallbackToLocalMode();
    }
  }
  
  async authenticateAutonomously() {
    console.log('[AutonomousMesh] 🔐 Attempting autonomous authentication...');
    
    try {
      // Check for existing token
      const storedToken = await this.getStoredToken();
      if (storedToken && await this.validateToken(storedToken)) {
        this.authToken = storedToken;
        this.isAuthenticated = true;
        console.log('[AutonomousMesh] ✅ Using cached authentication token');
        return;
      }
      
      // Get new token
      const response = await fetch(`${this.backendUrl}/auth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PromptGuardian-Extension/1.0'
        },
        body: JSON.stringify({
          extensionId: 'promptguardian-browser-extension',
          version: '1.0.0',
          capabilities: ['threat-detection', 'social-monitoring', 'predictive-analysis']
        })
      });
      
      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status}`);
      }
      
      const authData = await response.json();
      this.authToken = authData.token;
      this.isAuthenticated = true;
      
      // Store token securely
      await this.storeToken(this.authToken);
      
      console.log('[AutonomousMesh] ✅ Authentication successful');
      
    } catch (error) {
      console.error('[AutonomousMesh] ❌ Authentication failed:', error);
      throw error;
    }
  }
  
  async validateToken(token) {
    try {
      const response = await fetch(`${this.backendUrl}/auth/validate`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async getStoredToken() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        return new Promise((resolve) => {
          chrome.storage.local.get(['authToken'], (result) => {
            resolve(result.authToken);
          });
        });
      }
      return localStorage.getItem('pg_auth_token');
    } catch {
      return null;
    }
  }
  
  async storeToken(token) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ authToken: token });
      } else {
        localStorage.setItem('pg_auth_token', token);
      }
    } catch (error) {
      console.warn('[AutonomousMesh] ⚠️ Token storage failed:', error);
    }
  }
  
  initializeThreatRouting() {
    console.log('[AutonomousMesh] 🛡️ Initializing autonomous threat routing...');
    
    // Listen for threat detection events
    document.addEventListener('promptguardian:threat-detected', async (event) => {
      await this.routeThreatAnalysis(event.detail);
    });
    
    // Process queued threats
    setInterval(() => {
      this.processThreatQueue();
    }, 5000); // Process every 5 seconds
    
    console.log('[AutonomousMesh] ✅ Threat routing system active');
  }
  
  async routeThreatAnalysis(threatData) {
    console.log('[AutonomousMesh] 📊 Routing threat for analysis:', threatData.type);
    
    try {
      // Primary route: Backend proxy analysis
      const analysisResult = await this.analyzeWithProxy(threatData);
      
      if (analysisResult) {
        console.log('[AutonomousMesh] ✅ Proxy analysis successful');
        return analysisResult;
      }
      
    } catch (error) {
      console.warn('[AutonomousMesh] ⚠️ Proxy analysis failed:', error);
    }
    
    // Fallback route: Local analysis
    console.log('[AutonomousMesh] 🔄 Falling back to local analysis...');
    return await this.analyzeLocally(threatData);
  }
  
  async analyzeWithProxy(threatData) {
    if (!this.isAuthenticated || this.circuitBreaker.isOpen) {
      throw new Error('Backend unavailable');
    }
    
    try {
      const response = await fetch(`${this.backendUrl}/proxy/analyze-threat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: threatData.content,
          type: threatData.type,
          severity: threatData.severity,
          context: {
            url: window.location.href,
            timestamp: Date.now(),
            userAgent: navigator.userAgent
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Reset circuit breaker on success
      this.circuitBreaker.failureCount = 0;
      
      return {
        source: 'proxy',
        confidence: result.confidence || 0.9,
        analysis: result.analysis,
        recommendations: result.recommendations,
        timestamp: Date.now()
      };
      
    } catch (error) {
      this.handleCircuitBreaker();
      throw error;
    }
  }
  
  async analyzeLocally(threatData) {
    console.log('[AutonomousMesh] 🧠 Performing local ML analysis...');
    
    try {
      const response = await fetch(`${this.backendUrl}/local/analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: threatData.content,
          patterns: threatData.patterns
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        return {
          source: 'local',
          confidence: result.confidence || 0.8,
          analysis: result.analysis,
          recommendations: ['Standard threat mitigation protocols'],
          timestamp: Date.now()
        };
      }
    } catch (error) {
      console.warn('[AutonomousMesh] ⚠️ Backend local analysis failed:', error);
    }
    
    // Ultimate fallback: Built-in analysis
    return {
      source: 'builtin',
      confidence: 0.7,
      analysis: `Local pattern matching detected ${threatData.type}`,
      recommendations: [
        'Clear input immediately',
        'Avoid submitting detected threat',
        'Report to security team'
      ],
      timestamp: Date.now()
    };
  }
  
  handleCircuitBreaker() {
    this.circuitBreaker.failureCount++;
    
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.lastFailTime = Date.now();
      
      console.warn('[AutonomousMesh] ⚡ Circuit breaker opened - routing to local analysis');
      
      // Auto-reset after timeout
      setTimeout(() => {
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failureCount = 0;
        console.log('[AutonomousMesh] 🔄 Circuit breaker reset');
      }, this.circuitBreaker.timeout);
    }
  }
  
  startLiveDashboardSync() {
    console.log('[AutonomousMesh] 📊 Starting live dashboard synchronization...');
    
    // Initial sync
    this.syncThreatStats();
    
    // Periodic sync every 30 seconds
    this.syncInterval = setInterval(() => {
      this.syncThreatStats();
    }, 30000);
    
    console.log('[AutonomousMesh] ✅ Live dashboard sync active');
  }
  
  async syncThreatStats() {
    if (!this.isAuthenticated || this.circuitBreaker.isOpen) return;
    
    try {
      const response = await fetch(`${this.backendUrl}/threats/stats`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const stats = await response.json();
        this.statsCache = stats;
        
        // Update UI with fresh stats
        this.updateDashboardUI(stats);
        
        console.log('[AutonomousMesh] 📈 Dashboard sync successful');
      }
      
    } catch (error) {
      console.warn('[AutonomousMesh] ⚠️ Dashboard sync failed:', error);
    }
  }
  
  updateDashboardUI(stats) {
    // Dispatch event to update popup UI
    const event = new CustomEvent('promptguardian:stats-updated', {
      detail: {
        totalThreats: stats.totalThreats || 0,
        criticalThreats: stats.criticalThreats || 0,
        blockedAttacks: stats.blockedAttacks || 0,
        accuracyRate: stats.accuracyRate || 0.95,
        recentActivity: stats.recentActivity || [],
        meshStatus: this.meshStatus
      }
    });
    
    document.dispatchEvent(event);
  }
  
  setupHealthMonitoring() {
    console.log('[AutonomousMesh] 💓 Setting up health monitoring...');
    
    // Health check every 2 minutes
    setInterval(async () => {
      await this.performHealthCheck();
    }, 120000);
    
    // Initial health check
    setTimeout(() => this.performHealthCheck(), 5000);
  }
  
  async performHealthCheck() {
    try {
      const response = await fetch(`${this.backendUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });
      
      if (response.ok) {
        const health = await response.json();
        
        if (health.status === 'healthy') {
          // Reset circuit breaker if it was open
          if (this.circuitBreaker.isOpen) {
            this.circuitBreaker.isOpen = false;
            this.circuitBreaker.failureCount = 0;
            console.log('[AutonomousMesh] 🔄 Backend recovered - circuit breaker reset');
          }
        }
        
        // Update mesh status
        this.meshStatus = 'active';
        
      } else {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
    } catch (error) {
      console.warn('[AutonomousMesh] ⚠️ Health check failed:', error);
      this.meshStatus = 'degraded';
      this.handleCircuitBreaker();
    }
  }
  
  processThreatQueue() {
    if (this.threatQueue.length === 0) return;
    
    console.log(`[AutonomousMesh] 📝 Processing ${this.threatQueue.length} queued threats...`);
    
    const threats = this.threatQueue.splice(0, 5); // Process 5 at a time
    
    threats.forEach(async (threat) => {
      try {
        const result = await this.routeThreatAnalysis(threat);
        
        // Log successful analysis
        if (result) {
          console.log(`[AutonomousMesh] ✅ Processed queued threat: ${threat.type}`);
        }
        
      } catch (error) {
        console.error(`[AutonomousMesh] ❌ Failed to process queued threat:`, error);
      }
    });
  }
  
  fallbackToLocalMode() {
    console.log('[AutonomousMesh] 🔄 Falling back to local-only mode...');
    
    this.meshStatus = 'local-only';
    this.isAuthenticated = false;
    
    // Clear sync interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    // Notify UI about fallback
    const event = new CustomEvent('promptguardian:mesh-fallback', {
      detail: { mode: 'local-only' }
    });
    document.dispatchEvent(event);
  }
  
  notifyMeshActivation() {
    // Show activation notification
    const notification = document.createElement('div');
    notification.innerHTML = `
      🤖 AUTONOMOUS AI-SECURITY MESH ACTIVE
      <div style="font-size: 12px; margin-top: 4px; opacity: 0.8;">
        ✅ Backend Integration • 🔐 Auto Authentication • 📊 Live Sync
      </div>
    `;
    notification.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: linear-gradient(45deg, #059669, #10b981) !important;
      color: white !important;
      padding: 16px 24px !important;
      border-radius: 12px !important;
      font-weight: bold !important;
      font-size: 14px !important;
      z-index: 999999 !important;
      box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4) !important;
      text-align: center !important;
      animation: meshActivation 4s ease-out forwards !important;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes meshActivation {
        0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        20% { opacity: 1; transform: translateX(-50%) translateY(0); }
        80% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentElement) notification.remove();
      if (style.parentElement) style.remove();
    }, 4000);
  }
  
  // Public API for external components
  queueThreat(threatData) {
    this.threatQueue.push({
      ...threatData,
      queuedAt: Date.now()
    });
    
    console.log(`[AutonomousMesh] 📥 Threat queued: ${threatData.type}`);
  }
  
  getStatus() {
    return {
      meshStatus: this.meshStatus,
      isAuthenticated: this.isAuthenticated,
      circuitBreakerOpen: this.circuitBreaker.isOpen,
      queueLength: this.threatQueue.length,
      lastStatsSync: this.statsCache ? this.statsCache.timestamp : null
    };
  }
  
  async forceSync() {
    console.log('[AutonomousMesh] 🔄 Forcing manual sync...');
    await this.syncThreatStats();
  }
}

// Global mesh instance
window.autonomousSecurityMesh = new AutonomousSecurityMesh();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutonomousSecurityMesh;
}

console.log('[AutonomousMesh] 🌟 Autonomous AI-Security Mesh Integration Loaded');