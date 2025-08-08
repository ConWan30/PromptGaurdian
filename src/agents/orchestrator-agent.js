/**
 * Orchestrator Agent
 * Coordinates all other agents and manages the overall threat detection workflow
 */

import { BaseAgent } from './base-agent.js';

class OrchestratorAgent extends BaseAgent {
  constructor(config = {}) {
    super('Orchestrator', config);
    
    this.activeAgents = new Map();
    this.threatThreshold = 0.3;
    this.currentMode = 'idle'; // 'prompt', 'social', 'idle'
    this.processingQueue = [];
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Listen for detection events from other agents
    this.on('threat_detected', this.handleThreatDetection.bind(this));
    this.on('agent_ready', this.handleAgentReady.bind(this));
    this.on('context_change', this.handleContextChange.bind(this));
    this.on('analysis_complete', this.handleAnalysisComplete.bind(this));
  }

  async handleAgentReady(payload, message) {
    this.activeAgents.set(message.sender, {
      agentId: message.sender,
      type: payload.agentType,
      status: 'ready',
      lastSeen: Date.now()
    });
    
    console.log(`[Orchestrator] Agent ${payload.agentType} is ready`);
  }

  async handleContextChange(payload) {
    const { context, url, element } = payload;
    
    // Determine operating mode based on context
    if (url.includes('chat.openai.com') || url.includes('claude.ai')) {
      this.currentMode = 'prompt';
      await this.broadcast('mode_change', { mode: 'prompt', context });
    } else if (url.includes('x.com') || url.includes('twitter.com')) {
      this.currentMode = 'social';
      await this.broadcast('mode_change', { mode: 'social', context });
    }
  }

  async handleThreatDetection(payload) {
    const { threatScore, threatType, data, source } = payload;
    
    if (threatScore > this.threatThreshold) {
      // Queue for analysis by appropriate agents
      this.processingQueue.push({
        id: crypto.randomUUID(),
        threatScore,
        threatType,
        data,
        source,
        timestamp: Date.now(),
        status: 'queued'
      });
      
      await this.processQueue();
    }
  }

  async processQueue() {
    while (this.processingQueue.length > 0) {
      const item = this.processingQueue.shift();
      
      try {
        await this.dispatchToAgents(item);
        item.status = 'processing';
      } catch (error) {
        console.error(`[Orchestrator] Error processing queue item:`, error);
        item.status = 'error';
      }
    }
  }

  async dispatchToAgents(threatItem) {
    const { threatType, data, source } = threatItem;
    
    // Dispatch to appropriate agents based on threat type and mode
    if (this.currentMode === 'prompt') {
      await this.dispatchPromptAnalysis(threatItem);
    } else if (this.currentMode === 'social') {
      await this.dispatchSocialAnalysis(threatItem);
    }
  }

  async dispatchPromptAnalysis(threatItem) {
    // Send to Analysis Agent for Grok evaluation
    await this.broadcast('analyze_prompt', {
      data: threatItem.data,
      threatType: threatItem.threatType,
      priority: threatItem.threatScore > 0.7 ? 'high' : 'normal'
    });
    
    // Send to Verification Agent for Brave API cross-check
    await this.broadcast('verify_threat', {
      query: threatItem.data,
      context: 'prompt_injection'
    });
    
    // If multimedia content detected, dispatch to Multimedia Agent
    if (threatItem.data.includes('image') || threatItem.data.includes('video')) {
      await this.broadcast('scan_media', {
        content: threatItem.data,
        type: 'prompt'
      });
    }
  }

  async dispatchSocialAnalysis(threatItem) {
    const { data } = threatItem;
    
    // Use Grok API's Search tool for X post analysis
    await this.broadcast('analyze_social', {
      postData: data,
      searchQuery: `search X posts matching suspicious patterns`,
      analysisType: ['spam', 'steganography', 'misinformation']
    });
    
    // Cross-verify with Brave Search
    await this.broadcast('verify_social', {
      query: data.text || data.content,
      context: 'social_media_threat'
    });
    
    // Check for multimedia threats in posts
    if (data.media && data.media.length > 0) {
      await this.broadcast('scan_social_media', {
        mediaUrls: data.media,
        postContext: data
      });
    }
  }

  async handleAnalysisComplete(payload) {
    const { result, confidence, recommendations, agentType } = payload;
    
    // Aggregate results from multiple agents
    const analysis = {
      timestamp: Date.now(),
      result,
      confidence,
      recommendations,
      source: agentType,
      mode: this.currentMode
    };
    
    // If high confidence threat detected, trigger mitigation
    if (confidence > 0.8 && result.isThreat) {
      await this.triggerMitigation(analysis);
    }
    
    // Log for adaptation learning
    await this.broadcast('log_analysis', analysis);
  }

  async triggerMitigation(analysis) {
    // Determine mitigation strategy based on mode and threat type
    const mitigationStrategy = this.determineMitigationStrategy(analysis);
    
    await this.broadcast('execute_mitigation', {
      strategy: mitigationStrategy,
      analysis,
      mode: this.currentMode
    });
  }

  determineMitigationStrategy(analysis) {
    const { result, mode } = analysis;
    
    if (mode === 'prompt') {
      return {
        type: 'prompt_warning',
        severity: result.severity,
        actions: ['alert', 'suggest_alternative', 'block_if_critical']
      };
    } else if (mode === 'social') {
      return {
        type: 'social_warning',
        severity: result.severity,
        actions: ['overlay_warning', 'suggest_community_note', 'recommend_flag']
      };
    }
    
    return { type: 'default', actions: ['log'] };
  }

  async process(input) {
    // Main entry point for orchestration
    const context = this.determineContext(input);
    
    await this.broadcast('context_change', {
      context,
      url: window.location.href,
      element: input.element || null
    });
    
    return {
      orchestrated: true,
      mode: this.currentMode,
      activeAgents: Array.from(this.activeAgents.keys()).length
    };
  }

  determineContext(input) {
    if (input.type === 'keypress' || input.type === 'input') {
      return 'prompt_typing';
    } else if (input.type === 'scroll' || input.type === 'mutation') {
      return 'social_browsing';
    }
    
    return 'unknown';
  }

  async analyze(data) {
    // Coordinate analysis across all agents
    const analysisId = crypto.randomUUID();
    
    await this.broadcast('coordinate_analysis', {
      analysisId,
      data,
      mode: this.currentMode,
      timestamp: Date.now()
    });
    
    return { analysisId, status: 'initiated' };
  }

  getAgentStatus() {
    return {
      activeAgents: Array.from(this.activeAgents.values()),
      currentMode: this.currentMode,
      queueLength: this.processingQueue.length,
      threatThreshold: this.threatThreshold
    };
  }
}

export { OrchestratorAgent };