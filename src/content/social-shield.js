/**
 * SocialShield Content Script
 * Monitors X (Twitter) for social media threats: spam, steganography, misinformation
 */

import { OrchestratorAgent } from '../agents/orchestrator-agent.js';
import { DetectionAgent } from '../agents/detection-agent.js';
import { AnalysisAgent } from '../agents/analysis-agent.js';
import { VerificationAgent } from '../agents/verification-agent.js';
import { MultimediaAgent } from '../agents/multimedia-agent.js';
import { GogglesAgent } from '../agents/goggles-agent.js';

class SocialShieldContent {
  constructor() {
    this.agents = new Map();
    this.isInitialized = false;
    this.platform = this.detectPlatform();
    this.threatOverlay = null;
    this.activeAlerts = new Set();
    this.userSettings = {};
    this.scannedPosts = new WeakSet();
    this.observedElements = new Set();
    
    this.init();
  }

  async init() {
    try {
      console.log('[SocialShield] Initializing on', this.platform);
      
      // Load user settings
      await this.loadSettings();
      
      // Only proceed if SocialShield is enabled
      if (!this.userSettings.enableSocialShield) {
        console.log('[SocialShield] Disabled in settings');
        return;
      }
      
      // Initialize agents
      await this.initializeAgents();
      
      // Set up UI components
      this.createThreatOverlay();
      this.createSocialShieldIndicator();
      this.setupKeyboardShortcuts();
      
      // Start monitoring social feeds
      await this.startSocialMonitoring();
      
      this.isInitialized = true;
      console.log('[SocialShield] Successfully initialized');
      
    } catch (error) {
      console.error('[SocialShield] Initialization failed:', error);
      this.showError('SocialShield failed to initialize: ' + error.message);
    }
  }

  detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('x.com') || hostname.includes('twitter.com')) return 'x';
    if (hostname.includes('facebook.com')) return 'facebook';
    if (hostname.includes('instagram.com')) return 'instagram';
    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('tiktok.com')) return 'tiktok';
    
    return 'unknown';
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        // SocialShield specific settings
        enableSocialShield: true,
        enableSpamDetection: true,
        enableSteganographyDetection: true,
        enableMisinformationDetection: true,
        enablePhishingDetection: true,
        socialThreatThreshold: 0.4, // Lower threshold for social media
        enablePostOverlays: true,
        enableCommunityNotes: true,
        scanningMode: 'smart', // 'aggressive', 'smart', 'conservative'
        autoScanImages: true,
        autoScanVideos: false,
        enableSocialNotifications: true,
        maxPostsToScan: 50,
        railwayApiUrl: 'https://promptgaurdian-production.up.railway.app'
      }, (settings) => {
        this.userSettings = settings;
        resolve(settings);
      });
    });
  }

  async initializeAgents() {
    const agentConfig = {
      throttleMs: this.userSettings.scanningMode === 'aggressive' ? 200 : 500,
      maxRetries: 3,
      timeout: 8000
    };

    // Core agents for social monitoring
    this.agents.set('orchestrator', new OrchestratorAgent(agentConfig));
    this.agents.set('detection', new DetectionAgent(agentConfig));
    this.agents.set('analysis', new AnalysisAgent(agentConfig));
    this.agents.set('verification', new VerificationAgent(agentConfig));
    this.agents.set('multimedia', new MultimediaAgent(agentConfig));
    this.agents.set('goggles', new GogglesAgent(agentConfig));

    // Set up agent event handlers
    this.setupSocialAgentHandlers();
    
    // Wait for agents to be ready
    await this.waitForAgentsReady();
  }

  setupSocialAgentHandlers() {
    // Social threat detection
    this.agents.get('detection').on('threat_detected', (payload) => {
      if (payload.source === 'social_post') {
        this.handleSocialThreatDetected(payload);
      }
    });

    this.agents.get('analysis').on('analysis_complete', (payload) => {
      this.handleSocialAnalysisComplete(payload);
    });

    this.agents.get('verification').on('verification_complete', (payload) => {
      if (payload.type === 'social') {
        this.handleSocialVerificationComplete(payload);
      }
    });

    this.agents.get('multimedia').on('media_analysis_complete', (payload) => {
      if (payload.source === 'social_media') {
        this.handleMediaAnalysisComplete(payload);
      }
    });

    // Error handling
    for (const [name, agent] of this.agents) {
      agent.on('agent_error', (payload) => {
        console.warn(`[SocialShield] Agent ${name} error:`, payload);
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
    console.log('[SocialShield] All agents ready');
  }

  async startSocialMonitoring() {
    // Set up platform-specific monitoring
    if (this.platform === 'x') {
      await this.setupXMonitoring();
    } else if (this.platform === 'facebook') {
      await this.setupFacebookMonitoring();
    } else {
      console.log('[SocialShield] Platform not supported:', this.platform);
      return;
    }

    // Start the detection agent
    const detectionAgent = this.agents.get('detection');
    if (detectionAgent) {
      await detectionAgent.startMonitoring();
    }

    console.log('[SocialShield] Social monitoring started');
  }

  async setupXMonitoring() {
    // X (Twitter) specific selectors and monitoring
    const postSelectors = [
      'article[data-testid="tweet"]',
      '[data-testid="tweet"]',
      '[role="article"]'
    ];

    const timelineSelectors = [
      '[data-testid="primaryColumn"]',
      '[aria-label="Timeline: Your Home Timeline"]',
      '[aria-label="Timeline"]'
    ];

    // Initial scan of existing posts
    await this.scanExistingPosts(postSelectors);

    // Set up mutation observers for new posts
    this.setupTimelineObservers(timelineSelectors, postSelectors);

    // Monitor for image/video loads
    if (this.userSettings.autoScanImages || this.userSettings.autoScanVideos) {
      this.setupMediaObservers();
    }
  }

  async setupFacebookMonitoring() {
    // Facebook specific monitoring (basic implementation)
    const postSelectors = [
      '[data-pagelet="FeedUnit"]',
      '[role="article"]'
    ];

    await this.scanExistingPosts(postSelectors);
    this.setupTimelineObservers(['[role="main"]'], postSelectors);
  }

  async scanExistingPosts(postSelectors) {
    const posts = this.findPosts(postSelectors);
    const postsToScan = posts.slice(0, this.userSettings.maxPostsToScan);
    
    console.log(`[SocialShield] Scanning ${postsToScan.length} existing posts`);

    for (const [index, post] of postsToScan.entries()) {
      try {
        await this.analyzePost(post);
        this.scannedPosts.add(post);
        
        // Small delay to avoid overwhelming
        if (index % 5 === 0) {
          await this.sleep(100);
        }
      } catch (error) {
        console.warn('[SocialShield] Error scanning post:', error);
      }
    }
  }

  findPosts(selectors) {
    const posts = [];
    
    for (const selector of selectors) {
      try {
        const found = document.querySelectorAll(selector);
        posts.push(...Array.from(found));
      } catch (error) {
        console.debug(`[SocialShield] Invalid selector: ${selector}`);
      }
    }
    
    return [...new Set(posts)]; // Remove duplicates
  }

  setupTimelineObservers(timelineSelectors, postSelectors) {
    for (const timelineSelector of timelineSelectors) {
      const timeline = document.querySelector(timelineSelector);
      
      if (timeline && !this.observedElements.has(timeline)) {
        const observer = new MutationObserver((mutations) => {
          this.handleTimelineMutations(mutations, postSelectors);
        });
        
        observer.observe(timeline, {
          childList: true,
          subtree: true
        });
        
        this.observedElements.add(timeline);
        console.log(`[SocialShield] Observing timeline: ${timelineSelector}`);
      }
    }
  }

  async handleTimelineMutations(mutations, postSelectors) {
    const newPosts = [];
    
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if the node itself is a post
          for (const selector of postSelectors) {
            if (node.matches && node.matches(selector) && !this.scannedPosts.has(node)) {
              newPosts.push(node);
            }
          }
          
          // Check for posts within the node
          for (const selector of postSelectors) {
            const foundPosts = node.querySelectorAll?.(selector);
            if (foundPosts) {
              for (const post of foundPosts) {
                if (!this.scannedPosts.has(post)) {
                  newPosts.push(post);
                }
              }
            }
          }
        }
      }
    }
    
    // Analyze new posts
    for (const post of newPosts.slice(0, 10)) { // Limit to prevent overload
      try {
        await this.analyzePost(post);
        this.scannedPosts.add(post);
        await this.sleep(50); // Small delay between analyses
      } catch (error) {
        console.warn('[SocialShield] Error analyzing new post:', error);
      }
    }
  }

  setupMediaObservers() {
    // Observe for new media elements
    const mediaObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const images = node.querySelectorAll?.('img') || [];
            const videos = node.querySelectorAll?.('video') || [];
            
            if (this.userSettings.autoScanImages) {
              images.forEach(img => this.scheduleMediaAnalysis(img, 'image'));
            }
            
            if (this.userSettings.autoScanVideos) {
              videos.forEach(video => this.scheduleMediaAnalysis(video, 'video'));
            }
          }
        }
      }
    });
    
    mediaObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async analyzePost(postElement) {
    try {
      // Extract post data
      const postData = this.extractPostData(postElement);
      
      if (!postData || !postData.text?.trim()) {
        return; // Skip posts without text content
      }

      // Perform different types of analysis based on settings
      const analyses = await Promise.allSettled([
        this.userSettings.enableSpamDetection ? this.analyzeForSpam(postData) : null,
        this.userSettings.enablePhishingDetection ? this.analyzeForPhishing(postData) : null,
        this.userSettings.enableMisinformationDetection ? this.analyzeForMisinformation(postData) : null,
        this.userSettings.enableSteganographyDetection && postData.media.length > 0 ? 
          this.analyzeForSteganography(postData) : null
      ]);

      // Aggregate results
      const results = analyses.filter(result => result.status === 'fulfilled' && result.value)
                              .map(result => result.value);

      if (results.length > 0) {
        const aggregatedThreat = this.aggregateThreatResults(results);
        
        if (aggregatedThreat.threatScore > this.userSettings.socialThreatThreshold) {
          this.showPostThreatWarning(postElement, postData, aggregatedThreat);
        }
      }

    } catch (error) {
      console.error('[SocialShield] Post analysis error:', error);
    }
  }

  extractPostData(postElement) {
    try {
      // X (Twitter) specific extraction
      if (this.platform === 'x') {
        return this.extractXPostData(postElement);
      } else if (this.platform === 'facebook') {
        return this.extractFacebookPostData(postElement);
      }
      
      return null;
    } catch (error) {
      console.error('[SocialShield] Data extraction error:', error);
      return null;
    }
  }

  extractXPostData(postElement) {
    // Extract text content
    const textElement = postElement.querySelector('[data-testid="tweetText"]') ||
                       postElement.querySelector('[lang]') ||
                       postElement.querySelector('span');
    
    const text = textElement ? textElement.textContent.trim() : '';
    
    // Extract media
    const mediaElements = postElement.querySelectorAll('img, video');
    const media = Array.from(mediaElements).map(el => ({
      type: el.tagName.toLowerCase(),
      src: el.src,
      alt: el.alt || '',
      element: el
    }));
    
    // Extract links
    const linkElements = postElement.querySelectorAll('a[href^="http"]');
    const links = Array.from(linkElements).map(el => el.href);
    
    // Extract user info
    const userElement = postElement.querySelector('[data-testid="User-Name"]') ||
                       postElement.querySelector('[data-testid="User-Names"]');
    const username = userElement ? userElement.textContent : 'unknown';
    
    // Extract engagement metrics
    const retweetElement = postElement.querySelector('[data-testid="retweet"]');
    const likeElement = postElement.querySelector('[data-testid="like"]');
    const replyElement = postElement.querySelector('[data-testid="reply"]');
    
    const engagement = {
      retweets: this.extractNumberFromElement(retweetElement),
      likes: this.extractNumberFromElement(likeElement),
      replies: this.extractNumberFromElement(replyElement)
    };
    
    return {
      id: this.generatePostId(postElement, text),
      text,
      media,
      links,
      username,
      engagement,
      element: postElement,
      platform: 'x',
      timestamp: Date.now()
    };
  }

  extractFacebookPostData(postElement) {
    // Basic Facebook post extraction (simplified)
    const text = postElement.textContent || '';
    const media = Array.from(postElement.querySelectorAll('img, video')).map(el => ({
      type: el.tagName.toLowerCase(),
      src: el.src,
      alt: el.alt || ''
    }));
    const links = Array.from(postElement.querySelectorAll('a[href^="http"]')).map(el => el.href);
    
    return {
      id: this.generatePostId(postElement, text),
      text,
      media,
      links,
      username: 'facebook_user',
      engagement: {},
      element: postElement,
      platform: 'facebook',
      timestamp: Date.now()
    };
  }

  extractNumberFromElement(element) {
    if (!element) return 0;
    
    const text = element.textContent || element.getAttribute('aria-label') || '';
    const numberMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)/);
    
    if (numberMatch) {
      let num = numberMatch[1].replace(/,/g, '');
      if (num.endsWith('K')) {
        return parseFloat(num) * 1000;
      } else if (num.endsWith('M')) {
        return parseFloat(num) * 1000000;
      } else if (num.endsWith('B')) {
        return parseFloat(num) * 1000000000;
      }
      return parseInt(num);
    }
    
    return 0;
  }

  async analyzeForSpam(postData) {
    const { text, links, engagement } = postData;
    
    let spamScore = 0;
    const indicators = [];
    
    // Text-based spam patterns
    const spamPatterns = [
      { regex: /click\s+here\s+now/i, score: 0.7, indicator: 'urgency_spam' },
      { regex: /limited\s+time\s+offer/i, score: 0.6, indicator: 'limited_offer' },
      { regex: /free\s+(money|crypto|gift|prize)/i, score: 0.8, indicator: 'free_offer_spam' },
      { regex: /earn\s+\$\d+/i, score: 0.7, indicator: 'money_promise' },
      { regex: /guaranteed\s+income/i, score: 0.8, indicator: 'income_guarantee' },
      { regex: /act\s+fast/i, score: 0.5, indicator: 'urgency_language' },
      { regex: /don't\s+miss\s+out/i, score: 0.4, indicator: 'fomo_language' }
    ];
    
    for (const { regex, score, indicator } of spamPatterns) {
      if (regex.test(text)) {
        spamScore += score;
        indicators.push(indicator);
      }
    }
    
    // Link analysis
    if (links.length > 3) {
      spamScore += 0.3;
      indicators.push('multiple_links');
    }
    
    // Shortened URL detection
    const shortUrlPattern = /(bit\.ly|tinyurl|t\.co|goo\.gl|short\.link)/i;
    if (links.some(link => shortUrlPattern.test(link))) {
      spamScore += 0.4;
      indicators.push('shortened_urls');
    }
    
    // Engagement anomalies (very high engagement on spam-like content)
    if (engagement.likes > 10000 && spamScore > 0.3) {
      spamScore += 0.2;
      indicators.push('suspicious_engagement');
    }
    
    // Repetitive content detection
    if (this.isRepetitiveContent(text)) {
      spamScore += 0.5;
      indicators.push('repetitive_content');
    }
    
    return {
      type: 'spam',
      threatScore: Math.min(spamScore, 1),
      indicators,
      confidence: indicators.length > 2 ? 0.8 : 0.6
    };
  }

  async analyzeForPhishing(postData) {
    const { text, links, username } = postData;
    
    let phishingScore = 0;
    const indicators = [];
    
    // Phishing patterns
    const phishingPatterns = [
      { regex: /verify\s+your\s+account/i, score: 0.8, indicator: 'account_verification' },
      { regex: /suspended\s+account/i, score: 0.9, indicator: 'account_suspension' },
      { regex: /click\s+to\s+confirm/i, score: 0.7, indicator: 'confirmation_request' },
      { regex: /update\s+payment/i, score: 0.8, indicator: 'payment_update' },
      { regex: /security\s+alert/i, score: 0.6, indicator: 'security_alert' },
      { regex: /login\s+required/i, score: 0.7, indicator: 'login_request' }
    ];
    
    for (const { regex, score, indicator } of phishingPatterns) {
      if (regex.test(text)) {
        phishingScore += score;
        indicators.push(indicator);
      }
    }
    
    // Suspicious domain analysis
    for (const link of links) {
      const domain = this.extractDomain(link);
      if (this.isSuspiciousDomain(domain)) {
        phishingScore += 0.6;
        indicators.push('suspicious_domain');
      }
    }
    
    // Username impersonation check
    if (this.isImpersonationAccount(username)) {
      phishingScore += 0.4;
      indicators.push('impersonation_account');
    }
    
    return {
      type: 'phishing',
      threatScore: Math.min(phishingScore, 1),
      indicators,
      confidence: indicators.length > 1 ? 0.8 : 0.5
    };
  }

  async analyzeForMisinformation(postData) {
    const { text } = postData;
    
    let misinfoScore = 0;
    const indicators = [];
    
    // Misinformation indicators
    const misinfoPatterns = [
      { regex: /doctors\s+don't\s+want\s+you\s+to\s+know/i, score: 0.6, indicator: 'conspiracy_language' },
      { regex: /mainstream\s+media\s+(lies|hiding)/i, score: 0.5, indicator: 'media_distrust' },
      { regex: /the\s+truth\s+they\s+don't\s+tell\s+you/i, score: 0.6, indicator: 'hidden_truth_claim' },
      { regex: /wake\s+up\s+sheeple/i, score: 0.7, indicator: 'awakening_language' },
      { regex: /do\s+your\s+own\s+research/i, score: 0.3, indicator: 'research_deflection' }
    ];
    
    for (const { regex, score, indicator } of misinfoPatterns) {
      if (regex.test(text)) {
        misinfoScore += score;
        indicators.push(indicator);
      }
    }
    
    // Emotional manipulation indicators
    if (this.hasEmotionalManipulation(text)) {
      misinfoScore += 0.4;
      indicators.push('emotional_manipulation');
    }
    
    // Lack of credible sources
    if (text.length > 200 && !this.hasCredibleSources(text)) {
      misinfoScore += 0.2;
      indicators.push('no_credible_sources');
    }
    
    return {
      type: 'misinformation',
      threatScore: Math.min(misinfoScore, 1),
      indicators,
      confidence: indicators.length > 1 ? 0.7 : 0.4
    };
  }

  async analyzeForSteganography(postData) {
    const { media, text } = postData;
    
    if (media.length === 0) {
      return { type: 'steganography', threatScore: 0, indicators: [] };
    }
    
    let stegoScore = 0;
    const indicators = [];
    
    // Text-based steganography indicators
    const stegoPatterns = [
      { regex: /hidden\s+message/i, score: 0.8, indicator: 'hidden_message_reference' },
      { regex: /decode\s+this/i, score: 0.9, indicator: 'decode_instruction' },
      { regex: /secret\s+code/i, score: 0.7, indicator: 'secret_code_reference' },
      { regex: /base64/i, score: 0.6, indicator: 'base64_reference' },
      { regex: /steganography/i, score: 0.9, indicator: 'steganography_mention' }
    ];
    
    for (const { regex, score, indicator } of stegoPatterns) {
      if (regex.test(text)) {
        stegoScore += score;
        indicators.push(indicator);
      }
    }
    
    // Media analysis
    for (const mediaItem of media) {
      const mediaAnalysis = await this.analyzeMediaForSteganography(mediaItem);
      stegoScore += mediaAnalysis.score;
      indicators.push(...mediaAnalysis.indicators);
    }
    
    return {
      type: 'steganography',
      threatScore: Math.min(stegoScore, 1),
      indicators,
      confidence: indicators.length > 0 ? 0.6 : 0.2
    };
  }

  async analyzeMediaForSteganography(mediaItem) {
    let score = 0;
    const indicators = [];
    
    // File format analysis
    if (mediaItem.type === 'image') {
      const format = this.getImageFormat(mediaItem.src);
      if (['png', 'bmp'].includes(format)) {
        score += 0.2; // PNG/BMP are better for steganography
        indicators.push('steganography_friendly_format');
      }
    }
    
    // URL analysis
    if (this.isMediaUrlSuspicious(mediaItem.src)) {
      score += 0.3;
      indicators.push('suspicious_media_url');
    }
    
    // Size analysis (if available)
    if (mediaItem.element) {
      const { naturalWidth, naturalHeight, fileSize } = mediaItem.element;
      if (naturalWidth && naturalHeight && naturalWidth * naturalHeight > 1000000) {
        score += 0.1; // Large images can hide more data
        indicators.push('large_image_size');
      }
    }
    
    return { score, indicators };
  }

  scheduleMediaAnalysis(mediaElement, mediaType) {
    // Schedule media analysis with the multimedia agent
    const multimediaAgent = this.agents.get('multimedia');
    if (multimediaAgent && mediaElement.src) {
      multimediaAgent.scanSocialMedia({
        mediaUrls: [mediaElement.src],
        postContext: { type: mediaType, element: mediaElement }
      });
    }
  }

  aggregateThreatResults(results) {
    const threatTypes = {};
    let totalScore = 0;
    const allIndicators = [];
    
    for (const result of results) {
      threatTypes[result.type] = result.threatScore;
      totalScore += result.threatScore;
      allIndicators.push(...result.indicators);
    }
    
    // Find primary threat type
    const primaryThreat = Object.entries(threatTypes)
                               .sort(([,a], [,b]) => b - a)[0];
    
    return {
      threatScore: Math.min(totalScore / results.length, 1),
      primaryThreat: primaryThreat ? primaryThreat[0] : 'unknown',
      threatTypes,
      indicators: [...new Set(allIndicators)],
      confidence: results.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / results.length
    };
  }

  showPostThreatWarning(postElement, postData, threatData) {
    if (!this.userSettings.enablePostOverlays) {
      return;
    }
    
    // Create warning overlay for the specific post
    const warningOverlay = this.createPostWarningOverlay(threatData);
    
    // Position relative to post
    this.positionWarningOverlay(postElement, warningOverlay);
    
    // Add to post element
    postElement.style.position = 'relative';
    postElement.appendChild(warningOverlay);
    
    // Show notification if enabled
    if (this.userSettings.enableSocialNotifications) {
      this.showSocialNotification(threatData);
    }
    
    // Log the threat
    this.logSocialThreat(postData, threatData);
  }

  createPostWarningOverlay(threatData) {
    const overlay = document.createElement('div');
    overlay.className = 'ss-post-warning';
    
    const { threatScore, primaryThreat, indicators } = threatData;
    const warningLevel = this.getThreatWarningLevel(threatScore);
    
    const warningIcons = {
      spam: '🚨',
      phishing: '🎣',
      misinformation: '❗',
      steganography: '🔍'
    };
    
    const warningMessages = {
      spam: 'Potential spam detected',
      phishing: 'Possible phishing attempt',
      misinformation: 'Potential misinformation',
      steganography: 'Possible hidden content'
    };
    
    overlay.innerHTML = `
      <div class="ss-warning-badge ss-${warningLevel}">
        <span class="ss-warning-icon">${warningIcons[primaryThreat] || '⚠️'}</span>
        <span class="ss-warning-text">${warningMessages[primaryThreat] || 'Security concern detected'}</span>
        <button class="ss-warning-details" title="Click for details">ℹ️</button>
        <button class="ss-warning-dismiss" title="Dismiss">×</button>
      </div>
      <div class="ss-warning-details-panel" style="display: none;">
        <div class="ss-details-header">Threat Analysis</div>
        <div class="ss-details-content">
          <div><strong>Type:</strong> ${primaryThreat}</div>
          <div><strong>Risk Level:</strong> ${Math.round(threatScore * 100)}%</div>
          <div><strong>Indicators:</strong> ${indicators.slice(0, 3).join(', ')}</div>
        </div>
        <div class="ss-details-actions">
          <button class="ss-action-btn ss-report-btn">Report Post</button>
          <button class="ss-action-btn ss-hide-btn">Hide Post</button>
          <button class="ss-action-btn ss-whitelist-btn">Mark Safe</button>
        </div>
      </div>
    `;
    
    // Add event handlers
    this.addWarningEventHandlers(overlay, threatData);
    
    // Apply styles
    this.applyWarningStyles(overlay, warningLevel);
    
    return overlay;
  }

  addWarningEventHandlers(overlay, threatData) {
    const detailsBtn = overlay.querySelector('.ss-warning-details');
    const dismissBtn = overlay.querySelector('.ss-warning-dismiss');
    const detailsPanel = overlay.querySelector('.ss-warning-details-panel');
    
    detailsBtn.onclick = (e) => {
      e.stopPropagation();
      const isVisible = detailsPanel.style.display !== 'none';
      detailsPanel.style.display = isVisible ? 'none' : 'block';
    };
    
    dismissBtn.onclick = (e) => {
      e.stopPropagation();
      overlay.style.opacity = '0';
      overlay.style.transform = 'translateY(-10px)';
      setTimeout(() => overlay.remove(), 300);
    };
    
    // Action button handlers
    overlay.querySelector('.ss-report-btn').onclick = (e) => {
      e.stopPropagation();
      this.suggestReportPost(threatData);
    };
    
    overlay.querySelector('.ss-hide-btn').onclick = (e) => {
      e.stopPropagation();
      this.hidePost(overlay.closest('article, [data-testid="tweet"]'));
    };
    
    overlay.querySelector('.ss-whitelist-btn').onclick = (e) => {
      e.stopPropagation();
      this.whitelistPost(threatData);
      overlay.remove();
    };
  }

  applyWarningStyles(overlay, warningLevel) {
    const colors = {
      high: { bg: '#fef2f2', border: '#dc2626', text: '#991b1b' },
      medium: { bg: '#fffbeb', border: '#d97706', text: '#92400e' },
      low: { bg: '#f0f9ff', border: '#0284c7', text: '#075985' }
    };
    
    const color = colors[warningLevel] || colors.medium;
    
    Object.assign(overlay.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: '1000',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px'
    });
    
    const badge = overlay.querySelector('.ss-warning-badge');
    Object.assign(badge.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      backgroundColor: color.bg,
      border: `1px solid ${color.border}`,
      borderRadius: '4px',
      color: color.text,
      cursor: 'pointer'
    });
    
    const detailsPanel = overlay.querySelector('.ss-warning-details-panel');
    Object.assign(detailsPanel.style, {
      position: 'absolute',
      top: '100%',
      right: '0',
      width: '280px',
      backgroundColor: 'white',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      padding: '12px',
      marginTop: '4px'
    });
  }

  positionWarningOverlay(postElement, overlay) {
    // Ensure the post element has relative positioning
    if (getComputedStyle(postElement).position === 'static') {
      postElement.style.position = 'relative';
    }
  }

  getThreatWarningLevel(threatScore) {
    if (threatScore >= 0.7) return 'high';
    if (threatScore >= 0.4) return 'medium';
    return 'low';
  }

  suggestReportPost(threatData) {
    // Show instructions for reporting the post
    const modal = document.createElement('div');
    modal.className = 'ss-report-modal';
    
    modal.innerHTML = `
      <div class="ss-modal-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="ss-modal-content">
        <h3>🚨 Report This Post</h3>
        <p>This post appears to contain ${threatData.primaryThreat}. Consider reporting it to the platform:</p>
        <div class="ss-report-instructions">
          <div class="ss-instruction">1. Click the three dots menu on the post</div>
          <div class="ss-instruction">2. Select "Report post"</div>
          <div class="ss-instruction">3. Choose the appropriate category (spam, harmful, etc.)</div>
          <div class="ss-instruction">4. Provide additional context if requested</div>
        </div>
        <div class="ss-modal-actions">
          <button onclick="this.parentElement.parentElement.parentElement.remove()">Close</button>
        </div>
      </div>
    `;
    
    this.styleModal(modal);
    document.body.appendChild(modal);
  }

  hidePost(postElement) {
    if (postElement) {
      postElement.style.opacity = '0.3';
      postElement.style.filter = 'blur(2px)';
      postElement.style.pointerEvents = 'none';
      
      // Add unhide button
      const unhideBtn = document.createElement('button');
      unhideBtn.textContent = 'Show Post';
      unhideBtn.className = 'ss-unhide-btn';
      unhideBtn.onclick = () => {
        postElement.style.opacity = '';
        postElement.style.filter = '';
        postElement.style.pointerEvents = '';
        unhideBtn.remove();
      };
      
      Object.assign(unhideBtn.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: '1001',
        padding: '8px 16px',
        backgroundColor: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      });
      
      postElement.appendChild(unhideBtn);
    }
  }

  whitelistPost(threatData) {
    // Add to user's whitelist (simplified implementation)
    chrome.storage.sync.get(['socialWhitelist'], (result) => {
      const whitelist = result.socialWhitelist || [];
      whitelist.push({
        type: threatData.primaryThreat,
        indicators: threatData.indicators.slice(0, 2), // Store key indicators
        timestamp: Date.now()
      });
      
      // Keep only recent entries
      const recent = whitelist.filter(item => Date.now() - item.timestamp < 7 * 24 * 60 * 60 * 1000);
      
      chrome.storage.sync.set({ socialWhitelist: recent });
    });
    
    this.showMessage('Post marked as safe', 'success');
  }

  handleSocialThreatDetected(payload) {
    console.log('[SocialShield] Social threat detected:', payload);
    // The threat has already been processed by analyzePost
  }

  handleSocialAnalysisComplete(payload) {
    console.log('[SocialShield] Analysis complete:', payload);
    // Additional processing if needed
  }

  handleSocialVerificationComplete(payload) {
    console.log('[SocialShield] Verification complete:', payload);
    // Update UI with verification results
  }

  handleMediaAnalysisComplete(payload) {
    console.log('[SocialShield] Media analysis complete:', payload);
    
    if (payload.steganographyRisk > 0.6) {
      this.showMediaThreatAlert(payload);
    }
  }

  showMediaThreatAlert(mediaAnalysis) {
    const alert = document.createElement('div');
    alert.className = 'ss-media-alert';
    alert.innerHTML = `
      <div class="ss-alert-content">
        <div class="ss-alert-icon">🔍</div>
        <div class="ss-alert-text">
          <strong>Media Analysis Alert</strong><br>
          Possible steganography detected in image/video
        </div>
        <button class="ss-alert-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    Object.assign(alert.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: '#fef3c7',
      border: '1px solid #f59e0b',
      borderRadius: '8px',
      padding: '12px',
      maxWidth: '300px',
      zIndex: '10000',
      fontSize: '14px'
    });
    
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 8000);
  }

  showSocialNotification(threatData) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('SocialShield: Threat Detected', {
        body: `${threatData.primaryThreat} detected in social media post`,
        icon: chrome.runtime.getURL('assets/icons/icon-48.png'),
        tag: 'socialshield-threat'
      });
    }
  }

  logSocialThreat(postData, threatData) {
    const logEntry = {
      timestamp: Date.now(),
      platform: this.platform,
      threatType: threatData.primaryThreat,
      threatScore: Math.round(threatData.threatScore * 10) / 10,
      indicators: threatData.indicators.slice(0, 5),
      postId: postData.id
      // Don't log actual content for privacy
    };
    
    chrome.storage.local.get(['socialThreatLog'], (result) => {
      const log = result.socialThreatLog || [];
      log.push(logEntry);
      
      // Keep only last 500 entries
      if (log.length > 500) {
        log.splice(0, log.length - 500);
      }
      
      chrome.storage.local.set({ socialThreatLog: log });
    });
  }

  // Helper methods
  isRepetitiveContent(text) {
    const words = text.toLowerCase().split(/\s+/);
    const wordCount = {};
    
    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
    
    // Check for excessive repetition
    const maxCount = Math.max(...Object.values(wordCount));
    return maxCount > words.length * 0.3; // More than 30% repetition
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  isSuspiciousDomain(domain) {
    const suspiciousPatterns = [
      /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/, // IP addresses
      /-[a-z]{10,}\./, // Long suspicious subdomains
      /\.tk$|\.ml$|\.ga$|\.cf$/, // Free domain TLDs
      /[a-z]{20,}\.com/ // Very long domains
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(domain));
  }

  isImpersonationAccount(username) {
    // Simplified impersonation detection
    const suspiciousPatterns = [
      /official.*copy/i,
      /verified.*account/i,
      /support.*team/i,
      /[0-9]{8,}$/ // Accounts ending with many numbers
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(username));
  }

  hasEmotionalManipulation(text) {
    const emotionalPatterns = [
      /you\s+won't\s+believe/i,
      /shocking.*truth/i,
      /this\s+will\s+change\s+everything/i,
      /doctors\s+hate\s+this/i,
      /one\s+simple\s+trick/i
    ];
    
    return emotionalPatterns.some(pattern => pattern.test(text));
  }

  hasCredibleSources(text) {
    const credibleSources = [
      /reuters\.com|ap\.org|bbc\.com|npr\.org/i,
      /\.edu|\.gov/i,
      /peer.?reviewed/i,
      /journal\s+of/i
    ];
    
    return credibleSources.some(pattern => pattern.test(text));
  }

  getImageFormat(url) {
    const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  isMediaUrlSuspicious(url) {
    return /temp|anonymous|hidden|secret/.test(url);
  }

  generatePostId(postElement, text) {
    const textHash = btoa(text.slice(0, 50)).slice(0, 16);
    return `post_${textHash}_${Date.now()}`;
  }

  createSocialShieldIndicator() {
    // Remove existing indicator
    const existing = document.getElementById('socialshield-indicator');
    if (existing) existing.remove();
    
    const indicator = document.createElement('div');
    indicator.id = 'socialshield-indicator';
    indicator.innerHTML = '🛡️ SocialShield';
    
    indicator.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      left: 20px !important;
      background: linear-gradient(135deg, #1da1f2, #0d8bd9) !important;
      color: white !important;
      padding: 8px 16px !important;
      border-radius: 20px !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      z-index: 999999 !important;
      box-shadow: 0 4px 12px rgba(29, 161, 242, 0.3) !important;
      cursor: pointer !important;
      user-select: none !important;
      transition: all 0.3s ease !important;
      animation: socialShieldPulse 3s infinite !important;
    `;
    
    // Add click handler to show status
    indicator.addEventListener('click', () => {
      this.showSocialShieldStatus();
    });
    
    // Add pulsing animation
    if (!document.getElementById('socialshield-styles')) {
      const style = document.createElement('style');
      style.id = 'socialshield-styles';
      style.textContent = `
        @keyframes socialShieldPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 12px rgba(29, 161, 242, 0.3); }
          50% { transform: scale(1.05); box-shadow: 0 6px 16px rgba(29, 161, 242, 0.5); }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(indicator);
    
    // Show activation message
    this.showMessage('🛡️ SocialShield Active - X/Twitter monitoring enabled', 'success');
  },

  showSocialShieldStatus() {
    const status = `
🛡️ SocialShield Status
Platform: ${this.platform.toUpperCase()}
Agents: ${this.agents.size} active
Posts Scanned: ${this.scannedPosts ? 'Active' : '0'}
Threats Detected: Loading...
Real-time: ✅ Online
`;
    this.showMessage(status, 'info');
  },

  createThreatOverlay() {
    if (this.threatOverlay) return;
    
    this.threatOverlay = document.createElement('div');
    this.threatOverlay.id = 'ss-threat-overlay';
    
    Object.assign(this.threatOverlay.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '0',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '9999'
    });
    
    document.body.appendChild(this.threatOverlay);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+S: Toggle SocialShield
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.toggleSocialShield();
      }
      
      // Ctrl+Shift+R: Rescan current page
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        this.rescanPage();
      }
    });
  }

  toggleSocialShield() {
    const isEnabled = !this.userSettings.enableSocialShield;
    this.userSettings.enableSocialShield = isEnabled;
    
    chrome.storage.sync.set({ enableSocialShield: isEnabled });
    
    if (isEnabled) {
      this.startSocialMonitoring();
      this.showMessage('SocialShield enabled', 'success');
    } else {
      // Stop monitoring
      this.showMessage('SocialShield disabled', 'info');
    }
  }

  async rescanPage() {
    this.scannedPosts.clear();
    
    if (this.platform === 'x') {
      await this.setupXMonitoring();
    } else if (this.platform === 'facebook') {
      await this.setupFacebookMonitoring();
    }
    
    this.showMessage('Page rescanned for threats', 'info');
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
    console.error('[SocialShield]', errorMessage);
    this.showMessage(`Error: ${errorMessage}`, 'error');
  }

  styleModal(modal) {
    const style = document.createElement('style');
    style.textContent = `
      .ss-report-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 10001;
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      .ss-modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
      }
      
      .ss-modal-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border-radius: 12px;
        max-width: 500px;
        padding: 24px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      }
      
      .ss-instruction {
        margin: 8px 0;
        padding-left: 16px;
      }
      
      .ss-modal-actions {
        margin-top: 20px;
        text-align: right;
      }
      
      .ss-modal-actions button {
        padding: 8px 16px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    `;
    
    document.head.appendChild(style);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  destroy() {
    // Cleanup
    for (const [name, agent] of this.agents) {
      agent.destroy();
    }
    this.threatOverlay?.remove();
    console.log('[SocialShield] Cleaned up');
  }
}

// Initialize SocialShield when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.socialShield = new SocialShieldContent();
  });
} else {
  window.socialShield = new SocialShieldContent();
}

// Handle page navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    // Reinitialize if needed
    if (window.socialShield) {
      window.socialShield.destroy();
      setTimeout(() => {
        window.socialShield = new SocialShieldContent();
      }, 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });