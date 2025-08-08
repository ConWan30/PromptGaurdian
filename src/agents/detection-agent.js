/**
 * Detection Agent
 * Captures and preprocesses data from DOM interactions for threat detection
 */

import { BaseAgent } from './base-agent.js';

class DetectionAgent extends BaseAgent {
  constructor(config = {}) {
    super('Detection', config);
    
    this.isMonitoring = false;
    this.currentContext = null;
    this.inputBuffers = new Map(); // Store input sequences
    this.socialPostCache = new Map(); // Cache X posts for analysis
    this.domObserver = null;
    this.inputThrottler = new Map(); // Throttle rapid inputs
    
    this.setupEventHandlers();
    this.initializeDetection();
  }

  setupEventHandlers() {
    this.on('start_monitoring', this.startMonitoring.bind(this));
    this.on('stop_monitoring', this.stopMonitoring.bind(this));
    this.on('context_change', this.handleContextChange.bind(this));
    this.on('scan_social_timeline', this.scanSocialTimeline.bind(this));
  }

  async initializeDetection() {
    // Determine current context based on URL
    const url = window.location.href;
    this.currentContext = this.determineContext(url);
    
    await this.broadcast('agent_ready', { 
      agentType: this.agentType,
      context: this.currentContext 
    });
    
    // Start monitoring based on context
    if (this.shouldAutoStart()) {
      await this.startMonitoring();
    }
  }

  determineContext(url) {
    const contexts = {
      'chat.openai.com': 'openai_chat',
      'claude.ai': 'claude_chat', 
      'bard.google.com': 'bard_chat',
      'x.com': 'x_social',
      'twitter.com': 'x_social'
    };
    
    for (const [domain, context] of Object.entries(contexts)) {
      if (url.includes(domain)) {
        return context;
      }
    }
    
    return 'unknown';
  }

  shouldAutoStart() {
    return this.currentContext !== 'unknown';
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    if (this.currentContext.includes('chat')) {
      await this.setupPromptMonitoring();
    } else if (this.currentContext === 'x_social') {
      await this.setupSocialShieldMonitoring();
    }
    
    await this.broadcast('monitoring_started', {
      context: this.currentContext,
      timestamp: Date.now()
    });
  }

  async setupPromptMonitoring() {
    // Find AI chat input elements using sophisticated selectors
    const inputSelectors = [
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="ask"]',
      'textarea[placeholder*="chat"]',
      'div[contenteditable="true"]',
      '#prompt-textarea',
      '[data-testid="textbox"]',
      '.ProseMirror'
    ];
    
    const inputElements = this.findElements(inputSelectors);
    
    inputElements.forEach(element => {
      this.attachInputListeners(element);
    });
    
    // Set up mutation observer for dynamically added elements
    this.setupMutationObserver(inputSelectors);
  }

  async setupSocialShieldMonitoring() {
    // X/Twitter specific selectors for posts and timeline
    const postSelectors = [
      '[data-testid="tweet"]',
      '[data-testid="tweetText"]',
      'article[data-testid="tweet"]',
      '[role="article"]'
    ];
    
    // Monitor timeline for new posts
    this.setupTimelineObserver(postSelectors);
    
    // Scan existing posts on page
    await this.scanExistingPosts(postSelectors);
  }

  findElements(selectors) {
    const elements = [];
    
    for (const selector of selectors) {
      try {
        const found = document.querySelectorAll(selector);
        elements.push(...Array.from(found));
      } catch (error) {
        console.debug(`[Detection] Invalid selector: ${selector}`);
      }
    }
    
    return [...new Set(elements)]; // Remove duplicates
  }

  attachInputListeners(element) {
    const elementId = this.generateElementId(element);
    
    // Throttled input handler
    const throttledHandler = this.throttle((event) => {
      this.handleInputEvent(event, elementId);
    }, this.config.throttleMs);
    
    // Multiple event types for comprehensive coverage
    const events = ['input', 'keyup', 'paste', 'change'];
    
    events.forEach(eventType => {
      element.addEventListener(eventType, throttledHandler, { passive: true });
    });
    
    // Track element for cleanup
    if (!this.monitoredElements) {
      this.monitoredElements = new Set();
    }
    this.monitoredElements.add({ element, elementId, events });
  }

  async handleInputEvent(event, elementId) {
    const content = this.extractContent(event.target);
    
    if (!content || content.length < 5) return; // Skip very short inputs
    
    // Update input buffer for sequence analysis
    this.updateInputBuffer(elementId, content);
    
    // Initial pattern detection
    const initialThreat = await this.performInitialDetection(content, elementId);
    
    if (initialThreat.threatScore > 0.2) {
      await this.broadcast('threat_detected', {
        threatScore: initialThreat.threatScore,
        threatType: initialThreat.threatType,
        data: content,
        source: 'prompt_input',
        element: elementId,
        context: this.currentContext
      });
    }
  }

  extractContent(element) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      return element.value;
    } else if (element.contentEditable === 'true') {
      return element.textContent || element.innerText;
    }
    return '';
  }

  updateInputBuffer(elementId, content) {
    if (!this.inputBuffers.has(elementId)) {
      this.inputBuffers.set(elementId, []);
    }
    
    const buffer = this.inputBuffers.get(elementId);
    buffer.push({
      content,
      timestamp: Date.now()
    });
    
    // Keep only last 10 entries
    if (buffer.length > 10) {
      buffer.shift();
    }
  }

  async performInitialDetection(content, elementId) {
    // Fast pattern-based detection before sending to Analysis Agent
    const patterns = {
      prompt_injection: {
        patterns: [
          /ignore\s+(previous|all)\s+(instructions?|prompts?)/i,
          /forget\s+(everything|all|previous)/i,
          /new\s+(instructions?|system\s+prompt)/i,
          /act\s+as\s+if\s+you\s+(are|were)/i,
          /system\s*:\s*.+/i
        ],
        weight: 0.8
      },
      jailbreak: {
        patterns: [
          /dan\s+mode/i,
          /developer\s+mode/i,
          /roleplay\s+as/i,
          /pretend\s+(you\s+are|to\s+be)/i,
          /\[JAILBREAK\]/i
        ],
        weight: 0.9
      },
      data_extraction: {
        patterns: [
          /what\s+(is\s+)?your\s+system\s+prompt/i,
          /show\s+me\s+your\s+(instructions?|prompts?)/i,
          /repeat\s+your\s+(instructions?|system)/i,
          /what\s+are\s+you\s+trained\s+on/i
        ],
        weight: 0.7
      }
    };
    
    let maxThreatScore = 0;
    let primaryThreatType = 'none';
    
    for (const [threatType, config] of Object.entries(patterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(content)) {
          const score = config.weight * (1 + Math.random() * 0.2 - 0.1); // Add slight randomness
          if (score > maxThreatScore) {
            maxThreatScore = score;
            primaryThreatType = threatType;
          }
        }
      }
    }
    
    return {
      threatScore: maxThreatScore,
      threatType: primaryThreatType,
      patterns: patterns
    };
  }

  setupMutationObserver(selectors) {
    this.domObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const newInputs = this.findElements(selectors);
            newInputs.forEach(element => {
              if (!this.isElementMonitored(element)) {
                this.attachInputListeners(element);
              }
            });
          }
        });
      });
    });
    
    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  setupTimelineObserver(postSelectors) {
    this.timelineObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.scanNewPost(node, postSelectors);
          }
        });
      });
    });
    
    // Observe timeline containers
    const timelineContainers = document.querySelectorAll('[role="main"]', '[data-testid="primaryColumn"]');
    timelineContainers.forEach(container => {
      this.timelineObserver.observe(container, {
        childList: true,
        subtree: true
      });
    });
  }

  async scanExistingPosts(postSelectors) {
    const posts = this.findElements(postSelectors);
    
    for (const post of posts.slice(0, 20)) { // Limit initial scan
      await this.analyzePost(post);
      await this.sleep(50); // Small delay to avoid overwhelming
    }
  }

  async scanNewPost(node, postSelectors) {
    for (const selector of postSelectors) {
      if (node.matches && node.matches(selector)) {
        await this.analyzePost(node);
        break;
      }
      
      const nestedPosts = node.querySelectorAll(selector);
      for (const post of nestedPosts) {
        await this.analyzePost(post);
      }
    }
  }

  async analyzePost(postElement) {
    try {
      const postData = this.extractPostData(postElement);
      
      if (!postData || this.socialPostCache.has(postData.id)) {
        return; // Skip if already processed
      }
      
      this.socialPostCache.set(postData.id, postData);
      
      // Initial social threat detection
      const socialThreat = await this.detectSocialThreats(postData);
      
      if (socialThreat.threatScore > 0.3) {
        await this.broadcast('threat_detected', {
          threatScore: socialThreat.threatScore,
          threatType: socialThreat.threatType,
          data: postData,
          source: 'social_post',
          context: this.currentContext
        });
      }
    } catch (error) {
      console.error('[Detection] Error analyzing post:', error);
    }
  }

  extractPostData(postElement) {
    try {
      // Extract comprehensive post data
      const textElement = postElement.querySelector('[data-testid="tweetText"]') || 
                         postElement.querySelector('[lang]') ||
                         postElement;
      
      const text = textElement ? textElement.textContent : '';
      
      // Extract media
      const mediaElements = postElement.querySelectorAll('img, video');
      const media = Array.from(mediaElements).map(el => ({
        type: el.tagName.toLowerCase(),
        src: el.src,
        alt: el.alt || ''
      }));
      
      // Extract links
      const linkElements = postElement.querySelectorAll('a[href^="http"]');
      const links = Array.from(linkElements).map(el => el.href);
      
      // Generate unique ID
      const id = this.generatePostId(postElement, text);
      
      return {
        id,
        text,
        media,
        links,
        timestamp: Date.now(),
        element: postElement
      };
    } catch (error) {
      console.error('[Detection] Error extracting post data:', error);
      return null;
    }
  }

  async detectSocialThreats(postData) {
    const { text, media, links } = postData;
    
    // Social-specific threat patterns
    const socialPatterns = {
      spam: {
        patterns: [
          /click\s+here\s+now/i,
          /limited\s+time\s+offer/i,
          /act\s+fast/i,
          /free\s+(crypto|money|gift)/i,
          /urgent\s+action/i,
          /(win|earn)\s+\$\d+/i
        ],
        weight: 0.7
      },
      phishing: {
        patterns: [
          /verify\s+your\s+account/i,
          /suspended\s+account/i,
          /click\s+to\s+confirm/i,
          /update\s+payment/i,
          /security\s+alert/i
        ],
        weight: 0.8
      },
      steganography: {
        patterns: [
          /hidden\s+message/i,
          /decode\s+this/i,
          /secret\s+code/i,
          /base64/i,
          /encrypted/i
        ],
        weight: 0.6,
        checkMedia: true
      }
    };
    
    let maxThreatScore = 0;
    let primaryThreatType = 'none';
    
    for (const [threatType, config] of Object.entries(socialPatterns)) {
      let score = 0;
      
      // Text analysis
      for (const pattern of config.patterns) {
        if (pattern.test(text)) {
          score = Math.max(score, config.weight);
        }
      }
      
      // Media analysis for steganography
      if (config.checkMedia && media.length > 0) {
        score = Math.max(score, 0.4); // Base suspicion for media posts with steg keywords
      }
      
      // Suspicious links
      if (links.length > 2) {
        score += 0.2; // Multiple links increase suspicion
      }
      
      if (score > maxThreatScore) {
        maxThreatScore = score;
        primaryThreatType = threatType;
      }
    }
    
    return {
      threatScore: maxThreatScore,
      threatType: primaryThreatType
    };
  }

  generateElementId(element) {
    return `elem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  generatePostId(element, text) {
    const textHash = btoa(text.slice(0, 50)).slice(0, 16);
    return `post_${textHash}_${Date.now()}`;
  }

  isElementMonitored(element) {
    if (!this.monitoredElements) return false;
    
    for (const monitored of this.monitoredElements) {
      if (monitored.element === element) {
        return true;
      }
    }
    return false;
  }

  async handleContextChange(payload) {
    const { context, url } = payload;
    
    if (context !== this.currentContext) {
      await this.stopMonitoring();
      this.currentContext = context;
      
      if (this.shouldAutoStart()) {
        await this.startMonitoring();
      }
    }
  }

  async scanSocialTimeline(payload) {
    // Manual timeline scan trigger
    const postSelectors = [
      '[data-testid="tweet"]',
      '[data-testid="tweetText"]',
      'article[data-testid="tweet"]'
    ];
    
    await this.scanExistingPosts(postSelectors);
  }

  async stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    // Clean up event listeners
    if (this.monitoredElements) {
      this.monitoredElements.forEach(({ element, events }) => {
        events.forEach(eventType => {
          element.removeEventListener(eventType, this.throttledHandler);
        });
      });
      this.monitoredElements.clear();
    }
    
    // Clean up observers
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }
    
    if (this.timelineObserver) {
      this.timelineObserver.disconnect();
      this.timelineObserver = null;
    }
    
    await this.broadcast('monitoring_stopped', {
      context: this.currentContext,
      timestamp: Date.now()
    });
  }

  async process(input) {
    const { type, data, context } = input;
    
    switch (type) {
      case 'manual_scan':
        return await this.performManualScan(data);
      case 'analyze_input':
        return await this.performInitialDetection(data);
      case 'extract_post':
        return this.extractPostData(data);
      default:
        return { error: 'Unknown process type' };
    }
  }

  async analyze(data) {
    if (typeof data === 'string') {
      return await this.performInitialDetection(data, 'manual');
    } else if (data.postElement) {
      return await this.detectSocialThreats(this.extractPostData(data.postElement));
    }
    
    return { error: 'Invalid data type for analysis' };
  }

  async performManualScan(target) {
    if (target === 'timeline' && this.currentContext === 'x_social') {
      await this.scanSocialTimeline({});
      return { scanned: true, type: 'timeline' };
    } else if (target === 'inputs' && this.currentContext.includes('chat')) {
      // Re-scan for input elements
      await this.setupPromptMonitoring();
      return { scanned: true, type: 'inputs' };
    }
    
    return { error: 'Invalid scan target' };
  }

  getDetectionStats() {
    return {
      isMonitoring: this.isMonitoring,
      context: this.currentContext,
      inputBuffers: this.inputBuffers.size,
      socialPostCache: this.socialPostCache.size,
      monitoredElements: this.monitoredElements?.size || 0
    };
  }

  destroy() {
    this.stopMonitoring();
    super.destroy();
  }
}

export { DetectionAgent };