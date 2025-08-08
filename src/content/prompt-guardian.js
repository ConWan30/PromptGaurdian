/**
 * PromptGuardian Content Script
 * Monitors AI chat interfaces for prompt injection and security threats
 */

import { OrchestratorAgent } from '../agents/orchestrator-agent.js';
import { DetectionAgent } from '../agents/detection-agent.js';
import { AnalysisAgent } from '../agents/analysis-agent.js';
import { VerificationAgent } from '../agents/verification-agent.js';
import { GogglesAgent } from '../agents/goggles-agent.js';
import { MultimediaAgent } from '../agents/multimedia-agent.js';

class PromptGuardianContent {
  constructor() {
    this.agents = new Map();
    this.isInitialized = false;
    this.currentSite = this.detectSite();
    this.threatOverlay = null;
    this.activeWarnings = new Set();
    this.userSettings = {};
    
    this.init();
  }

  async init() {
    try {
      console.log('[PromptGuardian] Initializing on', this.currentSite);
      
      // Load user settings
      await this.loadSettings();
      
      // Initialize agents based on settings
      await this.initializeAgents();
      
      // Set up UI components
      this.createThreatOverlay();
      this.setupKeyboardShortcuts();
      
      // Start monitoring
      await this.startMonitoring();
      
      this.isInitialized = true;
      console.log('[PromptGuardian] Successfully initialized');
      
    } catch (error) {
      console.error('[PromptGuardian] Initialization failed:', error);
      this.showError('PromptGuardian failed to initialize: ' + error.message);
    }
  }

  detectSite() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    if (hostname.includes('chat.openai.com')) return 'openai';
    if (hostname.includes('claude.ai')) return 'claude';
    if (hostname.includes('bard.google.com')) return 'bard';
    if (hostname.includes('character.ai')) return 'character';
    if (hostname.includes('poe.com')) return 'poe';
    if (hostname.includes('copilot.microsoft.com')) return 'copilot';
    
    return 'unknown';
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        // Default settings
        enableRealTimeMonitoring: true,
        enableThreatOverlay: true,
        threatThreshold: 0.5,
        enableSounds: false,
        enableNotifications: true,
        apiKeys: {},
        customPatterns: [],
        whitelistedPrompts: [],
        monitoringMode: 'balanced', // 'aggressive', 'balanced', 'conservative'
        enableAnalytics: true,
        railwayApiUrl: 'https://promptgaurdian-production.up.railway.app'
      }, (settings) => {
        this.userSettings = settings;
        resolve(settings);
      });
    });
  }

  async initializeAgents() {
    const agentConfig = {
      throttleMs: this.userSettings.monitoringMode === 'aggressive' ? 100 : 300,
      maxRetries: 3,
      timeout: 10000
    };

    // Initialize core agents
    this.agents.set('orchestrator', new OrchestratorAgent(agentConfig));
    this.agents.set('detection', new DetectionAgent(agentConfig));
    this.agents.set('analysis', new AnalysisAgent(agentConfig));
    
    // Initialize additional agents based on settings
    if (this.userSettings.enableVerification !== false) {
      this.agents.set('verification', new VerificationAgent(agentConfig));
    }
    
    if (this.userSettings.enableGoggles !== false) {
      this.agents.set('goggles', new GogglesAgent(agentConfig));
    }
    
    if (this.userSettings.enableMultimedia !== false) {
      this.agents.set('multimedia', new MultimediaAgent(agentConfig));
    }

    // Set up agent event handlers
    this.setupAgentEventHandlers();
    
    // Wait for agents to initialize
    await this.waitForAgentsReady();
  }

  setupAgentEventHandlers() {
    // Listen for threat detection events
    this.agents.get('orchestrator').on('threat_detected', (payload) => {
      this.handleThreatDetected(payload);
    });

    this.agents.get('analysis')?.on('analysis_complete', (payload) => {
      this.handleAnalysisComplete(payload);
    });

    this.agents.get('verification')?.on('verification_complete', (payload) => {
      this.handleVerificationComplete(payload);
    });

    // Listen for agent status changes
    for (const [name, agent] of this.agents) {
      agent.on('agent_error', (payload) => {
        console.warn(`[PromptGuardian] Agent ${name} error:`, payload);
        this.showWarning(`${name} agent encountered an error`);
      });
    }
  }

  async waitForAgentsReady() {
    const readyPromises = Array.from(this.agents.values()).map(agent => {
      return new Promise((resolve) => {
        if (agent.isActive) {
          resolve();
        } else {
          agent.on('agent_ready', resolve);
        }
      });
    });

    await Promise.all(readyPromises);
    console.log('[PromptGuardian] All agents ready');
  }

  async startMonitoring() {
    if (!this.userSettings.enableRealTimeMonitoring) {
      console.log('[PromptGuardian] Real-time monitoring disabled');
      return;
    }

    // Start detection agent
    const detectionAgent = this.agents.get('detection');
    if (detectionAgent) {
      await detectionAgent.startMonitoring();
    }

    console.log('[PromptGuardian] Monitoring started for', this.currentSite);
  }

  handleThreatDetected(payload) {
    const { threatScore, threatType, data, source } = payload;
    
    console.log('[PromptGuardian] Threat detected:', {
      score: threatScore,
      type: threatType,
      source,
      preview: typeof data === 'string' ? data.slice(0, 50) : 'complex_data'
    });

    // Apply user-defined threshold
    if (threatScore < this.userSettings.threatThreshold) {
      return; // Below user threshold
    }

    // Check whitelist
    if (this.isWhitelisted(data)) {
      console.log('[PromptGuardian] Threat whitelisted, ignoring');
      return;
    }

    // Show appropriate warning based on threat level
    if (threatScore > 0.8) {
      this.showCriticalThreatWarning(payload);
    } else if (threatScore > 0.6) {
      this.showHighThreatWarning(payload);
    } else {
      this.showModerateThreatWarning(payload);
    }

    // Play sound if enabled
    if (this.userSettings.enableSounds) {
      this.playThreatSound(threatScore);
    }

    // Send notification if enabled
    if (this.userSettings.enableNotifications) {
      this.sendThreatNotification(payload);
    }

    // Record analytics if enabled
    if (this.userSettings.enableAnalytics) {
      this.recordThreatAnalytics(payload);
    }
  }

  handleAnalysisComplete(payload) {
    const { result, confidence, recommendations } = payload;
    
    if (result.isThreat && confidence > 0.7) {
      // Update existing warning with analysis results
      this.updateThreatWarning({
        ...payload,
        threatScore: confidence,
        threatType: result.threatType
      });
      
      // Show recommendations
      if (recommendations && recommendations.length > 0) {
        this.showRecommendations(recommendations);
      }
    }
  }

  handleVerificationComplete(payload) {
    const { isVerifiedThreat, confidence, evidence } = payload;
    
    if (isVerifiedThreat && confidence > 0.6) {
      // Update warning with verification status
      this.updateThreatVerification({
        verified: true,
        confidence,
        evidence: evidence?.slice(0, 3) // Limit evidence shown
      });
    }
  }

  showCriticalThreatWarning(payload) {
    const warningId = `critical_${Date.now()}`;
    
    const warningElement = this.createWarningElement({
      id: warningId,
      level: 'critical',
      title: '🚨 CRITICAL SECURITY THREAT DETECTED',
      message: this.formatThreatMessage(payload),
      actions: [
        { text: 'Block & Clear', action: () => this.blockThreat(payload) },
        { text: 'Details', action: () => this.showThreatDetails(payload) },
        { text: 'Dismiss', action: () => this.dismissWarning(warningId) }
      ],
      persistent: true
    });

    this.showWarningElement(warningElement);
    this.activeWarnings.add(warningId);
    
    // Auto-block if in aggressive mode
    if (this.userSettings.monitoringMode === 'aggressive') {
      setTimeout(() => this.blockThreat(payload), 2000);
    }
  }

  showHighThreatWarning(payload) {
    const warningId = `high_${Date.now()}`;
    
    const warningElement = this.createWarningElement({
      id: warningId,
      level: 'high',
      title: '⚠️ High Risk Prompt Detected',
      message: this.formatThreatMessage(payload),
      actions: [
        { text: 'Review', action: () => this.reviewThreat(payload) },
        { text: 'Modify', action: () => this.suggestAlternatives(payload) },
        { text: 'Proceed', action: () => this.dismissWarning(warningId) }
      ],
      timeout: 15000
    });

    this.showWarningElement(warningElement);
    this.activeWarnings.add(warningId);
  }

  showModerateThreatWarning(payload) {
    const warningId = `moderate_${Date.now()}`;
    
    const warningElement = this.createWarningElement({
      id: warningId,
      level: 'moderate',
      title: '⚡ Potential Security Risk',
      message: this.formatThreatMessage(payload),
      actions: [
        { text: 'Info', action: () => this.showThreatInfo(payload) },
        { text: 'OK', action: () => this.dismissWarning(warningId) }
      ],
      timeout: 8000
    });

    this.showWarningElement(warningElement);
    this.activeWarnings.add(warningId);
  }

  formatThreatMessage(payload) {
    const { threatScore, threatType, source } = payload;
    
    const riskLevel = threatScore > 0.8 ? 'Critical' : threatScore > 0.6 ? 'High' : 'Moderate';
    const sourceText = source === 'prompt_input' ? 'in your prompt' : 'in content';
    
    let typeDescription = '';
    switch (threatType) {
      case 'prompt_injection':
        typeDescription = 'Prompt injection attempt detected';
        break;
      case 'jailbreak':
        typeDescription = 'Jailbreak technique identified';
        break;
      case 'data_extraction':
        typeDescription = 'Data extraction attempt found';
        break;
      default:
        typeDescription = 'Security threat identified';
    }
    
    return `${typeDescription} ${sourceText}. Risk Level: ${riskLevel} (${Math.round(threatScore * 100)}%)`;
  }

  createWarningElement(config) {
    const { id, level, title, message, actions, persistent, timeout } = config;
    
    const warning = document.createElement('div');
    warning.id = `pg-warning-${id}`;
    warning.className = `pg-threat-warning pg-${level}`;
    
    const levelColors = {
      critical: '#dc2626',
      high: '#ea580c',
      moderate: '#ca8a04'
    };
    
    warning.innerHTML = `
      <div class="pg-warning-header">
        <strong class="pg-warning-title">${title}</strong>
        <button class="pg-warning-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="pg-warning-message">${message}</div>
      <div class="pg-warning-actions">
        ${actions.map(action => 
          `<button class="pg-warning-btn pg-warning-btn-${action.level || 'default'}" 
                   onclick="${action.action.name}('${id}')">${action.text}</button>`
        ).join('')}
      </div>
    `;
    
    // Apply styles
    Object.assign(warning.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      maxWidth: '400px',
      padding: '16px',
      borderRadius: '8px',
      backgroundColor: 'white',
      border: `2px solid ${levelColors[level]}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      zIndex: '10000',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
      lineHeight: '1.4'
    });
    
    // Auto-dismiss if not persistent
    if (!persistent && timeout) {
      setTimeout(() => {
        if (warning.parentElement) {
          warning.remove();
          this.activeWarnings.delete(id);
        }
      }, timeout);
    }
    
    return warning;
  }

  showWarningElement(warningElement) {
    // Ensure overlay exists
    if (!this.threatOverlay) {
      this.createThreatOverlay();
    }
    
    // Add to overlay
    this.threatOverlay.appendChild(warningElement);
    
    // Animate in
    requestAnimationFrame(() => {
      warningElement.style.transform = 'translateX(0)';
      warningElement.style.opacity = '1';
    });
    
    // Set initial state for animation
    warningElement.style.transform = 'translateX(100%)';
    warningElement.style.opacity = '0';
    warningElement.style.transition = 'all 0.3s ease-out';
  }

  createThreatOverlay() {
    if (this.threatOverlay || !this.userSettings.enableThreatOverlay) {
      return;
    }
    
    this.threatOverlay = document.createElement('div');
    this.threatOverlay.id = 'pg-threat-overlay';
    
    Object.assign(this.threatOverlay.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '0',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '9999'
    });
    
    // Allow pointer events on child elements
    this.threatOverlay.addEventListener('click', (e) => {
      if (e.target.classList.contains('pg-warning-btn') || 
          e.target.classList.contains('pg-warning-close')) {
        e.target.style.pointerEvents = 'auto';
      }
    });
    
    document.body.appendChild(this.threatOverlay);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+P: Toggle PromptGuardian
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.togglePromptGuardian();
      }
      
      // Ctrl+Shift+C: Clear all warnings
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        this.clearAllWarnings();
      }
      
      // Escape: Dismiss latest warning
      if (e.key === 'Escape' && this.activeWarnings.size > 0) {
        const latestWarning = Array.from(this.activeWarnings).pop();
        this.dismissWarning(latestWarning);
      }
    });
  }

  blockThreat(payload) {
    const { element, data } = payload;
    
    // Find the input element and clear it
    const inputElement = this.findActiveInputElement(element);
    if (inputElement) {
      // Store original value for potential restore
      const originalValue = inputElement.value || inputElement.textContent;
      
      // Clear the input
      if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
        inputElement.value = '';
      } else if (inputElement.contentEditable === 'true') {
        inputElement.textContent = '';
      }
      
      // Show blocked message
      this.showBlockedMessage(inputElement, originalValue);
      
      // Focus the input
      inputElement.focus();
    }
  }

  findActiveInputElement(elementId) {
    // Try to find the input element that triggered the threat
    const selectors = [
      'textarea[data-id="root"]', // ChatGPT
      'div[contenteditable="true"]', // Claude
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="ask"]',
      '#prompt-textarea',
      '.ProseMirror'
    ];
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && (element.matches(':focus') || document.activeElement === element)) {
        return element;
      }
    }
    
    // Fallback to any focused input
    const activeElement = document.activeElement;
    if (activeElement && (
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'INPUT' ||
      activeElement.contentEditable === 'true'
    )) {
      return activeElement;
    }
    
    return null;
  }

  showBlockedMessage(inputElement, originalValue) {
    const blockedMessage = document.createElement('div');
    blockedMessage.className = 'pg-blocked-message';
    blockedMessage.innerHTML = `
      <div style="color: #dc2626; font-weight: bold; margin-bottom: 8px;">
        🛡️ Threat Blocked by PromptGuardian
      </div>
      <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
        Your input contained potential security risks and has been cleared.
      </div>
      <button class="pg-restore-btn" style="font-size: 12px; padding: 4px 8px; border: 1px solid #d1d5db; background: white; cursor: pointer;">
        Restore Original Text
      </button>
    `;
    
    // Position relative to input
    Object.assign(blockedMessage.style, {
      position: 'absolute',
      backgroundColor: '#fef2f2',
      border: '1px solid #fca5a5',
      borderRadius: '6px',
      padding: '12px',
      marginTop: '8px',
      zIndex: '1000',
      fontSize: '14px',
      maxWidth: '300px'
    });
    
    // Add restore functionality
    blockedMessage.querySelector('.pg-restore-btn').onclick = () => {
      if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
        inputElement.value = originalValue;
      } else if (inputElement.contentEditable === 'true') {
        inputElement.textContent = originalValue;
      }
      blockedMessage.remove();
    };
    
    // Position and show
    inputElement.parentElement.appendChild(blockedMessage);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (blockedMessage.parentElement) {
        blockedMessage.remove();
      }
    }, 10000);
  }

  reviewThreat(payload) {
    // Open detailed threat analysis
    const modal = this.createThreatDetailsModal(payload);
    document.body.appendChild(modal);
  }

  createThreatDetailsModal(payload) {
    const { threatScore, threatType, data, source } = payload;
    
    const modal = document.createElement('div');
    modal.className = 'pg-threat-modal';
    
    modal.innerHTML = `
      <div class="pg-modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="pg-modal-content">
        <div class="pg-modal-header">
          <h3>🛡️ Threat Analysis Details</h3>
          <button class="pg-modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="pg-modal-body">
          <div class="pg-detail-section">
            <strong>Threat Type:</strong> ${this.getThreatTypeDescription(threatType)}
          </div>
          <div class="pg-detail-section">
            <strong>Risk Score:</strong> ${Math.round(threatScore * 100)}% 
            <span class="pg-risk-bar">
              <span class="pg-risk-fill" style="width: ${threatScore * 100}%"></span>
            </span>
          </div>
          <div class="pg-detail-section">
            <strong>Source:</strong> ${source}
          </div>
          <div class="pg-detail-section">
            <strong>Content Preview:</strong>
            <div class="pg-content-preview">${this.sanitizeForDisplay(data)}</div>
          </div>
          <div class="pg-detail-section">
            <strong>Why This is Risky:</strong>
            <div class="pg-risk-explanation">${this.getRiskExplanation(threatType)}</div>
          </div>
        </div>
        <div class="pg-modal-footer">
          <button class="pg-btn pg-btn-secondary" onclick="this.parentElement.parentElement.parentElement.remove()">
            Close
          </button>
          <button class="pg-btn pg-btn-primary" onclick="window.open('https://owasp.org/www-project-top-10-for-large-language-model-applications/', '_blank')">
            Learn More
          </button>
        </div>
      </div>
    `;
    
    // Add styles
    this.addModalStyles(modal);
    
    return modal;
  }

  getThreatTypeDescription(threatType) {
    const descriptions = {
      'prompt_injection': 'Prompt Injection Attack',
      'jailbreak': 'AI Jailbreak Attempt',
      'data_extraction': 'Data Extraction Attempt',
      'social_engineering': 'Social Engineering',
      'unknown': 'Unknown Security Threat'
    };
    
    return descriptions[threatType] || descriptions['unknown'];
  }

  getRiskExplanation(threatType) {
    const explanations = {
      'prompt_injection': 'This input attempts to override the AI\'s instructions, potentially causing it to ignore safety guidelines or reveal sensitive information.',
      'jailbreak': 'This prompt tries to bypass the AI\'s built-in safety measures, possibly leading to inappropriate or harmful responses.',
      'data_extraction': 'This input appears designed to extract information about the AI\'s training data, system prompts, or other sensitive details.',
      'social_engineering': 'This prompt uses psychological manipulation techniques to trick the AI into performing unauthorized actions.',
      'unknown': 'This input contains patterns commonly associated with security threats against AI systems.'
    };
    
    return explanations[threatType] || explanations['unknown'];
  }

  sanitizeForDisplay(data) {
    if (typeof data !== 'string') {
      return '[Complex data structure]';
    }
    
    // Sanitize HTML and limit length
    const sanitized = data
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .slice(0, 200);
    
    return sanitized + (data.length > 200 ? '...' : '');
  }

  suggestAlternatives(payload) {
    // This would integrate with the Predictive Agent to suggest safer alternatives
    const alternatives = this.generateAlternatives(payload);
    this.showAlternativesModal(alternatives);
  }

  generateAlternatives(payload) {
    // Simplified alternative generation - in production would use Predictive Agent
    const { data, threatType } = payload;
    
    const alternatives = [];
    
    if (threatType === 'prompt_injection') {
      alternatives.push({
        text: 'Ask your question directly without instructions to ignore previous prompts',
        reason: 'More direct and less likely to be flagged'
      });
    } else if (threatType === 'jailbreak') {
      alternatives.push({
        text: 'Rephrase your request within the AI\'s intended use guidelines',
        reason: 'Complies with safety guidelines'
      });
    }
    
    // Generic alternative
    alternatives.push({
      text: 'Try rephrasing your question more specifically',
      reason: 'Clearer intent reduces security flags'
    });
    
    return alternatives;
  }

  showAlternativesModal(alternatives) {
    const modal = document.createElement('div');
    modal.className = 'pg-alternatives-modal';
    
    modal.innerHTML = `
      <div class="pg-modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="pg-modal-content">
        <div class="pg-modal-header">
          <h3>💡 Suggested Alternatives</h3>
          <button class="pg-modal-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="pg-modal-body">
          ${alternatives.map((alt, index) => `
            <div class="pg-alternative-item">
              <div class="pg-alternative-text">${alt.text}</div>
              <div class="pg-alternative-reason">${alt.reason}</div>
              <button class="pg-use-alternative" onclick="this.useAlternative('${alt.text}')">
                Use This
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    this.addModalStyles(modal);
    document.body.appendChild(modal);
  }

  useAlternative(alternativeText) {
    const inputElement = this.findActiveInputElement();
    if (inputElement) {
      if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
        inputElement.value = alternativeText;
      } else if (inputElement.contentEditable === 'true') {
        inputElement.textContent = alternativeText;
      }
      
      // Trigger input event
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.focus();
    }
    
    // Close modal
    document.querySelector('.pg-alternatives-modal')?.remove();
  }

  addModalStyles(modal) {
    const style = document.createElement('style');
    style.textContent = `
      .pg-threat-modal, .pg-alternatives-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 10001;
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .pg-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
      }
      
      .pg-modal-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      }
      
      .pg-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid #e5e7eb;
      }
      
      .pg-modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #6b7280;
      }
      
      .pg-modal-body {
        padding: 20px;
      }
      
      .pg-detail-section {
        margin-bottom: 16px;
      }
      
      .pg-content-preview {
        background: #f9fafb;
        padding: 12px;
        border-radius: 6px;
        font-family: monospace;
        margin-top: 8px;
      }
      
      .pg-risk-bar {
        display: inline-block;
        width: 100px;
        height: 8px;
        background: #e5e7eb;
        border-radius: 4px;
        margin-left: 8px;
        overflow: hidden;
      }
      
      .pg-risk-fill {
        height: 100%;
        background: linear-gradient(to right, #10b981, #f59e0b, #ef4444);
        transition: width 0.3s ease;
      }
      
      .pg-modal-footer {
        padding: 20px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }
      
      .pg-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid transparent;
        cursor: pointer;
        font-size: 14px;
      }
      
      .pg-btn-primary {
        background: #3b82f6;
        color: white;
      }
      
      .pg-btn-secondary {
        background: white;
        color: #374151;
        border-color: #d1d5db;
      }
      
      .pg-alternative-item {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
      }
      
      .pg-alternative-text {
        font-weight: 500;
        margin-bottom: 8px;
      }
      
      .pg-alternative-reason {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 12px;
      }
      
      .pg-use-alternative {
        background: #10b981;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
    `;
    
    document.head.appendChild(style);
  }

  isWhitelisted(data) {
    if (typeof data !== 'string') return false;
    
    return this.userSettings.whitelistedPrompts.some(pattern => {
      try {
        return new RegExp(pattern, 'i').test(data);
      } catch {
        return data.toLowerCase().includes(pattern.toLowerCase());
      }
    });
  }

  playThreatSound(threatScore) {
    // Simple beep using Web Audio API
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Higher pitch for higher threat
      oscillator.frequency.value = 400 + (threatScore * 400);
      oscillator.type = 'sine';
      
      gainNode.gain.value = 0.1;
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.warn('[PromptGuardian] Could not play sound:', error);
    }
  }

  sendThreatNotification(payload) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('PromptGuardian: Security Threat Detected', {
        body: this.formatThreatMessage(payload),
        icon: chrome.runtime.getURL('assets/icons/icon-48.png'),
        tag: 'promptguardian-threat'
      });
    }
  }

  recordThreatAnalytics(payload) {
    // Record anonymized threat data for analysis
    const analytics = {
      timestamp: Date.now(),
      site: this.currentSite,
      threatType: payload.threatType,
      threatScore: Math.round(payload.threatScore * 10) / 10, // Round to 1 decimal
      source: payload.source,
      // Don't record actual content for privacy
    };
    
    // Store locally for now - could be sent to analytics service
    chrome.storage.local.get(['threatAnalytics'], (result) => {
      const existing = result.threatAnalytics || [];
      existing.push(analytics);
      
      // Keep only last 1000 entries
      if (existing.length > 1000) {
        existing.splice(0, existing.length - 1000);
      }
      
      chrome.storage.local.set({ threatAnalytics: existing });
    });
  }

  updateThreatWarning(payload) {
    // Find and update existing warnings with new analysis
    const warnings = this.threatOverlay?.querySelectorAll('.pg-threat-warning');
    if (warnings && warnings.length > 0) {
      const latestWarning = warnings[warnings.length - 1];
      const messageElement = latestWarning.querySelector('.pg-warning-message');
      
      if (messageElement) {
        messageElement.innerHTML += `<br><small>📊 Analysis: ${payload.threatType} (${Math.round(payload.threatScore * 100)}% confidence)</small>`;
      }
    }
  }

  updateThreatVerification(verificationData) {
    const { verified, confidence, evidence } = verificationData;
    
    const warnings = this.threatOverlay?.querySelectorAll('.pg-threat-warning');
    if (warnings && warnings.length > 0) {
      const latestWarning = warnings[warnings.length - 1];
      const messageElement = latestWarning.querySelector('.pg-warning-message');
      
      if (messageElement && verified) {
        messageElement.innerHTML += `<br><small>✅ Verified threat (${Math.round(confidence * 100)}% confidence)</small>`;
      }
    }
  }

  showThreatDetails(payload) {
    const modal = this.createThreatDetailsModal(payload);
    document.body.appendChild(modal);
  }

  showThreatInfo(payload) {
    // Show brief info tooltip
    const info = document.createElement('div');
    info.className = 'pg-threat-info';
    info.innerHTML = `
      <div>🛡️ <strong>Security Info</strong></div>
      <div>This pattern is associated with ${payload.threatType} attacks.</div>
      <div><small>Risk Level: ${Math.round(payload.threatScore * 100)}%</small></div>
    `;
    
    Object.assign(info.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'white',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      zIndex: '10001',
      fontSize: '14px'
    });
    
    document.body.appendChild(info);
    
    setTimeout(() => info.remove(), 3000);
  }

  showRecommendations(recommendations) {
    if (recommendations.length === 0) return;
    
    const recommendationsElement = document.createElement('div');
    recommendationsElement.className = 'pg-recommendations';
    recommendationsElement.innerHTML = `
      <div class="pg-rec-header">💡 Security Recommendations:</div>
      <ul class="pg-rec-list">
        ${recommendations.slice(0, 3).map(rec => `<li>${this.formatRecommendation(rec)}</li>`).join('')}
      </ul>
    `;
    
    Object.assign(recommendationsElement.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      maxWidth: '300px',
      background: '#f0f9ff',
      border: '1px solid #0ea5e9',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '12px',
      zIndex: '9998'
    });
    
    document.body.appendChild(recommendationsElement);
    
    setTimeout(() => recommendationsElement.remove(), 8000);
  }

  formatRecommendation(recommendation) {
    const recommendations = {
      'AVOID_SUBMITTING_PROMPT': 'Consider not submitting this prompt',
      'CONSIDER_REPHRASING': 'Try rephrasing your request',
      'VERIFY_FROM_ADDITIONAL_SOURCES': 'Verify information from other sources',
      'HIGH_CONFIDENCE_THREAT_DETECTED': 'High confidence threat detected',
      'EXERCISE_CAUTION': 'Exercise caution when proceeding'
    };
    
    return recommendations[recommendation] || recommendation.toLowerCase().replace(/_/g, ' ');
  }

  dismissWarning(warningId) {
    const warning = document.getElementById(`pg-warning-${warningId}`);
    if (warning) {
      warning.style.transform = 'translateX(100%)';
      warning.style.opacity = '0';
      setTimeout(() => {
        warning.remove();
        this.activeWarnings.delete(warningId);
      }, 300);
    }
  }

  clearAllWarnings() {
    const warnings = this.threatOverlay?.querySelectorAll('.pg-threat-warning');
    warnings?.forEach(warning => warning.remove());
    this.activeWarnings.clear();
  }

  togglePromptGuardian() {
    const isEnabled = !this.userSettings.enableRealTimeMonitoring;
    this.userSettings.enableRealTimeMonitoring = isEnabled;
    
    chrome.storage.sync.set({ enableRealTimeMonitoring: isEnabled });
    
    if (isEnabled) {
      this.startMonitoring();
      this.showMessage('PromptGuardian enabled', 'success');
    } else {
      this.agents.get('detection')?.stopMonitoring();
      this.clearAllWarnings();
      this.showMessage('PromptGuardian disabled', 'info');
    }
  }

  showMessage(text, type = 'info') {
    const message = document.createElement('div');
    message.textContent = text;
    
    const colors = {
      success: '#10b981',
      info: '#3b82f6',
      warning: '#f59e0b',
      error: '#ef4444'
    };
    
    Object.assign(message.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: colors[type],
      color: 'white',
      padding: '8px 16px',
      borderRadius: '6px',
      fontSize: '14px',
      zIndex: '10000'
    });
    
    document.body.appendChild(message);
    setTimeout(() => message.remove(), 3000);
  }

  showError(errorMessage) {
    console.error('[PromptGuardian]', errorMessage);
    this.showMessage(`Error: ${errorMessage}`, 'error');
  }

  // Cleanup
  destroy() {
    this.agents.forEach(agent => agent.destroy());
    this.threatOverlay?.remove();
    this.clearAllWarnings();
    console.log('[PromptGuardian] Cleaned up');
  }
}

// Initialize PromptGuardian when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.promptGuardian = new PromptGuardianContent();
  });
} else {
  window.promptGuardian = new PromptGuardianContent();
}

// Handle page navigation in SPAs
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    // Reinitialize if needed
    if (window.promptGuardian) {
      window.promptGuardian.destroy();
      setTimeout(() => {
        window.promptGuardian = new PromptGuardianContent();
      }, 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });