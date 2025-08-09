/**
 * Orchestrator Agent - Browser Compatible Version
 * Coordinates all other agents and manages the autonomous AI-security mesh workflow
 */

console.log('[OrchestratorAgent] 🎭 Initializing Autonomous Mesh Orchestrator...');

class OrchestratorAgent {
  constructor(config = {}) {
    this.agentId = 'orchestrator';
    this.agentType = 'orchestrator';
    this.config = config;
    
    this.activeAgents = new Map();
    this.threatThreshold = 0.3;
    this.currentMode = 'idle'; // 'prompt', 'social', 'idle'
    this.processingQueue = [];
    this.meshConnections = new Set();
    this.eventListeners = new Map();
    
    // Autonomous mesh integration
    this.meshId = config.meshId || `mesh_${Date.now()}`;
    this.autonomousMode = true;
    
    this.setupEventHandlers();
    this.initializeAutonomousMesh();
  }

  setupEventHandlers() {
    // Listen for detection events from other agents
    this.addEventListener('threat_detected', this.handleThreatDetection.bind(this));
    this.addEventListener('agent_ready', this.handleAgentReady.bind(this));
    this.addEventListener('context_change', this.handleContextChange.bind(this));
    this.addEventListener('analysis_complete', this.handleAnalysisComplete.bind(this));
    this.addEventListener('mesh_update', this.handleMeshUpdate.bind(this));
    
    console.log('[OrchestratorAgent] ✅ Event handlers initialized');
  }

  initializeAutonomousMesh() {
    // Connect to the global autonomous mesh
    if (window.autonomousSecurityMesh) {
      this.meshConnections.add('security_mesh');
      console.log('[OrchestratorAgent] 🔗 Connected to Autonomous Security Mesh');
    }
    
    if (window.dashboardSync) {
      this.meshConnections.add('dashboard_sync');
      console.log('[OrchestratorAgent] 📊 Connected to Dashboard Sync');
    }
    
    // Register with global agent registry
    window.promptGuardianAgents = window.promptGuardianAgents || {};
    window.promptGuardianAgents.orchestrator = this;
    
    console.log('[OrchestratorAgent] 🤖 Autonomous mesh integration complete');
  }

  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(handler);
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[OrchestratorAgent] Event handler error for ${event}:`, error);
        }
      });
    }
  }

  async broadcast(event, payload) {
    // Broadcast to all connected agents via SPM protocol
    const message = {
      type: 'SPM_BROADCAST',
      sender: this.agentId,
      event: event,
      payload: payload,
      timestamp: Date.now(),
      meshId: this.meshId
    };
    
    // Send to all active agents
    for (const [agentId, agentInfo] of this.activeAgents) {
      if (agentInfo.instance && typeof agentInfo.instance.receive === 'function') {
        try {
          await agentInfo.instance.receive(message);
        } catch (error) {
          console.warn(`[OrchestratorAgent] Failed to broadcast to ${agentId}:`, error.message);
        }
      }
    }
    
    // Send to autonomous mesh
    if (window.autonomousSecurityMesh) {
      const meshEvent = new CustomEvent('spm:broadcast', { detail: message });
      document.dispatchEvent(meshEvent);
    }
    
    console.log(`[OrchestratorAgent] 📡 Broadcasted ${event} to ${this.activeAgents.size} agents`);
  }

  async handleAgentReady(payload) {
    const { agentId, agentType, instance } = payload;
    
    this.activeAgents.set(agentId, {
      agentId,
      agentType,
      instance,
      status: 'ready',
      lastSeen: Date.now()
    });
    
    console.log(`[OrchestratorAgent] ✅ Agent ${agentType}(${agentId}) is ready`);
    
    // Notify autonomous mesh of new agent
    if (window.autonomousSecurityMesh) {
      const status = window.autonomousSecurityMesh.getStatus();
      await this.broadcast('mesh_status_update', {
        meshStatus: status,
        activeAgents: this.activeAgents.size
      });
    }
  }

  async handleContextChange(payload) {
    const { context, url, element } = payload;
    
    console.log(`[OrchestratorAgent] 🔄 Context change: ${context} at ${url}`);
    
    // Determine operating mode based on context
    let newMode = this.currentMode;
    
    if (url.includes('chat.openai.com') || url.includes('claude.ai') || url.includes('gemini.google.com')) {
      newMode = 'prompt';
    } else if (url.includes('x.com') || url.includes('twitter.com')) {
      newMode = 'social';  
    } else {
      newMode = 'general';
    }
    
    if (newMode !== this.currentMode) {
      this.currentMode = newMode;
      await this.broadcast('mode_change', { 
        mode: newMode, 
        context,
        autonomous: true,
        meshId: this.meshId
      });
      
      console.log(`[OrchestratorAgent] 🎯 Mode changed to: ${newMode}`);
    }
  }

  async handleThreatDetection(payload) {
    const { threatScore, threatType, content, source, context } = payload;
    
    if (threatScore > this.threatThreshold) {
      console.log(`[OrchestratorAgent] 🚨 High-priority threat detected: ${threatType} (${threatScore})`);
      
      // Queue for autonomous analysis
      const threatItem = {
        id: `threat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        threatScore,
        threatType,
        content,
        source,
        context,
        timestamp: Date.now(),
        status: 'queued',
        meshId: this.meshId,
        priority: threatScore > 0.7 ? 'high' : 'normal'
      };
      
      this.processingQueue.push(threatItem);
      await this.processQueue();
    }
  }

  async processQueue() {
    while (this.processingQueue.length > 0) {
      const item = this.processingQueue.shift();
      
      try {
        console.log(`[OrchestratorAgent] 🔄 Processing threat ${item.id}`);
        item.status = 'processing';
        
        await this.dispatchToAutonomousAnalysis(item);
        item.status = 'completed';
        
      } catch (error) {
        console.error(`[OrchestratorAgent] ❌ Error processing ${item.id}:`, error);
        item.status = 'error';
      }
    }
  }

  async dispatchToAutonomousAnalysis(threatItem) {
    const { threatType, content, context, priority, meshId } = threatItem;
    
    console.log(`[OrchestratorAgent] 🎯 Dispatching autonomous analysis for ${threatType}`);
    
    // Dispatch to appropriate agents based on threat type and mode
    if (this.currentMode === 'prompt') {
      await this.dispatchPromptAnalysis(threatItem);
    } else if (this.currentMode === 'social') {
      await this.dispatchSocialAnalysis(threatItem);
    } else {
      await this.dispatchGeneralAnalysis(threatItem);
    }
    
    // Send to autonomous mesh for backend analysis
    if (window.autonomousSecurityMesh) {
      window.autonomousSecurityMesh.queueThreat({
        type: threatType,
        severity: priority === 'high' ? 'CRITICAL' : 'MEDIUM',
        content: content,
        context: context,
        meshId: meshId,
        orchestratorId: this.agentId
      });
    }
  }

  async dispatchPromptAnalysis(threatItem) {
    console.log('[OrchestratorAgent] 🧠 Dispatching prompt analysis');
    
    // Send to Analysis Agent for enhanced Grok evaluation
    await this.broadcast('analyze_prompt_advanced', {
      data: threatItem.content,
      threatType: threatItem.threatType,
      priority: threatItem.priority,
      context: threatItem.context,
      meshId: threatItem.meshId,
      useGrok: true,
      temperature: 0.05 // Very precise analysis
    });
    
    // Send to Verification Agent for Brave API cross-verification
    await this.broadcast('verify_threat_intelligence', {
      query: threatItem.content,
      threatType: threatItem.threatType,
      context: 'prompt_injection',
      meshId: threatItem.meshId,
      useBrave: true
    });
    
    // Send to Detection Agent for pattern enhancement
    await this.broadcast('enhance_detection_patterns', {
      content: threatItem.content,
      detectedType: threatItem.threatType,
      meshId: threatItem.meshId
    });
  }

  async dispatchSocialAnalysis(threatItem) {
    console.log('[OrchestratorAgent] 📱 Dispatching social media analysis');
    
    // Enhanced social analysis with Grok's search capabilities
    await this.broadcast('analyze_social_advanced', {
      postData: threatItem.content,
      searchQuery: `"${threatItem.threatType}" social media threats security`,
      analysisType: ['spam', 'steganography', 'misinformation', 'coordinated_attacks'],
      meshId: threatItem.meshId,
      useGrok: true
    });
    
    // Cross-verify with Brave Search for social intelligence
    await this.broadcast('verify_social_intelligence', {
      query: threatItem.content,
      context: 'social_media_threat',
      platforms: ['twitter', 'x'],
      meshId: threatItem.meshId
    });
  }

  async dispatchGeneralAnalysis(threatItem) {
    console.log('[OrchestratorAgent] 🔍 Dispatching general threat analysis');
    
    await this.broadcast('analyze_general_threat', {
      content: threatItem.content,
      threatType: threatItem.threatType,
      context: threatItem.context,
      meshId: threatItem.meshId,
      comprehensive: true
    });
  }

  async handleAnalysisComplete(payload) {
    const { result, confidence, recommendations, agentType, meshId } = payload;
    
    console.log(`[OrchestratorAgent] ✅ Analysis complete from ${agentType}: ${confidence} confidence`);
    
    // Aggregate results from multiple agents
    const analysis = {
      timestamp: Date.now(),
      result,
      confidence,
      recommendations,
      source: agentType,
      mode: this.currentMode,
      meshId: meshId || this.meshId,
      orchestrated: true
    };
    
    // If high confidence threat detected, trigger autonomous mitigation
    if (confidence > 0.8 && result.isThreat) {
      await this.triggerAutonomousMitigation(analysis);
    }
    
    // Send to dashboard sync
    if (window.dashboardSync) {
      const dashboardEvent = new CustomEvent('promptguardian:analysis-complete', {
        detail: analysis
      });
      document.dispatchEvent(dashboardEvent);
    }
    
    // Log for adaptation learning
    await this.broadcast('log_analysis_learning', analysis);
  }

  async handleMeshUpdate(payload) {
    const { meshStatus, backendStatus, agentStats } = payload;
    
    console.log(`[OrchestratorAgent] 🔄 Mesh update: ${meshStatus}`);
    
    // Update internal state based on mesh status
    if (meshStatus === 'degraded') {
      console.log('[OrchestratorAgent] ⚠️ Mesh degraded - increasing local processing');
      this.threatThreshold = Math.max(0.2, this.threatThreshold - 0.1);
    } else if (meshStatus === 'active') {
      this.threatThreshold = 0.3; // Reset to normal
    }
  }

  async triggerAutonomousMitigation(analysis) {
    console.log('[OrchestratorAgent] 🛡️ Triggering autonomous mitigation');
    
    // Determine mitigation strategy based on mode and threat type
    const mitigationStrategy = this.determineAutonomousMitigationStrategy(analysis);
    
    await this.broadcast('execute_autonomous_mitigation', {
      strategy: mitigationStrategy,
      analysis,
      mode: this.currentMode,
      meshId: this.meshId,
      autonomous: true
    });
    
    // Notify user interface
    const mitigationEvent = new CustomEvent('promptguardian:autonomous-mitigation', {
      detail: {
        strategy: mitigationStrategy,
        analysis,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(mitigationEvent);
  }

  determineAutonomousMitigationStrategy(analysis) {
    const { result, mode, confidence } = analysis;
    
    if (mode === 'prompt') {
      return {
        type: 'autonomous_prompt_protection',
        severity: result.severity || 'HIGH',
        actions: [
          'real_time_input_blocking',
          'intelligent_suggestion_overlay', 
          'automatic_threat_reporting',
          confidence > 0.9 ? 'emergency_session_isolation' : 'enhanced_monitoring'
        ],
        autonomous: true
      };
    } else if (mode === 'social') {
      return {
        type: 'autonomous_social_protection',
        severity: result.severity || 'MEDIUM',
        actions: [
          'content_overlay_warning',
          'community_intelligence_sharing',
          'automated_fact_checking',
          'behavioral_pattern_analysis'
        ],
        autonomous: true
      };
    }
    
    return { 
      type: 'autonomous_general_protection', 
      actions: ['comprehensive_logging', 'pattern_learning'],
      autonomous: true 
    };
  }

  async process(input) {
    // Main entry point for orchestration
    const context = this.determineContext(input);
    
    console.log(`[OrchestratorAgent] 🔄 Processing input: ${context}`);
    
    // Dispatch context change to all agents
    await this.broadcast('context_change', {
      context,
      url: window.location.href,
      element: input.element || null,
      autonomous: true,
      meshId: this.meshId
    });
    
    return {
      orchestrated: true,
      autonomous: true,
      mode: this.currentMode,
      activeAgents: this.activeAgents.size,
      meshConnections: this.meshConnections.size,
      meshId: this.meshId
    };
  }

  determineContext(input) {
    if (input.type === 'keypress' || input.type === 'input') {
      return 'prompt_typing';
    } else if (input.type === 'scroll' || input.type === 'mutation') {
      return 'social_browsing';
    } else if (input.type === 'threat_detected') {
      return 'threat_analysis';
    }
    
    return 'general_monitoring';
  }

  async coordinateAnalysis(data) {
    // Coordinate comprehensive analysis across all agents and mesh
    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[OrchestratorAgent] 🎯 Coordinating analysis: ${analysisId}`);
    
    await this.broadcast('coordinate_autonomous_analysis', {
      analysisId,
      data,
      mode: this.currentMode,
      meshId: this.meshId,
      timestamp: Date.now(),
      autonomous: true
    });
    
    return { analysisId, status: 'coordinated', autonomous: true };
  }

  getAgentStatus() {
    return {
      agentId: this.agentId,
      agentType: this.agentType,
      autonomous: this.autonomousMode,
      activeAgents: Array.from(this.activeAgents.values()),
      currentMode: this.currentMode,
      queueLength: this.processingQueue.length,
      threatThreshold: this.threatThreshold,
      meshConnections: Array.from(this.meshConnections),
      meshId: this.meshId,
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }
}

// Initialize and export for autonomous mesh
window.OrchestratorAgent = OrchestratorAgent;

// Auto-initialize if autonomous mesh is available
if (window.autonomousSecurityMesh) {
  setTimeout(() => {
    if (!window.promptGuardianAgents?.orchestrator) {
      const orchestrator = new OrchestratorAgent({
        meshId: window.autonomousSecurityMesh.getStatus().meshId || `autonomous_${Date.now()}`
      });
      console.log('[OrchestratorAgent] 🚀 Auto-initialized for autonomous mesh');
    }
  }, 1000);
}

console.log('[OrchestratorAgent] 🌟 Browser-compatible Orchestrator Agent loaded');