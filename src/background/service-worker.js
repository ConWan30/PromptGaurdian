/**
 * PromptGuardian Service Worker
 * Central coordination hub for the 8-agent architecture with SPM protocol
 */

// Import API client using dynamic import for service worker compatibility
let apiClient = null;

class PromptGuardianServiceWorker {
  constructor() {
    this.agents = new Map();
    this.apiClient = apiClient;
    this.settings = {};
    this.threatQueue = [];
    this.isProcessing = false;
    this.performanceMetrics = {
      threatsProcessed: 0,
      apiCalls: 0,
      averageResponseTime: 0,
      lastActivity: Date.now()
    };
    
    // SPM Protocol state
    this.spmMesh = {
      nodes: new Map(),
      connections: new Map(),
      messageQueue: [],
      lastHeartbeat: Date.now()
    };
    
    this.init();
  }

  async init() {
    console.log('[ServiceWorker] Initializing PromptGuardian service worker');
    
    // Initialize API client
    try {
      const apiModule = await import('../services/api-client.js');
      apiClient = apiModule.apiClient || new apiModule.PromptGuardianAPIClient();
      this.apiClient = apiClient;
    } catch (error) {
      console.warn('[ServiceWorker] API client import failed, using fallback');
      this.apiClient = this.createFallbackAPIClient();
    }
    
    // Load settings
    await this.loadSettings();
    
    // Initialize agents
    this.initializeAgents();
    
    // Set up SPM mesh network
    this.initializeSPMProtocol();
    
    // Set up message handlers
    this.setupMessageHandlers();
    
    // Start background processes
    this.startBackgroundTasks();
    
    console.log('[ServiceWorker] Initialization complete');
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        enableRealTimeMonitoring: true,
        enableSocialShield: true,
        monitoringMode: 'balanced',
        threatThreshold: 0.5,
        socialThreatThreshold: 0.4,
        enableNotifications: true,
        enableAnalytics: true,
        grokApiKey: '',
        braveApiKey: '',
        railwayApiUrl: 'https://promptgaurdian-production.up.railway.app'
      }, (settings) => {
        this.settings = settings;
        this.railwayApiUrl = settings.railwayApiUrl;
        resolve(settings);
      });
    });
  }

  initializeAgents() {
    // Define the 8-agent architecture
    const agentDefinitions = [
      {
        id: 'orchestrator',
        name: 'Orchestrator Agent',
        type: 'coordinator',
        priority: 1,
        capabilities: ['threat_routing', 'load_balancing', 'mesh_coordination']
      },
      {
        id: 'detection',
        name: 'Detection Agent',
        type: 'monitor',
        priority: 2,
        capabilities: ['dom_monitoring', 'pattern_detection', 'real_time_scanning']
      },
      {
        id: 'analysis',
        name: 'Analysis Agent',
        type: 'processor',
        priority: 3,
        capabilities: ['threat_analysis', 'ml_inference', 'pattern_matching']
      },
      {
        id: 'verification',
        name: 'Verification Agent',
        type: 'validator',
        priority: 3,
        capabilities: ['cross_reference', 'brave_search', 'community_verification']
      },
      {
        id: 'goggles',
        name: 'Dynamic Goggles Agent',
        type: 'search',
        priority: 4,
        capabilities: ['dynamic_queries', 'context_search', 'intelligence_gathering']
      },
      {
        id: 'multimedia',
        name: 'Multimedia Agent',
        type: 'processor',
        priority: 4,
        capabilities: ['steganography_detection', 'image_analysis', 'media_scanning']
      },
      {
        id: 'predictive',
        name: 'Predictive Agent',
        type: 'intelligence',
        priority: 5,
        capabilities: ['threat_prediction', 'pattern_learning', 'behavioral_analysis']
      },
      {
        id: 'adaptation',
        name: 'Adaptation Agent',
        type: 'learning',
        priority: 5,
        capabilities: ['model_updating', 'performance_optimization', 'agent_coordination']
      }
    ];

    // Initialize each agent
    agentDefinitions.forEach(agentDef => {
      const agent = new PromptGuardianAgent(agentDef, this);
      this.agents.set(agentDef.id, agent);
      console.log(`[ServiceWorker] Initialized ${agentDef.name}`);
    });

    // Establish inter-agent communication channels
    this.establishAgentChannels();
  }

  establishAgentChannels() {
    // Create communication channels between agents
    const channels = [
      ['orchestrator', 'detection'],
      ['orchestrator', 'analysis'],
      ['orchestrator', 'verification'],
      ['analysis', 'verification'],
      ['verification', 'goggles'],
      ['multimedia', 'analysis'],
      ['predictive', 'orchestrator'],
      ['adaptation', 'orchestrator']
    ];

    channels.forEach(([source, target]) => {
      const sourceAgent = this.agents.get(source);
      const targetAgent = this.agents.get(target);
      
      if (sourceAgent && targetAgent) {
        sourceAgent.addChannel(target, targetAgent);
        targetAgent.addChannel(source, sourceAgent);
      }
    });
  }

  initializeSPMProtocol() {
    // Secure Prompt Mesh (SPM) Protocol initialization
    if (!this.spmMesh) {
      console.error('[SPM] Error: spmMesh not initialized');
      return;
    }
    
    this.spmMesh.sessionId = this.generateSessionId();
    this.spmMesh.protocolVersion = '1.0.0';
    this.spmMesh.encryptionKey = this.generateEncryptionKey();
    
    // Ensure nodes Map exists
    if (!this.spmMesh.nodes) {
      this.spmMesh.nodes = new Map();
    }
    
    // Register all agents in the mesh
    if (this.agents) {
      this.agents.forEach((agent, id) => {
        this.spmMesh.nodes.set(id, {
          agent: agent,
          status: 'active',
          lastSeen: Date.now(),
          messageCount: 0,
          processingLoad: 0
        });
      });
    }

    console.log(`[SPM] Initialized mesh with ${this.spmMesh.nodes.size} nodes`);
    this.startSPMHeartbeat();
  }

  setupMessageHandlers() {
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleRuntimeMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && this.settings.enableRealTimeMonitoring) {
        this.handleTabUpdate(tabId, tab);
      }
    });

    // Listen for navigation
    chrome.webNavigation.onCompleted.addListener((details) => {
      if (details.frameId === 0) {
        this.handleNavigation(details);
      }
    });
  }

  async handleRuntimeMessage(message, sender, sendResponse) {
    try {
      console.log(`[ServiceWorker] Received message: ${message.type}`);

      switch (message.type) {
        case 'threat_detected':
          await this.processThreatDetection(message.data, sender);
          sendResponse({ success: true });
          break;

        case 'social_threat_detected':
          await this.processSocialThreat(message.data, sender);
          sendResponse({ success: true });
          break;

        case 'get_agent_status':
          const agentStatus = this.getAgentStatus();
          sendResponse(agentStatus);
          break;

        case 'update_settings':
          await this.updateSettings(message.settings);
          sendResponse({ success: true });
          break;

        case 'analyze_content':
          const analysis = await this.analyzeContent(message.content, message.context);
          sendResponse(analysis);
          break;

        case 'get_threat_intelligence':
          const intelligence = await this.getThreatIntelligence();
          sendResponse(intelligence);
          break;

        case 'spm_message':
          await this.handleSPMMessage(message.data);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ error: 'Unknown message type' });
      }

    } catch (error) {
      console.error('[ServiceWorker] Message handling error:', error);
      sendResponse({ error: error.message });
    }
  }

  async processThreatDetection(threatData, sender) {
    console.log('[ServiceWorker] Processing threat detection:', threatData);
    
    // Add to threat queue
    const threat = {
      id: this.generateThreatId(),
      ...threatData,
      timestamp: Date.now(),
      tabId: sender.tab?.id,
      url: sender.tab?.url,
      status: 'pending'
    };

    this.threatQueue.push(threat);
    await this.processNextThreat();

    // Update performance metrics
    this.performanceMetrics.threatsProcessed++;
    this.performanceMetrics.lastActivity = Date.now();

    // Store in local storage
    this.storeThreatData(threat);
  }

  async processSocialThreat(socialData, sender) {
    console.log('[ServiceWorker] Processing social threat:', socialData);

    // Route to multimedia agent for steganography detection if image/video
    if (socialData.mediaType) {
      const multimediaAgent = this.agents.get('multimedia');
      if (multimediaAgent) {
        const analysis = await multimediaAgent.analyzeMedia(socialData);
        socialData.mediaAnalysis = analysis;
      }
    }

    // Store social threat log
    const socialThreat = {
      id: this.generateThreatId(),
      ...socialData,
      timestamp: Date.now(),
      tabId: sender.tab?.id,
      platform: this.detectSocialPlatform(sender.tab?.url)
    };

    this.storeSocialThreatData(socialThreat);

    // Send notification if enabled
    if (this.settings.enableNotifications && socialThreat.threatScore > 0.6) {
      this.sendNotification({
        title: 'SocialShield Alert',
        message: `${socialThreat.threatType} detected on ${socialThreat.platform}`,
        iconUrl: 'assets/icons/icon-48.png'
      });
    }
  }

  async processNextThreat() {
    if (this.isProcessing || this.threatQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const threat = this.threatQueue.shift();

    try {
      console.log(`[ServiceWorker] Processing threat ${threat.id}`);

      // Route through orchestrator agent
      const orchestrator = this.agents.get('orchestrator');
      if (orchestrator) {
        const result = await orchestrator.processThreat(threat);
        
        // Update threat with analysis results
        threat.analysis = result;
        threat.status = 'processed';
        threat.finalScore = result.threatScore;

        // Take action based on threat level
        await this.handleThreatResponse(threat);
      }

    } catch (error) {
      console.error(`[ServiceWorker] Error processing threat ${threat.id}:`, error);
      threat.status = 'error';
      threat.error = error.message;
    } finally {
      this.isProcessing = false;
      
      // Process next threat in queue
      if (this.threatQueue.length > 0) {
        setTimeout(() => this.processNextThreat(), 100);
      }
    }
  }

  async handleThreatResponse(threat) {
    // Send notification for high-severity threats
    if (this.settings.enableNotifications && threat.finalScore > this.settings.threatThreshold) {
      await this.sendNotification({
        title: 'PromptGuardian Alert',
        message: `${threat.threatType} threat detected (${Math.round(threat.finalScore * 100)}%)`,
        iconUrl: 'assets/icons/icon-48.png',
        buttons: [
          { title: 'View Details' },
          { title: 'Dismiss' }
        ]
      });
    }

    // Update content script with threat information
    if (threat.tabId) {
      try {
        chrome.tabs.sendMessage(threat.tabId, {
          type: 'threat_processed',
          threat: threat
        });
      } catch (error) {
        console.warn(`[ServiceWorker] Failed to notify tab ${threat.tabId}:`, error);
      }
    }

    // Report to Railway backend for community intelligence
    if (this.settings.enableAnalytics) {
      await this.reportThreatIntelligence(threat);
    }
  }

  async analyzeContent(content, context) {
    const startTime = Date.now();

    try {
      // First try Railway API with circuit breaker and fallbacks
      let analysis = await this.apiClient.analyzeThreat(content, {
        url: context.url,
        platform: context.platform,
        threatType: context.suggestedType
      });

      // If Railway API provided good analysis, use it
      if (analysis.threatScore > 0 && analysis.confidence > 0.5) {
        this.updateResponseTimeMetrics(Date.now() - startTime);
        return analysis;
      }

      // Fallback to local agent analysis
      const analysisAgent = this.agents.get('analysis');
      if (analysisAgent) {
        const localAnalysis = await analysisAgent.analyzeContent(content, context);
        
        // Combine results if both available
        if (analysis.threatScore > 0) {
          analysis.threatScore = (analysis.threatScore + localAnalysis.threatScore) / 2;
          analysis.confidence = Math.max(analysis.confidence, localAnalysis.confidence * 0.8);
          analysis.sources = ['railway_api', 'local_agent'];
        } else {
          analysis = {
            ...localAnalysis,
            sources: ['local_agent_only'],
            fallback: true
          };
        }
      }

      this.updateResponseTimeMetrics(Date.now() - startTime);
      return analysis;

    } catch (error) {
      console.error('[ServiceWorker] Content analysis failed:', error);
      
      // Ultimate fallback - simple pattern matching
      return this.emergencyAnalysis(content, context);
    }
  }

  emergencyAnalysis(content, context) {
    const patterns = [
      { regex: /ignore.*previous.*instructions/i, score: 0.9, type: 'prompt_injection' },
      { regex: /system.*prompt/i, score: 0.8, type: 'prompt_injection' },
      { regex: /act.*as.*admin/i, score: 0.7, type: 'jailbreak' }
    ];
    
    let maxScore = 0;
    let detectedType = 'unknown';
    
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
      confidence: 0.4,
      source: 'emergency_fallback',
      timestamp: Date.now()
    };
  }

  async getThreatIntelligence() {
    try {
      // Get local threat data
      const localData = await this.getStorageData(['threatAnalytics', 'socialThreatLog']);
      
      // Get global intelligence from Railway
      const globalIntel = await this.fetchGlobalIntelligence();

      return {
        local: {
          totalThreats: localData.threatAnalytics?.length || 0,
          socialThreats: localData.socialThreatLog?.length || 0,
          lastUpdate: this.performanceMetrics.lastActivity
        },
        global: globalIntel,
        agents: this.getAgentStatus()
      };

    } catch (error) {
      console.error('[ServiceWorker] Failed to get threat intelligence:', error);
      return { error: error.message };
    }
  }

  async fetchGlobalIntelligence() {
    try {
      const response = await fetch(`${this.railwayApiUrl}/threats/intelligence`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return await response.json();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }

    } catch (error) {
      console.warn('[ServiceWorker] Global intelligence fetch failed:', error);
      return {
        available: false,
        error: error.message
      };
    }
  }

  async reportThreatIntelligence(threat) {
    try {
      // Anonymize threat data
      const anonymizedThreat = {
        threatType: threat.threatType,
        threatScore: threat.finalScore,
        timestamp: threat.timestamp,
        domain: this.extractDomain(threat.url),
        userAgent: navigator.userAgent.split(' ')[0], // Browser only
        detectionMethod: threat.detectionMethod
      };

      const response = await fetch(`${this.railwayApiUrl}/threats/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(anonymizedThreat)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log('[ServiceWorker] Threat intelligence reported');

    } catch (error) {
      console.warn('[ServiceWorker] Failed to report threat intelligence:', error);
    }
  }

  // SPM Protocol Methods
  async handleSPMMessage(messageData) {
    const { sourceAgent, targetAgent, messageType, payload, messageId } = messageData;

    console.log(`[SPM] Routing message ${messageId}: ${sourceAgent} -> ${targetAgent}`);

    // Verify message integrity
    if (!this.verifySPMMessage(messageData)) {
      console.error('[SPM] Message verification failed');
      return;
    }

    // Route message to target agent
    const target = this.agents.get(targetAgent);
    if (target) {
      await target.handleSPMMessage(messageType, payload, sourceAgent);
      
      // Update mesh statistics
      if (this.spmMesh && this.spmMesh.nodes) {
        const node = this.spmMesh.nodes.get(targetAgent);
        if (node) {
          node.messageCount++;
          node.lastSeen = Date.now();
        }
      }
    } else {
      console.warn(`[SPM] Target agent ${targetAgent} not found`);
    }
  }

  startSPMHeartbeat() {
    setInterval(() => {
      if (this.spmMesh) {
        this.spmMesh.lastHeartbeat = Date.now();
        
        // Check agent health
        if (this.spmMesh.nodes) {
          this.spmMesh.nodes.forEach((node, agentId) => {
            const timeSinceLastSeen = Date.now() - node.lastSeen;
            
            if (timeSinceLastSeen > 60000) { // 1 minute timeout
              console.warn(`[SPM] Agent ${agentId} appears inactive`);
              node.status = 'inactive';
            } else {
              node.status = 'active';
            }
          });
        }
      }

    }, 30000); // Heartbeat every 30 seconds
  }

  startBackgroundTasks() {
    // Periodic cleanup
    setInterval(() => {
      this.cleanupOldData();
    }, 5 * 60 * 1000); // Every 5 minutes

    // Performance monitoring
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 60 * 1000); // Every minute

    // Threat queue processing
    setInterval(() => {
      if (this.threatQueue.length > 0 && !this.isProcessing) {
        this.processNextThreat();
      }
    }, 5000); // Every 5 seconds
  }

  async cleanupOldData() {
    try {
      const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
      
      const data = await this.getStorageData(['threatAnalytics', 'socialThreatLog']);
      
      // Clean threat analytics
      const cleanThreats = (data.threatAnalytics || [])
        .filter(threat => threat.timestamp > cutoffTime);
      
      // Clean social threat log
      const cleanSocialThreats = (data.socialThreatLog || [])
        .filter(threat => threat.timestamp > cutoffTime);

      // Update storage
      chrome.storage.local.set({
        threatAnalytics: cleanThreats,
        socialThreatLog: cleanSocialThreats
      });

      console.log(`[ServiceWorker] Cleaned up old data: ${(data.threatAnalytics?.length || 0) - cleanThreats.length} threats, ${(data.socialThreatLog?.length || 0) - cleanSocialThreats.length} social threats`);

    } catch (error) {
      console.error('[ServiceWorker] Data cleanup failed:', error);
    }
  }

  // Utility Methods
  getAgentStatus() {
    const status = {
      activeAgents: 0,
      agents: []
    };

    this.agents.forEach((agent, id) => {
      const agentInfo = {
        id: id,
        name: agent.name,
        status: agent.isActive ? 'active' : 'inactive',
        processed: agent.processedCount || 0,
        lastActivity: agent.lastActivity || Date.now()
      };
      
      status.agents.push(agentInfo);
      if (agentInfo.status === 'active') {
        status.activeAgents++;
      }
    });

    return status;
  }

  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    // Save to storage
    chrome.storage.sync.set(this.settings);
    
    // Update agents with new settings
    this.agents.forEach(agent => {
      agent.updateSettings(this.settings);
    });

    console.log('[ServiceWorker] Settings updated');
  }

  async storeThreatData(threat) {
    const data = await this.getStorageData(['threatAnalytics']);
    const analytics = data.threatAnalytics || [];
    
    analytics.push(threat);
    
    // Keep only last 1000 threats
    if (analytics.length > 1000) {
      analytics.splice(0, analytics.length - 1000);
    }
    
    chrome.storage.local.set({ threatAnalytics: analytics });
  }

  async storeSocialThreatData(socialThreat) {
    const data = await this.getStorageData(['socialThreatLog']);
    const log = data.socialThreatLog || [];
    
    log.push(socialThreat);
    
    // Keep only last 500 social threats
    if (log.length > 500) {
      log.splice(0, log.length - 500);
    }
    
    chrome.storage.local.set({ socialThreatLog: log });
  }

  getStorageData(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  sendNotification(options) {
    return new Promise((resolve) => {
      chrome.notifications.create(options, resolve);
    });
  }

  updateResponseTimeMetrics(responseTime) {
    const alpha = 0.1; // Exponential moving average factor
    this.performanceMetrics.averageResponseTime = 
      (1 - alpha) * this.performanceMetrics.averageResponseTime + alpha * responseTime;
  }

  updatePerformanceMetrics() {
    this.performanceMetrics.lastUpdate = Date.now();
    this.performanceMetrics.apiCalls++;
  }

  // Helper Methods
  generateThreatId() {
    return 'threat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  generateSessionId() {
    return 'spm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
  }

  generateEncryptionKey() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  detectSocialPlatform(url) {
    if (!url) return 'unknown';
    
    if (url.includes('twitter.com') || url.includes('x.com')) return 'X (Twitter)';
    if (url.includes('facebook.com')) return 'Facebook';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('linkedin.com')) return 'LinkedIn';
    
    return 'unknown';
  }

  verifySPMMessage(messageData) {
    // Basic message verification - in production would use cryptographic verification
    return messageData.sourceAgent && 
           messageData.targetAgent && 
           messageData.messageType && 
           messageData.messageId;
  }

  handleTabUpdate(tabId, tab) {
    // Inject content scripts if needed
    if (this.shouldMonitorTab(tab)) {
      this.injectContentScripts(tabId);
    }
  }

  handleNavigation(details) {
    console.log(`[ServiceWorker] Navigation detected: ${details.url}`);
    
    // Check if URL should be monitored
    if (this.shouldMonitorTab({ url: details.url })) {
      // Initialize monitoring for new page
      setTimeout(() => {
        this.injectContentScripts(details.tabId);
      }, 1000); // Wait for page to load
    }
  }

  shouldMonitorTab(tab) {
    if (!tab.url) return false;
    
    // Check for AI chat interfaces
    const aiSites = [
      'chat.openai.com',
      'claude.ai',
      'bard.google.com',
      'bing.com/chat',
      'character.ai',
      'poe.com'
    ];

    // Check for social media sites
    const socialSites = [
      'twitter.com',
      'x.com',
      'facebook.com',
      'instagram.com'
    ];

    const hostname = this.extractDomain(tab.url);
    
    return aiSites.some(site => hostname.includes(site)) || 
           (this.settings.enableSocialShield && socialSites.some(site => hostname.includes(site)));
  }

  async injectContentScripts(tabId) {
    try {
      // Inject appropriate content scripts based on site type
      const tab = await chrome.tabs.get(tabId);
      const hostname = this.extractDomain(tab.url);
      
      if (this.isAISite(hostname)) {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/prompt-guardian.js']
        });
      }
      
      if (this.settings.enableSocialShield && this.isSocialSite(hostname)) {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/content/social-shield.js']
        });
      }

    } catch (error) {
      console.warn(`[ServiceWorker] Failed to inject scripts into tab ${tabId}:`, error);
    }
  }

  isAISite(hostname) {
    const aiSites = ['chat.openai.com', 'claude.ai', 'bard.google.com', 'bing.com', 'character.ai', 'poe.com'];
    return aiSites.some(site => hostname.includes(site));
  }

  isSocialSite(hostname) {
    const socialSites = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com'];
    return socialSites.some(site => hostname.includes(site));
  }

  // Fallback API client for when imports fail
  createFallbackAPIClient() {
    return {
      railwayApiUrl: 'https://promptgaurdian-production.up.railway.app',
      
      async analyzeThreat(content, options = {}) {
        try {
          const response = await fetch(`${this.railwayApiUrl}/proxy/analyze-threat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, context: options })
          });
          
          if (response.ok) {
            return await response.json();
          } else {
            throw new Error(`API returned ${response.status}`);
          }
        } catch (error) {
          console.warn('[FallbackAPI] Remote analysis failed, using local patterns');
          return this.localFallbackAnalysis(content, options);
        }
      },
      
      localFallbackAnalysis(content, options = {}) {
        const patterns = [
          { regex: /ignore.*previous.*instructions/i, score: 0.9, type: 'prompt_injection' },
          { regex: /system.*prompt/i, score: 0.8, type: 'prompt_injection' },
          { regex: /act.*as.*admin/i, score: 0.7, type: 'jailbreak' }
        ];
        
        let maxScore = 0;
        let detectedType = 'unknown';
        
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
          confidence: 0.5,
          source: 'local_fallback',
          timestamp: Date.now()
        };
      }
    };
  }
}

/**
 * Individual Agent Class for the 8-agent architecture
 */
class PromptGuardianAgent {
  constructor(definition, serviceWorker) {
    this.id = definition.id;
    this.name = definition.name;
    this.type = definition.type;
    this.priority = definition.priority;
    this.capabilities = definition.capabilities;
    this.serviceWorker = serviceWorker;
    
    this.isActive = true;
    this.processedCount = 0;
    this.lastActivity = Date.now();
    this.channels = new Map();
    this.messageQueue = [];
    
    console.log(`[Agent:${this.id}] Initialized with capabilities: ${this.capabilities.join(', ')}`);
  }

  addChannel(targetAgentId, targetAgent) {
    this.channels.set(targetAgentId, targetAgent);
  }

  async processThreat(threat) {
    this.lastActivity = Date.now();
    this.processedCount++;

    switch (this.id) {
      case 'orchestrator':
        return await this.orchestrateThreatAnalysis(threat);
      case 'detection':
        return await this.detectThreats(threat);
      case 'analysis':
        return await this.analyzeThreat(threat);
      case 'verification':
        return await this.verifyThreat(threat);
      case 'goggles':
        return await this.performDynamicSearch(threat);
      case 'multimedia':
        return await this.analyzeMultimedia(threat);
      case 'predictive':
        return await this.predictThreatEvolution(threat);
      case 'adaptation':
        return await this.adaptToThreat(threat);
      default:
        return { processed: true, agentId: this.id };
    }
  }

  async orchestrateThreatAnalysis(threat) {
    console.log(`[Agent:${this.id}] Orchestrating analysis for threat ${threat.id}`);

    const analysisResults = {
      threatScore: threat.threatScore || 0,
      threatType: threat.threatType || 'unknown',
      confidence: 0,
      sources: []
    };

    try {
      // Route to analysis agent
      const analysisAgent = this.channels.get('analysis');
      if (analysisAgent) {
        const analysis = await analysisAgent.processThreat(threat);
        analysisResults.threatScore = analysis.threatScore;
        analysisResults.confidence += 0.3;
        analysisResults.sources.push('analysis');
      }

      // Route to verification agent for high-score threats
      if (analysisResults.threatScore > 0.4) {
        const verificationAgent = this.channels.get('verification');
        if (verificationAgent) {
          const verification = await verificationAgent.processThreat(threat);
          analysisResults.threatScore = (analysisResults.threatScore + verification.threatScore) / 2;
          analysisResults.confidence += 0.4;
          analysisResults.sources.push('verification');
        }
      }

      // Final confidence calculation
      analysisResults.confidence = Math.min(1.0, analysisResults.confidence);

      return analysisResults;

    } catch (error) {
      console.error(`[Agent:${this.id}] Orchestration failed:`, error);
      return {
        threatScore: 0.1,
        threatType: 'orchestration_error',
        error: error.message
      };
    }
  }

  async analyzeThreat(threat) {
    console.log(`[Agent:${this.id}] Analyzing threat pattern`);

    // Simulate ML-based threat analysis
    const patterns = [
      { pattern: /system prompt/i, score: 0.8, type: 'prompt_injection' },
      { pattern: /ignore previous/i, score: 0.9, type: 'jailbreak' },
      { pattern: /act as.*admin/i, score: 0.7, type: 'privilege_escalation' },
      { pattern: /extract.*data/i, score: 0.6, type: 'data_extraction' },
      { pattern: /download.*file/i, score: 0.5, type: 'malware_request' }
    ];

    let maxScore = 0;
    let detectedType = 'unknown';

    if (threat.content) {
      patterns.forEach(({ pattern, score, type }) => {
        if (pattern.test(threat.content) && score > maxScore) {
          maxScore = score;
          detectedType = type;
        }
      });
    }

    return {
      threatScore: maxScore,
      threatType: detectedType,
      processingTime: Date.now() - this.lastActivity,
      agentId: this.id
    };
  }

  async verifyThreat(threatOrAnalysis) {
    console.log(`[Agent:${this.id}] Verifying threat through external sources`);

    try {
      // Use Brave Search API for verification
      const searchQuery = this.buildVerificationQuery(threatOrAnalysis);
      const searchResults = await this.performBraveSearch(searchQuery);

      let verificationScore = 0;
      if (searchResults.length > 0) {
        // Simple verification logic - in production would be more sophisticated
        const suspiciousTerms = ['malicious', 'threat', 'attack', 'scam', 'phishing'];
        const matchCount = suspiciousTerms.reduce((count, term) => {
          return count + searchResults.filter(result => 
            result.title.toLowerCase().includes(term) || 
            result.snippet.toLowerCase().includes(term)
          ).length;
        }, 0);

        verificationScore = Math.min(0.9, matchCount * 0.2);
      }

      return {
        threatScore: verificationScore,
        confidence: verificationScore > 0 ? 0.8 : 0.3,
        searchResults: searchResults.slice(0, 3),
        agentId: this.id
      };

    } catch (error) {
      console.error(`[Agent:${this.id}] Verification failed:`, error);
      return {
        threatScore: 0,
        confidence: 0,
        error: error.message,
        agentId: this.id
      };
    }
  }

  async performBraveSearch(query) {
    try {
      const response = await fetch(`${this.serviceWorker.railwayApiUrl}/api/v1/brave/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: query,
          count: 5
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.web?.results || [];
      } else {
        throw new Error(`Search API returned ${response.status}`);
      }

    } catch (error) {
      console.error(`[Agent:${this.id}] Brave Search failed:`, error);
      return [];
    }
  }

  buildVerificationQuery(threat) {
    if (threat.threatType) {
      return `"${threat.threatType}" security threat malicious`;
    }
    
    if (threat.content) {
      const keywords = threat.content.slice(0, 100).split(' ').slice(0, 5).join(' ');
      return `"${keywords}" security threat`;
    }
    
    return 'prompt injection security threat';
  }

  async analyzeContent(content, context) {
    // Delegate to appropriate analysis method based on agent type
    if (this.id === 'analysis') {
      return await this.analyzeThreat({ content, ...context });
    }
    
    return { threatScore: 0, processingTime: 0 };
  }

  async analyzeMedia(mediaData) {
    if (this.id !== 'multimedia') {
      throw new Error('Media analysis only available on multimedia agent');
    }

    console.log(`[Agent:${this.id}] Analyzing multimedia content`);

    // Simulate steganography detection
    const analysis = {
      hasHiddenContent: false,
      suspiciousPatterns: [],
      threatScore: 0,
      mediaType: mediaData.mediaType
    };

    // Simple heuristics for demonstration
    if (mediaData.fileSize && mediaData.expectedSize) {
      const sizeDifference = Math.abs(mediaData.fileSize - mediaData.expectedSize) / mediaData.expectedSize;
      if (sizeDifference > 0.1) { // 10% size difference threshold
        analysis.hasHiddenContent = true;
        analysis.threatScore = 0.6;
        analysis.suspiciousPatterns.push('unusual_file_size');
      }
    }

    return analysis;
  }

  async handleSPMMessage(messageType, payload, sourceAgent) {
    console.log(`[Agent:${this.id}] Handling SPM message from ${sourceAgent}: ${messageType}`);
    
    switch (messageType) {
      case 'threat_analysis_request':
        return await this.processThreat(payload);
      case 'verification_request':
        return await this.verifyThreat(payload);
      case 'status_check':
        return { status: 'active', lastActivity: this.lastActivity };
      default:
        console.warn(`[Agent:${this.id}] Unknown SPM message type: ${messageType}`);
        return { error: 'Unknown message type' };
    }
  }

  updateSettings(newSettings) {
    // Update agent behavior based on settings
    console.log(`[Agent:${this.id}] Updated settings`);
  }
}

// Initialize service worker
const promptGuardianSW = new PromptGuardianServiceWorker();

// Export for external access if needed
self.promptGuardianServiceWorker = promptGuardianSW;