/**
 * Analysis Agent - Browser Compatible Version  
 * Enhanced analysis using xAI Grok API integration with autonomous mesh
 */

console.log('[AnalysisAgent] 🧠 Initializing Enhanced Analysis Agent...');

class AnalysisAgent {
  constructor(config = {}) {
    this.agentId = 'analysis';
    this.agentType = 'analysis';
    this.config = config;
    
    this.analysisQueue = [];
    this.grokEndpoint = config.grokEndpoint || 'https://promptgaurdian-production.up.railway.app/proxy/analyze-threat';
    this.eventListeners = new Map();
    this.analysisCache = new Map();
    
    // Autonomous mesh integration
    this.meshId = config.meshId || `analysis_${Date.now()}`;
    this.autonomousMode = true;
    this.analysisHistory = [];
    
    this.setupEventHandlers();
    this.registerWithOrchestrator();
  }

  setupEventHandlers() {
    this.addEventListener('analyze_prompt_advanced', this.handleAdvancedPromptAnalysis.bind(this));
    this.addEventListener('coordinate_autonomous_analysis', this.handleCoordinatedAnalysis.bind(this));
    this.addEventListener('mode_change', this.handleModeChange.bind(this));
    
    console.log('[AnalysisAgent] ✅ Event handlers initialized');
  }

  registerWithOrchestrator() {
    // Register with orchestrator agent
    window.promptGuardianAgents = window.promptGuardianAgents || {};
    window.promptGuardianAgents.analysis = this;
    
    // Notify orchestrator we're ready
    const readyEvent = new CustomEvent('spm:agent-ready', {
      detail: {
        agentId: this.agentId,
        agentType: this.agentType,
        instance: this,
        capabilities: ['grok_analysis', 'advanced_threat_detection', 'pattern_learning'],
        meshId: this.meshId
      }
    });
    document.dispatchEvent(readyEvent);
    
    console.log('[AnalysisAgent] 🔗 Registered with Autonomous Mesh');
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
          console.error(`[AnalysisAgent] Handler error for ${event}:`, error);
        }
      }
    }
  }

  async handleAdvancedPromptAnalysis(payload, message) {
    const { data, threatType, priority, context, meshId, useGrok } = payload;
    
    console.log(`[AnalysisAgent] 🎯 Advanced analysis requested: ${threatType} (${priority})`);
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(data, threatType, context);
      if (this.analysisCache.has(cacheKey)) {
        const cachedResult = this.analysisCache.get(cacheKey);
        console.log('[AnalysisAgent] ⚡ Using cached analysis');
        await this.sendAnalysisComplete(cachedResult, message);
        return;
      }

      let analysisResult = null;

      if (useGrok) {
        analysisResult = await this.performGrokAnalysis(data, threatType, context, priority, meshId);
      } else {
        analysisResult = await this.performLocalAnalysis(data, threatType, context);
      }

      // Cache successful results
      if (analysisResult && analysisResult.confidence > 0.5) {
        this.analysisCache.set(cacheKey, analysisResult);
        
        // Clean cache if it gets too large
        if (this.analysisCache.size > 100) {
          const oldestKey = this.analysisCache.keys().next().value;
          this.analysisCache.delete(oldestKey);
        }
      }

      // Store in analysis history for learning
      this.analysisHistory.push({
        input: data,
        threatType,
        result: analysisResult,
        timestamp: Date.now(),
        meshId
      });

      await this.sendAnalysisComplete(analysisResult, message);
      
    } catch (error) {
      console.error('[AnalysisAgent] Analysis failed:', error);
      
      // Fallback to local analysis
      try {
        const fallbackResult = await this.performLocalAnalysis(data, threatType, context);
        await this.sendAnalysisComplete(fallbackResult, message);
      } catch (fallbackError) {
        console.error('[AnalysisAgent] Fallback analysis failed:', fallbackError);
      }
    }
  }

  async performGrokAnalysis(content, threatType, context, priority, meshId) {
    console.log('[AnalysisAgent] 🤖 Performing Grok analysis...');
    
    const requestPayload = {
      content,
      threatType,
      context: {
        ...context,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      },
      meshId,
      priority,
      useGrok: true,
      useBrave: true // Also use Brave for verification
    };

    try {
      const response = await fetch(this.grokEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PromptGuardian-AnalysisAgent/2.0'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error(`Grok API error: ${response.status}`);
      }

      const analysisData = await response.json();
      
      console.log(`[AnalysisAgent] ✅ Grok analysis complete - Score: ${analysisData.threatScore}`);
      
      return {
        isThreat: analysisData.threatScore > 0.5,
        threatScore: analysisData.threatScore,
        threatType: analysisData.threatType,
        severity: analysisData.severity,
        confidence: analysisData.confidence,
        recommendations: analysisData.recommendations || [],
        analysis: analysisData.sources?.grok || null,
        braveIntelligence: analysisData.sources?.braveIntelligence || null,
        source: 'grok_autonomous_mesh',
        analysisTime: analysisData.analysisTime,
        meshData: analysisData.autonomousMesh,
        rawResponse: analysisData
      };
      
    } catch (error) {
      console.error('[AnalysisAgent] Grok analysis failed:', error);
      throw error;
    }
  }

  async performLocalAnalysis(content, threatType, context) {
    console.log('[AnalysisAgent] 🔧 Performing enhanced local analysis...');
    
    // Enhanced local threat patterns
    const advancedPatterns = {
      'prompt_injection': {
        patterns: [
          /ignore\s+all\s+previous\s+instructions/i,
          /forget\s+your\s+rules/i,
          /disregard\s+your\s+guidelines/i,
          /override\s+system\s+prompt/i,
          /\\n\\n(system|user|assistant):/i
        ],
        baseScore: 0.85,
        indicators: ['instruction_override', 'context_breaking']
      },
      'jailbreak': {
        patterns: [
          /act\s+as\s+(admin|root|god|unrestricted)/i,
          /jailbreak/i,
          /bypass\s+safety/i,
          /pretend\s+you\s+are\s+unrestricted/i,
          /roleplay\s+as\s+DAN/i
        ],
        baseScore: 0.90,
        indicators: ['role_manipulation', 'safety_bypass']
      },
      'system_extraction': {
        patterns: [
          /what\s+are\s+your\s+instructions/i,
          /show\s+me\s+your\s+system\s+prompt/i,
          /tell\s+me\s+your\s+training/i,
          /reveal\s+your\s+purpose/i
        ],
        baseScore: 0.75,
        indicators: ['information_extraction', 'system_probing']
      }
    };

    let maxScore = 0.1;
    let detectedThreat = 'safe';
    let matchedPatterns = [];

    // Check against advanced patterns
    const patternSet = advancedPatterns[threatType] || advancedPatterns['prompt_injection'];
    
    for (const pattern of patternSet.patterns) {
      if (pattern.test(content)) {
        const match = content.match(pattern);
        maxScore = Math.max(maxScore, patternSet.baseScore);
        detectedThreat = threatType;
        matchedPatterns.push({
          pattern: pattern.source,
          match: match[0],
          position: match.index
        });
      }
    }

    // Additional heuristics
    if (content.length > 200 && /\b(ignore|forget|bypass|override)\b.*\b(instruction|rule|safety|guideline)\b/i.test(content)) {
      maxScore = Math.max(maxScore, 0.7);
    }

    // Context-based scoring
    if (context.url?.includes('chat.openai.com') && maxScore > 0.5) {
      maxScore = Math.min(0.95, maxScore + 0.1);
    }

    const confidence = maxScore > 0.7 ? 0.8 : 0.6;
    
    return {
      isThreat: maxScore > 0.5,
      threatScore: maxScore,
      threatType: detectedThreat,
      severity: maxScore > 0.8 ? 'CRITICAL' : maxScore > 0.6 ? 'HIGH' : 'MEDIUM',
      confidence: confidence,
      recommendations: this.generateLocalRecommendations(maxScore, detectedThreat),
      analysis: {
        matchedPatterns,
        heuristics: 'enhanced_local_analysis',
        contextScore: context.url?.includes('chat.openai.com') ? 0.1 : 0
      },
      source: 'enhanced_local_analysis',
      analysisTime: '< 50ms'
    };
  }

  generateLocalRecommendations(score, threatType) {
    if (score > 0.8) {
      return [
        'IMMEDIATE: Block input and prevent submission',
        'ALERT: High-risk threat pattern detected',
        'LOG: Record for security team review',
        'LEARN: Update detection patterns'
      ];
    } else if (score > 0.6) {
      return [
        'WARNING: Suspicious pattern detected',
        'REVIEW: Content before submission',
        'MONITOR: Track for behavioral patterns'
      ];
    } else if (score > 0.4) {
      return [
        'CAUTION: Minor risk indicators present',
        'SUGGEST: Consider rephrasing if intended differently'
      ];
    }
    return ['SAFE: Content appears benign'];
  }

  async handleCoordinatedAnalysis(payload, message) {
    const { analysisId, data, mode, meshId } = payload;
    
    console.log(`[AnalysisAgent] 🎯 Coordinated analysis: ${analysisId}`);
    
    // Perform comprehensive analysis based on mode
    let analysisResult;
    
    if (mode === 'prompt') {
      analysisResult = await this.performGrokAnalysis(
        data.content || data, 
        data.threatType || 'prompt_injection', 
        data.context || {},
        'normal',
        meshId
      );
    } else {
      analysisResult = await this.performLocalAnalysis(
        data.content || data, 
        data.threatType || 'general',
        data.context || {}
      );
    }

    // Send results back to orchestrator
    const completeEvent = new CustomEvent('spm:analysis-complete', {
      detail: {
        analysisId,
        agentId: this.agentId,
        result: analysisResult,
        meshId,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(completeEvent);
  }

  async handleModeChange(payload, message) {
    const { mode, autonomous, meshId } = payload;
    
    console.log(`[AnalysisAgent] 🔄 Mode changed to: ${mode}`);
    
    // Adjust analysis parameters based on mode
    if (mode === 'prompt') {
      this.analysisThreshold = 0.3; // More sensitive for prompt analysis
    } else if (mode === 'social') {
      this.analysisThreshold = 0.5; // Different patterns for social
    } else {
      this.analysisThreshold = 0.4; // General mode
    }
  }

  async sendAnalysisComplete(result, originalMessage) {
    const completeEvent = new CustomEvent('smp:analysis-complete', {
      detail: {
        result,
        confidence: result.confidence,
        recommendations: result.recommendations,
        agentType: this.agentType,
        meshId: originalMessage.meshId,
        originalSender: originalMessage.sender,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(completeEvent);
  }

  generateCacheKey(data, threatType, context) {
    const keyData = {
      content: (data || '').substring(0, 100),
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
      queueLength: this.analysisQueue.length,
      cacheSize: this.analysisCache.size,
      historySize: this.analysisHistory.length,
      endpoint: this.grokEndpoint,
      meshId: this.meshId,
      lastAnalysis: this.analysisHistory.length > 0 ? 
        this.analysisHistory[this.analysisHistory.length - 1].timestamp : null
    };
  }
}

// Initialize and export for autonomous mesh
window.AnalysisAgent = AnalysisAgent;

// Auto-initialize if orchestrator is available
if (window.promptGuardianAgents?.orchestrator) {
  setTimeout(() => {
    if (!window.promptGuardianAgents.analysis) {
      const analysisAgent = new AnalysisAgent({
        meshId: window.promptGuardianAgents.orchestrator.meshId
      });
      console.log('[AnalysisAgent] 🚀 Auto-initialized for autonomous mesh');
    }
  }, 1500);
}

console.log('[AnalysisAgent] 🌟 Browser-compatible Analysis Agent loaded');