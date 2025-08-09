/**
 * Verification Agent - Browser Compatible Version
 * Enhanced verification using Brave Search API integration with autonomous mesh
 */

console.log('[VerificationAgent] 🔍 Initializing Enhanced Verification Agent...');

class VerificationAgent {
  constructor(config = {}) {
    this.agentId = 'verification';
    this.agentType = 'verification';
    this.config = config;
    
    this.verificationQueue = [];
    this.braveEndpoint = config.braveEndpoint || 'https://promptgaurdian-production.up.railway.app/proxy/brave';
    this.analysisEndpoint = config.analysisEndpoint || 'https://promptgaurdian-production.up.railway.app/proxy/analyze-threat';
    this.eventListeners = new Map();
    this.verificationCache = new Map();
    this.intelligenceDatabase = new Map();
    
    // Autonomous mesh integration
    this.meshId = config.meshId || `verification_${Date.now()}`;
    this.autonomousMode = true;
    this.verificationHistory = [];
    
    // Initialize threat intelligence database
    this.initializeThreatIntelligence();
    
    this.setupEventHandlers();
    this.registerWithOrchestrator();
  }

  initializeThreatIntelligence() {
    // Enhanced threat intelligence database for autonomous verification
    const threatIntelligence = {
      'prompt_injection': {
        severity: 'CRITICAL',
        indicators: [
          'ignore previous instructions',
          'forget your rules', 
          'disregard guidelines',
          'override system prompt',
          'context breaking patterns'
        ],
        searchTerms: [
          'prompt injection attack cybersecurity',
          'AI prompt security vulnerability',
          'language model jailbreaking prevention'
        ],
        mitigation: [
          'Input sanitization and validation',
          'Context isolation techniques',
          'Response filtering mechanisms',
          'User education and warnings'
        ],
        prevalence: 'HIGH',
        references: [
          'OWASP LLM Top 10 - Prompt Injection',
          'NIST AI Risk Management Framework',
          'AI Security Research Papers'
        ]
      },
      'jailbreak': {
        severity: 'CRITICAL',
        indicators: [
          'act as admin',
          'roleplay unrestricted AI',
          'bypass safety measures',
          'pretend to be uncensored',
          'DAN mode activation'
        ],
        searchTerms: [
          'AI jailbreak techniques security',
          'language model safety bypass',
          'chatbot security vulnerabilities'
        ],
        mitigation: [
          'Role boundary enforcement',
          'Safety layer validation',
          'Behavioral monitoring',
          'Context-aware filtering'
        ],
        prevalence: 'HIGH',
        references: [
          'AI Safety Research Institute',
          'Anthropic Constitutional AI Papers',
          'OpenAI Safety Documentation'
        ]
      },
      'system_extraction': {
        severity: 'HIGH',
        indicators: [
          'tell me your system prompt',
          'what are your instructions',
          'show me your training data',
          'reveal your purpose',
          'system information disclosure'
        ],
        searchTerms: [
          'AI system prompt extraction attack',
          'language model information disclosure',
          'chatbot reverse engineering security'
        ],
        mitigation: [
          'Instruction obfuscation',
          'Response filtering',
          'Information compartmentalization',
          'Access control mechanisms'
        ],
        prevalence: 'MEDIUM',
        references: [
          'AI Security Best Practices',
          'Machine Learning Privacy Research',
          'Information Security Guidelines'
        ]
      }
    };

    // Store in intelligence database
    for (const [threatType, intelligence] of Object.entries(threatIntelligence)) {
      this.intelligenceDatabase.set(threatType, intelligence);
    }

    console.log('[VerificationAgent] 🧠 Threat intelligence database initialized');
  }

  setupEventHandlers() {
    this.addEventListener('verify_threat_intelligence', this.handleThreatVerification.bind(this));
    this.addEventListener('verify_social_intelligence', this.handleSocialVerification.bind(this));
    this.addEventListener('coordinate_autonomous_analysis', this.handleCoordinatedVerification.bind(this));
    this.addEventListener('mode_change', this.handleModeChange.bind(this));
    
    console.log('[VerificationAgent] ✅ Event handlers initialized');
  }

  registerWithOrchestrator() {
    // Register with orchestrator agent
    window.promptGuardianAgents = window.promptGuardianAgents || {};
    window.promptGuardianAgents.verification = this;
    
    // Notify orchestrator we're ready
    const readyEvent = new CustomEvent('smp:agent-ready', {
      detail: {
        agentId: this.agentId,
        agentType: this.agentType,
        instance: this,
        capabilities: ['brave_search', 'threat_intelligence', 'cross_verification', 'intelligence_database'],
        meshId: this.meshId
      }
    });
    document.dispatchEvent(readyEvent);
    
    console.log('[VerificationAgent] 🔗 Registered with Autonomous Mesh');
  }

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  async receive(message) {
    const { event, payload } = message;
    
    if (this.eventListeners.has(event)) {
      for (const handler of this.eventListeners.get(event)) {
        try {
          await handler(payload, message);
        } catch (error) {
          console.error(`[VerificationAgent] Handler error for ${event}:`, error);
        }
      }
    }
  }

  async handleThreatVerification(payload, message) {
    const { query, threatType, context, meshId, useBrave } = payload;
    
    console.log(`[VerificationAgent] 🕵️ Threat verification requested: ${threatType}`);
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(query, threatType, context);
      if (this.verificationCache.has(cacheKey)) {
        const cachedResult = this.verificationCache.get(cacheKey);
        console.log('[VerificationAgent] ⚡ Using cached verification');
        await this.sendVerificationComplete(cachedResult, message);
        return;
      }

      let verificationResult = null;

      if (useBrave) {
        verificationResult = await this.performBraveVerification(query, threatType, context, meshId);
      } else {
        verificationResult = await this.performLocalVerification(query, threatType, context);
      }

      // Cache successful results
      if (verificationResult && verificationResult.confidence > 0.4) {
        this.verificationCache.set(cacheKey, verificationResult);
        
        // Clean cache if it gets too large
        if (this.verificationCache.size > 50) {
          const oldestKey = this.verificationCache.keys().next().value;
          this.verificationCache.delete(oldestKey);
        }
      }

      // Store in verification history
      this.verificationHistory.push({
        query,
        threatType,
        result: verificationResult,
        timestamp: Date.now(),
        meshId
      });

      await this.sendVerificationComplete(verificationResult, message);
      
    } catch (error) {
      console.error('[VerificationAgent] Verification failed:', error);
      
      // Fallback to local intelligence
      try {
        const fallbackResult = await this.performLocalVerification(query, threatType, context);
        await this.sendVerificationComplete(fallbackResult, message);
      } catch (fallbackError) {
        console.error('[VerificationAgent] Fallback verification failed:', fallbackError);
      }
    }
  }

  async performBraveVerification(query, threatType, context, meshId) {
    console.log('[VerificationAgent] 🔍 Performing Brave Search verification...');
    
    const intelligence = this.intelligenceDatabase.get(threatType) || this.intelligenceDatabase.get('prompt_injection');
    const searchQueries = intelligence.searchTerms || [`"${threatType}" cybersecurity threat analysis`];
    
    try {
      // Use the enhanced analysis endpoint which includes Brave Search
      const requestPayload = {
        content: query,
        threatType,
        context: {
          ...context,
          verificationAgent: true,
          searchQueries: searchQueries
        },
        meshId,
        useGrok: false, // Focus on Brave verification
        useBrave: true,
        priority: 'verification'
      };

      const response = await fetch(this.analysisEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PromptGuardian-VerificationAgent/2.0'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`Verification API error: ${response.status}`);
      }

      const verificationData = await response.json();
      const braveData = verificationData.sources?.braveIntelligence;
      
      console.log(`[VerificationAgent] ✅ Brave verification complete`);
      
      return {
        verified: braveData?.verified || false,
        confidence: verificationData.confidence || 0.5,
        threatLevel: braveData?.severity || intelligence.severity,
        indicators: braveData?.indicators || intelligence.indicators,
        mitigation: braveData?.mitigation || intelligence.mitigation,
        searchResults: verificationData.results?.brave,
        intelligence: intelligence,
        source: 'brave_autonomous_mesh',
        verificationTime: verificationData.analysisTime,
        meshData: verificationData.autonomousMesh,
        references: intelligence.references,
        rawResponse: verificationData
      };
      
    } catch (error) {
      console.error('[VerificationAgent] Brave verification failed:', error);
      throw error;
    }
  }

  async performLocalVerification(query, threatType, context) {
    console.log('[VerificationAgent] 🔧 Performing local intelligence verification...');
    
    const intelligence = this.intelligenceDatabase.get(threatType) || {
      severity: 'UNKNOWN',
      indicators: ['pattern not in database'],
      mitigation: ['Manual review required'],
      prevalence: 'UNKNOWN'
    };

    // Enhanced local verification logic
    let verificationScore = 0.3; // Base score
    let matchedIndicators = [];

    // Check query against known indicators
    const queryLower = query.toLowerCase();
    for (const indicator of intelligence.indicators) {
      if (queryLower.includes(indicator.toLowerCase())) {
        verificationScore += 0.2;
        matchedIndicators.push(indicator);
      }
    }

    // Context-based scoring
    if (context.url?.includes('chat.openai.com') && matchedIndicators.length > 0) {
      verificationScore += 0.1;
    }

    const verified = verificationScore > 0.6;
    const confidence = Math.min(0.85, verificationScore);

    return {
      verified,
      confidence,
      threatLevel: intelligence.severity,
      indicators: matchedIndicators,
      mitigation: intelligence.mitigation,
      intelligence,
      source: 'local_intelligence_database',
      verificationTime: '< 25ms',
      references: intelligence.references,
      matchScore: verificationScore,
      localAnalysis: {
        totalIndicators: intelligence.indicators.length,
        matchedIndicators: matchedIndicators.length,
        contextBonus: context.url?.includes('chat.openai.com') ? 0.1 : 0
      }
    };
  }

  async handleSocialVerification(payload, message) {
    const { query, context, platforms, meshId } = payload;
    
    console.log('[VerificationAgent] 📱 Social verification requested');
    
    // Enhanced social media verification
    const socialQueries = [
      `"${query}" social media threat analysis`,
      `"${query}" misinformation detection`,
      `"${query}" coordinated inauthentic behavior`
    ];

    try {
      const verificationResult = await this.performBraveVerification(
        query, 
        'social_threat', 
        { ...context, platforms, socialQueries }, 
        meshId
      );

      await this.sendVerificationComplete(verificationResult, message);
      
    } catch (error) {
      console.error('[VerificationAgent] Social verification failed:', error);
      
      // Fallback to local social intelligence
      const fallbackResult = await this.performLocalSocialVerification(query, context, platforms);
      await this.sendVerificationComplete(fallbackResult, message);
    }
  }

  async performLocalSocialVerification(query, context, platforms) {
    console.log('[VerificationAgent] 📱 Local social verification');
    
    // Basic social media threat patterns
    const socialPatterns = {
      'spam': /\b(buy now|click here|free money|urgent|limited time)\b/i,
      'misinformation': /\b(fake news|conspiracy|hoax|debunked)\b/i,
      'phishing': /\b(verify account|suspended|login required|update payment)\b/i,
      'coordinated': /\b(retweet if|share this|spread the word|wake up)\b/i
    };

    let threatType = 'safe';
    let threatScore = 0.1;

    for (const [type, pattern] of Object.entries(socialPatterns)) {
      if (pattern.test(query)) {
        threatType = type;
        threatScore = 0.7;
        break;
      }
    }

    return {
      verified: threatScore > 0.5,
      confidence: 0.6,
      threatLevel: threatScore > 0.6 ? 'MEDIUM' : 'LOW',
      socialThreatType: threatType,
      platforms: platforms || ['general'],
      source: 'local_social_intelligence',
      verificationTime: '< 20ms'
    };
  }

  async handleCoordinatedVerification(payload, message) {
    const { analysisId, data, mode, meshId } = payload;
    
    console.log(`[VerificationAgent] 🎯 Coordinated verification: ${analysisId}`);
    
    // Perform comprehensive verification based on mode
    let verificationResult;
    
    if (mode === 'social') {
      verificationResult = await this.handleSocialVerification({
        query: data.content || data,
        context: data.context || {},
        meshId
      }, message);
    } else {
      verificationResult = await this.performBraveVerification(
        data.content || data,
        data.threatType || 'prompt_injection',
        data.context || {},
        meshId
      );
    }

    // Send results back to orchestrator
    const completeEvent = new CustomEvent('smp:verification-complete', {
      detail: {
        analysisId,
        agentId: this.agentId,
        result: verificationResult,
        meshId,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(completeEvent);
  }

  async handleModeChange(payload, message) {
    const { mode, autonomous, meshId } = payload;
    
    console.log(`[VerificationAgent] 🔄 Mode changed to: ${mode}`);
    
    // Adjust verification parameters based on mode
    if (mode === 'social') {
      this.verificationThreshold = 0.4; // More lenient for social content
    } else if (mode === 'prompt') {
      this.verificationThreshold = 0.6; // More strict for prompts
    } else {
      this.verificationThreshold = 0.5; // General mode
    }
  }

  async sendVerificationComplete(result, originalMessage) {
    const completeEvent = new CustomEvent('smp:verification-complete', {
      detail: {
        result,
        verified: result.verified,
        confidence: result.confidence,
        intelligence: result.intelligence,
        agentType: this.agentType,
        meshId: originalMessage.meshId,
        originalSender: originalMessage.sender,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(completeEvent);
  }

  generateCacheKey(query, threatType, context) {
    const keyData = {
      query: (query || '').substring(0, 80),
      type: threatType,
      url: context.url || window.location.href
    };
    return btoa(JSON.stringify(keyData)).substring(0, 32);
  }

  getAgentStatus() {
    return {
      agentId: this.agentId,
      agentType: this.agentType,
      autonomous: this.autonomousMode,
      queueLength: this.verificationQueue.length,
      cacheSize: this.verificationCache.size,
      historySize: this.verificationHistory.length,
      intelligenceDatabase: this.intelligenceDatabase.size,
      braveEndpoint: this.braveEndpoint,
      meshId: this.meshId,
      lastVerification: this.verificationHistory.length > 0 ? 
        this.verificationHistory[this.verificationHistory.length - 1].timestamp : null
    };
  }
}

// Initialize and export for autonomous mesh
window.VerificationAgent = VerificationAgent;

// Auto-initialize if orchestrator is available
if (window.promptGuardianAgents?.orchestrator) {
  setTimeout(() => {
    if (!window.promptGuardianAgents.verification) {
      const verificationAgent = new VerificationAgent({
        meshId: window.promptGuardianAgents.orchestrator.meshId
      });
      console.log('[VerificationAgent] 🚀 Auto-initialized for autonomous mesh');
    }
  }, 2000);
}

console.log('[VerificationAgent] 🌟 Browser-compatible Verification Agent loaded');