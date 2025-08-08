/**
 * Base Agent Class
 * Foundation for all PromptGuardian AI agents
 */

import { SPMProtocol } from '../utils/spm-protocol.js';

class BaseAgent {
  constructor(agentType, config = {}) {
    this.agentType = agentType;
    this.config = {
      throttleMs: 300,
      maxRetries: 3,
      timeout: 10000,
      ...config
    };
    
    this.spm = new SPMProtocol();
    this.isActive = false;
    this.lastProcessTime = 0;
    this.eventListeners = new Map();
    
    this.init();
  }

  async init() {
    await this.setupMessageHandling();
    this.isActive = true;
    console.log(`[${this.agentType}] Agent initialized`);
  }

  async setupMessageHandling() {
    // Listen for SPM messages from other agents
    const port = this.smp?.registerPeer?.(this.spm.nodeId);
    if (port) {
      port.onmessage = (event) => {
        this.handleSPMMessage(event.data);
      };
    }
  }

  async handleSPMMessage(message) {
    if (!await this.smp.verifyMessageIntegrity(message)) {
      console.warn(`[${this.agentType}] Invalid message integrity`);
      return;
    }

    // Route message to appropriate handler
    const handler = this.eventListeners.get(message.type);
    if (handler) {
      await handler(message.payload, message);
    }
  }

  on(eventType, handler) {
    this.eventListeners.set(eventType, handler);
  }

  async broadcast(eventType, payload) {
    return await this.spm.broadcast(eventType, payload);
  }

  async sendTo(targetAgent, eventType, payload) {
    return await this.spm.sendDirect(targetAgent, eventType, payload);
  }

  throttle(func, delay = this.config.throttleMs) {
    return (...args) => {
      const now = Date.now();
      if (now - this.lastProcessTime >= delay) {
        this.lastProcessTime = now;
        return func.apply(this, args);
      }
    };
  }

  async withRetry(operation, maxRetries = this.config.maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await this.sleep(1000 * attempt); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getStorageData(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key]);
      });
    });
  }

  async setStorageData(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  async makeAPICall(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`API call failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  // Abstract methods to be implemented by specific agents
  async process(input) {
    throw new Error(`${this.agentType} agent must implement process method`);
  }

  async analyze(data) {
    throw new Error(`${this.agentType} agent must implement analyze method`);
  }

  destroy() {
    this.isActive = false;
    this.eventListeners.clear();
    console.log(`[${this.agentType}] Agent destroyed`);
  }
}

export { BaseAgent };