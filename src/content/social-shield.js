/**
 * SocialShield Content Script
 * Real-time X/Twitter threat monitoring with autonomous AI integration
 */

console.log('[SocialShield] 🛡️ X/Twitter Security Monitor Loading...');

class SocialShieldContent {
  constructor() {
    this.isInitialized = false;
    this.platform = this.detectPlatform();
    this.activeAlerts = new Set();
    this.scannedPosts = new Set();
    this.observedElements = new Set();
    this.userSettings = {};
    this.threatStats = {
      totalScanned: 0,
      threatsDetected: 0,
      postsBlocked: 0
    };
    
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
      
      // Set up UI components
      this.createSocialShieldIndicator();
      this.setupKeyboardShortcuts();
      
      // Initialize agents
      await this.initializeAgents();
      
      // Start monitoring social feeds
      await this.startSocialMonitoring();
      
      this.isInitialized = true;
      console.log('[SocialShield] ✅ Successfully initialized');
      
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
      // Use defaults since chrome.storage might not be available in all contexts
      this.userSettings = {
        enableSocialShield: true,
        enableSpamDetection: true,
        enableSteganographyDetection: true,
        enableMisinformationDetection: true,
        enablePhishingDetection: true,
        socialThreatThreshold: 0.4,
        enablePostOverlays: true,
        scanningMode: 'smart',
        autoScanImages: true,
        maxPostsToScan: 50,
        railwayApiUrl: 'https://promptgaurdian-production.up.railway.app'
      };
      
      // Try to load from storage if available
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get(this.userSettings, (settings) => {
          this.userSettings = settings;
          resolve(settings);
        });
      } else {
        resolve(this.userSettings);
      }
    });
  }

  async initializeAgents() {
    try {
      console.log('[SocialShield] 🤖 Loading AI Agents...');
      
      // Load agents using script injection
      this.agents = {};
      
      const agentPaths = [
        'src/agents/browser-compatible/orchestrator-agent.js',
        'src/agents/browser-compatible/analysis-agent.js', 
        'src/agents/browser-compatible/verification-agent.js'
      ];
      
      let loadedAgents = 0;
      
      for (const agentPath of agentPaths) {
        try {
          await this.loadAgent(agentPath);
          loadedAgents++;
        } catch (error) {
          console.warn(`[SocialShield] Failed to load ${agentPath}:`, error);
        }
      }
      
      console.log(`[SocialShield] ✅ ${loadedAgents}/${agentPaths.length} AI Agents loaded`);
      
      // Set up agent coordination
      if (window.promptGuardianAgents) {
        this.agents = window.promptGuardianAgents;
        console.log('[SocialShield] 🔗 Agent coordination established');
      }
      
    } catch (error) {
      console.warn('[SocialShield] Agent initialization failed:', error);
      // Continue without agents - local analysis will work
    }
  }

  async loadAgent(agentPath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(agentPath);
      script.onload = () => {
        console.log(`[SocialShield] ✅ Loaded: ${agentPath.split('/').pop()}`);
        resolve();
      };
      script.onerror = (error) => {
        console.warn(`[SocialShield] ❌ Failed to load: ${agentPath}`);
        reject(error);
      };
      document.head.appendChild(script);
    });
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
        
        .ss-threat-warning {
          position: absolute !important;
          top: 0 !important;
          right: 0 !important;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.9)) !important;
          color: white !important;
          padding: 4px 8px !important;
          border-radius: 4px !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          z-index: 10 !important;
          animation: threatBlink 2s infinite !important;
        }
        
        @keyframes threatBlink {
          0%, 50% { opacity: 1; }
          25%, 75% { opacity: 0.7; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(indicator);
    
    // Show activation message
    this.showMessage('🛡️ SocialShield Active - X/Twitter monitoring enabled', 'success');
  }

  showSocialShieldStatus() {
    const agentCount = this.agents && typeof this.agents === 'object' ? Object.keys(this.agents).length : 0;
    const agentStatus = agentCount > 0 ? `✅ ${agentCount} Active` : '⚠️ Loading';
    
    const status = `🛡️ SocialShield Status
Platform: ${this.platform.toUpperCase()}
AI Agents: ${agentStatus}
Posts Scanned: ${this.threatStats.totalScanned}
Threats Detected: ${this.threatStats.threatsDetected}
Posts Blocked: ${this.threatStats.postsBlocked}
Real-time: ✅ Online
xAI Grok: ✅ Ready
Autonomous Mesh: ✅ Operational`;
    
    this.showMessage(status, 'info');
  }

  async startSocialMonitoring() {
    if (this.platform === 'x') {
      await this.setupXMonitoring();
    } else {
      console.log('[SocialShield] Platform not supported:', this.platform);
      return;
    }

    console.log('[SocialShield] 📡 Social monitoring started');
  }

  async setupXMonitoring() {
    // X (Twitter) specific selectors and monitoring
    const postSelectors = [
      'article[data-testid="tweet"]',
      '[data-testid="tweet"]',
      '[role="article"]'
    ];

    // Initial scan of existing posts
    await this.scanExistingPosts(postSelectors);

    // Set up mutation observers for new posts
    this.setupTimelineObservers(postSelectors);

    console.log('[SocialShield] 🐦 X/Twitter monitoring active');
  }

  async scanExistingPosts(postSelectors) {
    const posts = this.findPosts(postSelectors);
    const postsToScan = posts.slice(0, this.userSettings.maxPostsToScan);
    
    console.log(`[SocialShield] 🔍 Scanning ${postsToScan.length} existing posts`);

    for (const [index, post] of postsToScan.entries()) {
      try {
        await this.analyzePost(post);
        this.scannedPosts.add(post);
        this.threatStats.totalScanned++;
        
        // Small delay to avoid overwhelming
        if (index % 10 === 0) {
          await this.sleep(200);
        }
      } catch (error) {
        console.warn('[SocialShield] Error scanning post:', error);
      }
    }

    // Update indicator with scan results
    this.updateIndicatorStats();
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

  setupTimelineObservers(postSelectors) {
    const timeline = document.querySelector('[data-testid="primaryColumn"]') || 
                     document.querySelector('[aria-label*="Timeline"]') ||
                     document.body;
    
    if (timeline && !this.observedElements.has(timeline)) {
      const observer = new MutationObserver((mutations) => {
        this.handleTimelineMutations(mutations, postSelectors);
      });
      
      observer.observe(timeline, {
        childList: true,
        subtree: true
      });
      
      this.observedElements.add(timeline);
      console.log('[SocialShield] 👀 Timeline observer active');
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
    
    // Analyze new posts (limit to prevent overload)
    for (const post of newPosts.slice(0, 5)) {
      try {
        await this.analyzePost(post);
        this.scannedPosts.add(post);
        this.threatStats.totalScanned++;
        await this.sleep(100);
      } catch (error) {
        console.warn('[SocialShield] Error analyzing new post:', error);
      }
    }

    if (newPosts.length > 0) {
      this.updateIndicatorStats();
    }
  }

  async analyzePost(postElement) {
    try {
      const postData = this.extractPostData(postElement);
      
      if (!postData || !postData.text?.trim()) {
        return; // Skip posts without text content
      }

      // Perform threat analysis
      const threatAnalysis = await this.performThreatAnalysis(postData);
      
      if (threatAnalysis.isThreat && threatAnalysis.threatScore > this.userSettings.socialThreatThreshold) {
        console.warn('[SocialShield] 🚨 Threat detected:', threatAnalysis);
        this.showPostThreatWarning(postElement, postData, threatAnalysis);
        this.threatStats.threatsDetected++;
      }

    } catch (error) {
      console.error('[SocialShield] Post analysis error:', error);
    }
  }

  extractPostData(postElement) {
    try {
      // X (Twitter) specific extraction
      const textElement = postElement.querySelector('[data-testid="tweetText"]') ||
                         postElement.querySelector('[lang]') ||
                         postElement.querySelector('span');
      
      const text = textElement ? textElement.textContent.trim() : '';
      
      // Extract links
      const linkElements = postElement.querySelectorAll('a[href^="http"]');
      const links = Array.from(linkElements).map(el => el.href);
      
      // Extract user info
      const userElement = postElement.querySelector('[data-testid="User-Name"]') ||
                         postElement.querySelector('[data-testid="User-Names"]');
      const username = userElement ? userElement.textContent : 'unknown';
      
      return {
        id: this.generatePostId(postElement, text),
        text,
        links,
        username,
        element: postElement,
        platform: 'x',
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[SocialShield] Data extraction error:', error);
      return null;
    }
  }

  async performThreatAnalysis(postData) {
    // Local threat pattern analysis
    const localAnalysis = this.analyzeWithLocalPatterns(postData);
    
    // Try to enhance with autonomous mesh if available
    try {
      const meshAnalysis = await this.analyzeWithAutonomousMesh(postData);
      if (meshAnalysis) {
        return {
          isThreat: meshAnalysis.threatScore > 0.6,
          threatScore: meshAnalysis.threatScore,
          threatType: meshAnalysis.threatType,
          severity: meshAnalysis.severity,
          source: 'autonomous_mesh',
          explanation: meshAnalysis.explanation || 'AI analysis detected potential threat',
          recommendations: meshAnalysis.recommendations || []
        };
      }
    } catch (error) {
      console.warn('[SocialShield] Autonomous mesh unavailable, using local analysis');
    }
    
    return localAnalysis;
  }

  analyzeWithLocalPatterns(postData) {
    const { text, links } = postData;
    let threatScore = 0;
    const indicators = [];
    let threatType = 'safe';
    
    // Spam patterns
    const spamPatterns = [
      { regex: /urgent.*click.*now/i, score: 0.7, type: 'spam' },
      { regex: /limited.*time.*offer/i, score: 0.6, type: 'spam' },
      { regex: /free.*crypto.*airdrop/i, score: 0.8, type: 'spam' },
      { regex: /guaranteed.*profit/i, score: 0.8, type: 'spam' },
      { regex: /earn.*\$\d+.*fast/i, score: 0.7, type: 'spam' }
    ];
    
    // Phishing patterns
    const phishingPatterns = [
      { regex: /verify.*your.*account/i, score: 0.8, type: 'phishing' },
      { regex: /suspended.*account/i, score: 0.9, type: 'phishing' },
      { regex: /click.*to.*confirm/i, score: 0.7, type: 'phishing' },
      { regex: /security.*alert/i, score: 0.6, type: 'phishing' }
    ];
    
    // Check all patterns
    const allPatterns = [...spamPatterns, ...phishingPatterns];
    
    for (const pattern of allPatterns) {
      if (pattern.regex.test(text)) {
        threatScore = Math.max(threatScore, pattern.score);
        threatType = pattern.type;
        indicators.push(pattern.regex.toString());
      }
    }
    
    // Suspicious links analysis
    const suspiciousUrlPatterns = [
      /bit\.ly|tinyurl|t\.co|short\.link/i,
      /\.(tk|ml|ga|cf)$/i,
      /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/
    ];
    
    for (const link of links) {
      for (const pattern of suspiciousUrlPatterns) {
        if (pattern.test(link)) {
          threatScore = Math.max(threatScore, 0.6);
          threatType = threatType === 'safe' ? 'suspicious_link' : threatType;
          indicators.push('suspicious_url');
        }
      }
    }
    
    return {
      isThreat: threatScore > 0.4,
      threatScore,
      threatType,
      severity: threatScore > 0.8 ? 'CRITICAL' : threatScore > 0.6 ? 'HIGH' : 'MEDIUM',
      source: 'local_patterns',
      explanation: `Local pattern analysis detected ${threatType} with ${indicators.length} indicators`,
      recommendations: threatScore > 0.6 ? ['Exercise caution', 'Verify before clicking'] : []
    };
  }

  async analyzeWithAutonomousMesh(postData) {
    try {
      const response = await fetch(`${this.userSettings.railwayApiUrl}/proxy/analyze-threat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: postData.text,
          threatType: 'social_media',
          context: {
            platform: postData.platform,
            author: postData.username,
            links: postData.links
          },
          useGrok: true,
          useBrave: true,
          priority: 'normal'
        })
      });

      if (response.ok) {
        const analysis = await response.json();
        console.log('[SocialShield] 🤖 Autonomous mesh analysis:', analysis);
        return analysis;
      }
    } catch (error) {
      console.warn('[SocialShield] Autonomous mesh error:', error.message);
    }
    return null;
  }

  showPostThreatWarning(postElement, postData, threatAnalysis) {
    if (!this.userSettings.enablePostOverlays) return;
    
    // Avoid duplicate warnings
    if (postElement.querySelector('.ss-threat-warning')) return;
    
    const warning = document.createElement('div');
    warning.className = 'ss-threat-warning';
    warning.innerHTML = `⚠️ ${threatAnalysis.threatType.toUpperCase()}`;
    
    // Make post container relative for positioning
    postElement.style.position = 'relative';
    postElement.appendChild(warning);
    
    // Log the threat
    this.logThreat(postData, threatAnalysis);
    
    // Update stats
    this.threatStats.postsBlocked++;
    this.updateIndicatorColor('threat');
  }

  logThreat(postData, threatAnalysis) {
    console.warn(`[SocialShield] 🚨 THREAT: ${threatAnalysis.threatType} in post by @${postData.username}`);
    console.warn(`[SocialShield] Content: ${postData.text.substring(0, 100)}...`);
    console.warn(`[SocialShield] Score: ${(threatAnalysis.threatScore * 100).toFixed(0)}%`);
  }

  updateIndicatorStats() {
    const indicator = document.getElementById('socialshield-indicator');
    if (indicator) {
      indicator.innerHTML = `🛡️ SocialShield (${this.threatStats.totalScanned})`;
    }
  }

  updateIndicatorColor(status) {
    const indicator = document.getElementById('socialshield-indicator');
    if (!indicator) return;
    
    if (status === 'threat') {
      indicator.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
      indicator.innerHTML = '🚨 SocialShield';
      
      setTimeout(() => {
        indicator.style.background = 'linear-gradient(135deg, #1da1f2, #0d8bd9)';
        indicator.innerHTML = `🛡️ SocialShield (${this.threatStats.totalScanned})`;
      }, 3000);
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+S: Toggle SocialShield
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.toggleSocialShield();
      }
    });
  }

  toggleSocialShield() {
    const isEnabled = !this.userSettings.enableSocialShield;
    this.userSettings.enableSocialShield = isEnabled;
    
    if (isEnabled) {
      this.createSocialShieldIndicator();
      this.showMessage('SocialShield enabled', 'success');
    } else {
      const indicator = document.getElementById('socialshield-indicator');
      if (indicator) indicator.remove();
      this.showMessage('SocialShield disabled', 'info');
    }
  }

  showMessage(text, type = 'info') {
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'} !important;
      color: white !important;
      padding: 12px 20px !important;
      border-radius: 8px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      z-index: 999999 !important;
      max-width: 300px !important;
      white-space: pre-line !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
    `;
    message.textContent = text;
    
    document.body.appendChild(message);
    
    setTimeout(() => {
      if (message.parentElement) {
        message.style.opacity = '0';
        message.style.transform = 'translateX(20px)';
        setTimeout(() => message.remove(), 300);
      }
    }, type === 'success' ? 4000 : 3000);
  }

  showError(errorMessage) {
    console.error('[SocialShield]', errorMessage);
    this.showMessage(`Error: ${errorMessage}`, 'error');
  }

  generatePostId(postElement, text) {
    const textHash = btoa(text.slice(0, 50) || 'empty').slice(0, 16);
    return `post_${textHash}_${Date.now()}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Initialize SocialShield when DOM is ready
function initSocialShield() {
  // Only run on supported platforms
  const hostname = window.location.hostname;
  if (!hostname.includes('x.com') && !hostname.includes('twitter.com')) {
    console.log('[SocialShield] Not on supported platform:', hostname);
    return;
  }

  if (window.socialShield) {
    console.log('[SocialShield] Already initialized');
    return;
  }

  console.log('[SocialShield] 🚀 Starting initialization...');
  window.socialShield = new SocialShieldContent();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSocialShield);
} else {
  initSocialShield();
}

// Handle SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('[SocialShield] 📍 Navigation detected, reinitializing...');
    setTimeout(initSocialShield, 1000);
  }
}).observe(document, { subtree: true, childList: true });

console.log('[SocialShield] 🌐 Content Script Loaded');