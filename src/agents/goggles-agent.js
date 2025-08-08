/**
 * Goggles Agent  
 * Implements Brave's Dynamic Goggles for threat-specific search filtering and re-ranking
 */

import { BaseAgent } from './base-agent.js';

class GogglesAgent extends BaseAgent {
  constructor(config = {}) {
    super('Goggles', config);
    
    this.braveApiUrl = 'https://api.search.brave.com/res/v1';
    this.railwayApiUrl = 'https://promptgaurdian-production.up.railway.app';
    this.braveApiKey = null;
    this.gogglesCache = new Map();
    this.customGoggles = new Map();
    this.adaptiveGoggles = new Map();
    
    this.setupEventHandlers();
    this.initializeGoggles();
  }

  setupEventHandlers() {
    this.on('create_goggles', this.createDynamicGoggles.bind(this));
    this.on('search_with_goggles', this.searchWithGoggles.bind(this));
    this.on('adapt_goggles', this.adaptGogglesForContext.bind(this));
    this.on('generate_threat_goggles', this.generateThreatSpecificGoggles.bind(this));
  }

  async initializeGoggles() {
    await this.loadConfiguration();
    await this.createDefaultGoggles();
    
    await this.broadcast('agent_ready', { 
      agentType: this.agentType,
      capabilities: ['dynamic_goggles', 'threat_filtering', 'adaptive_search']
    });
  }

  async loadConfiguration() {
    this.braveApiKey = await this.getStorageData('brave_api_key');
    this.gogglesConfig = await this.getStorageData('goggles_config') || {
      enableAdaptiveGoggles: true,
      cacheGoggles: true,
      maxCachedGoggles: 50,
      gogglesUpdateInterval: 3600000 // 1 hour
    };
  }

  async createDefaultGoggles() {
    // Pre-built goggles for common threat scenarios
    const defaultGoggles = {
      'prompt_injection_security': {
        name: 'Prompt Injection Security Research',
        description: 'Focuses on authoritative security sources for prompt injection analysis',
        rules: this.buildPromptInjectionGoggles(),
        category: 'security',
        priority: 0.9
      },
      'social_media_threats': {
        name: 'Social Media Threat Intelligence',
        description: 'Prioritizes threat intelligence and fraud detection sources',
        rules: this.buildSocialThreatGoggles(),
        category: 'social_security',
        priority: 0.8
      },
      'steganography_research': {
        name: 'Steganography Detection Research',
        description: 'Academic and technical sources for steganography analysis',
        rules: this.buildSteganographyGoggles(),
        category: 'multimedia_security',
        priority: 0.7
      },
      'owasp_llm_security': {
        name: 'OWASP LLM Security Framework',
        description: 'OWASP Top 10 for LLM Applications focused search',
        rules: this.buildOwaspLlmGoggles(),
        category: 'ai_security',
        priority: 0.95
      },
      'cybersecurity_intelligence': {
        name: 'Cybersecurity Threat Intelligence',
        description: 'General cybersecurity and threat intelligence sources',
        rules: this.buildCyberSecurityGoggles(),
        category: 'general_security',
        priority: 0.6
      }
    };
    
    for (const [id, goggle] of Object.entries(defaultGoggles)) {
      this.customGoggles.set(id, goggle);
    }
  }

  buildPromptInjectionGoggles() {
    return [
      // Boost authoritative security sources
      '$boost=1.5,site:owasp.org',
      '$boost=1.4,site:cve.mitre.org',
      '$boost=1.3,site:nvd.nist.gov',
      '$boost=1.3,site:security.googleblog.com',
      '$boost=1.2,site:openai.com/blog',
      '$boost=1.2,site:anthropic.com',
      '$boost=1.1,site:arxiv.org',
      
      // Academic and research sources
      '$boost=1.2,site:acm.org',
      '$boost=1.1,site:ieee.org',
      '$boost=1.1,site:usenix.org',
      
      // Security communities and forums
      '$boost=1.0,site:reddit.com/r/netsec',
      '$boost=1.0,site:stackoverflow.com',
      
      // Downrank commercial and promotional content
      '$downrank=0.7,site:*.shop',
      '$downrank=0.7,site:*.store',
      '$downrank=0.6,inurl:buy',
      '$downrank=0.6,inurl:product',
      
      // Filter out unrelated content
      '$discard,site:pinterest.com',
      '$discard,site:instagram.com',
      '$discard,site:tiktok.com',
      '$discard,inurl:recipe',
      '$discard,inurl:dating'
    ];
  }

  buildSocialThreatGoggles() {
    return [
      // Boost fraud and scam detection sources
      '$boost=1.5,site:ftc.gov',
      '$boost=1.4,site:ic3.gov',
      '$boost=1.3,site:scamwatch.gov.au',
      '$boost=1.3,site:actionfraud.police.uk',
      '$boost=1.2,site:snopes.com',
      '$boost=1.2,site:factcheck.org',
      
      // Security and threat intelligence
      '$boost=1.4,site:krebsonsecurity.com',
      '$boost=1.3,site:threatpost.com',
      '$boost=1.2,site:bleepingcomputer.com',
      '$boost=1.1,site:malwarebytes.com',
      
      // Social media security research
      '$boost=1.2,inurl:social+media+security',
      '$boost=1.1,inurl:phishing+detection',
      '$boost=1.1,inurl:spam+analysis',
      
      // Academic research on social threats
      '$boost=1.2,site:arxiv.org inurl:social',
      '$boost=1.1,site:acm.org inurl:social',
      
      // Downrank social media platforms themselves
      '$downrank=0.5,site:facebook.com',
      '$downrank=0.5,site:twitter.com',
      '$downrank=0.5,site:x.com',
      '$downrank=0.5,site:linkedin.com',
      
      // Filter lifestyle and entertainment
      '$discard,inurl:celebrity',
      '$discard,inurl:entertainment',
      '$discard,inurl:lifestyle'
    ];
  }

  buildSteganographyGoggles() {
    return [
      // Academic and research institutions
      '$boost=1.5,site:*.edu',
      '$boost=1.4,site:arxiv.org',
      '$boost=1.3,site:researchgate.net',
      '$boost=1.2,site:acm.org',
      '$boost=1.2,site:ieee.org',
      
      // Technical and security sources
      '$boost=1.3,site:sans.org',
      '$boost=1.2,site:nist.gov',
      '$boost=1.1,site:github.com inurl:steganography',
      
      // Specific steganography tools and techniques
      '$boost=1.2,inurl:steganography+detection',
      '$boost=1.1,inurl:hidden+message',
      '$boost=1.1,inurl:image+analysis',
      '$boost=1.0,inurl:steganalysis',
      
      // Filter unrelated image content
      '$downrank=0.6,site:shutterstock.com',
      '$downrank=0.6,site:getty*.com',
      '$downrank=0.5,inurl:wallpaper',
      '$downrank=0.5,inurl:photo+gallery',
      
      // Discard social media and entertainment
      '$discard,site:instagram.com',
      '$discard,site:pinterest.com',
      '$discard,inurl:meme'
    ];
  }

  buildOwaspLlmGoggles() {
    return [
      // Primary OWASP sources
      '$boost=2.0,site:owasp.org inurl:llm',
      '$boost=1.8,site:owasp.org inurl:ai',
      '$boost=1.5,site:owasp.org',
      
      // AI security and research
      '$boost=1.4,site:openai.com/research',
      '$boost=1.4,site:anthropic.com/research',
      '$boost=1.3,site:deepmind.com',
      '$boost=1.2,site:ai.google/research',
      
      // Security frameworks and standards
      '$boost=1.3,site:nist.gov inurl:ai',
      '$boost=1.2,site:iso.org inurl:ai',
      '$boost=1.1,site:cisa.gov inurl:ai',
      
      // Academic AI security research
      '$boost=1.3,site:arxiv.org inurl:ai+security',
      '$boost=1.2,site:arxiv.org inurl:llm+safety',
      '$boost=1.1,site:*.edu inurl:ai+security',
      
      // Security conferences and papers
      '$boost=1.2,site:usenix.org inurl:ai',
      '$boost=1.1,site:ndss-symposium.org',
      
      // Filter commercial AI tools
      '$downrank=0.7,inurl:chatgpt+alternative',
      '$downrank=0.7,inurl:ai+tool',
      '$downrank=0.6,inurl:buy+ai',
      
      // Discard general AI hype content
      '$discard,inurl:ai+will+replace',
      '$discard,inurl:future+of+ai'
    ];
  }

  buildCyberSecurityGoggles() {
    return [
      // Primary security sources
      '$boost=1.5,site:cve.mitre.org',
      '$boost=1.4,site:nvd.nist.gov',
      '$boost=1.3,site:cert.org',
      '$boost=1.3,site:us-cert.cisa.gov',
      
      // Security news and analysis
      '$boost=1.3,site:krebsonsecurity.com',
      '$boost=1.2,site:darkreading.com',
      '$boost=1.2,site:securityweek.com',
      '$boost=1.1,site:threatpost.com',
      '$boost=1.1,site:bleepingcomputer.com',
      
      // Security organizations
      '$boost=1.2,site:sans.org',
      '$boost=1.1,site:cisecurity.org',
      '$boost=1.1,site:isaca.org',
      
      // Research and whitepapers
      '$boost=1.2,filetype:pdf inurl:security',
      '$boost=1.1,inurl:whitepaper+security',
      '$boost=1.0,inurl:threat+report',
      
      // Downrank vendor pitches
      '$downrank=0.7,inurl:security+solution',
      '$downrank=0.6,inurl:buy+security',
      
      // Filter unrelated content
      '$discard,site:pinterest.com',
      '$discard,inurl:recipe'
    ];
  }

  async createDynamicGoggles(payload) {
    const { threatType, context, query, customRules = [] } = payload;
    
    try {
      // Generate contextual goggles based on threat type and query
      const gogglesId = this.generateGogglesId(threatType, context, query);
      
      if (this.gogglesCache.has(gogglesId)) {
        const cached = this.gogglesCache.get(gogglesId);
        if (Date.now() - cached.timestamp < this.gogglesConfig.gogglesUpdateInterval) {
          await this.broadcast('goggles_created', {
            gogglesId,
            cached: true,
            rules: cached.rules.length
          });
          return;
        }
      }
      
      // Build dynamic goggles rules
      const dynamicRules = await this.buildDynamicGoggles(threatType, context, query);
      
      // Merge with custom rules
      const allRules = [...dynamicRules, ...customRules];
      
      // Create goggles object
      const goggles = {
        id: gogglesId,
        name: `Dynamic ${threatType} Goggles`,
        description: `AI-generated goggles for ${threatType} in ${context} context`,
        rules: allRules,
        threatType,
        context,
        query: query.slice(0, 100),
        timestamp: Date.now(),
        usage: 0
      };
      
      // Cache the goggles
      this.gogglesCache.set(gogglesId, goggles);
      
      // Clean cache if too large
      if (this.gogglesCache.size > this.gogglesConfig.maxCachedGoggles) {
        this.cleanGogglesCache();
      }
      
      await this.broadcast('goggles_created', {
        gogglesId,
        rules: allRules.length,
        threatType,
        context
      });
      
    } catch (error) {
      console.error('[Goggles] Error creating dynamic goggles:', error);
      await this.broadcast('goggles_error', {
        error: error.message,
        threatType,
        context
      });
    }
  }

  async buildDynamicGoggles(threatType, context, query) {
    const rules = [];
    
    // Threat-specific source boosting
    const threatSources = this.getThreatSpecificSources(threatType);
    for (const [source, boost] of Object.entries(threatSources)) {
      rules.push(`$boost=${boost},${source}`);
    }
    
    // Context-specific adjustments
    if (context === 'prompt_injection') {
      rules.push(...this.getPromptInjectionRules(query));
    } else if (context === 'social_media') {
      rules.push(...this.getSocialMediaRules(query));
    } else if (context === 'steganography') {
      rules.push(...this.getSteganographyRules(query));
    }
    
    // Query-specific term boosting
    const queryTerms = this.extractSignificantTerms(query);
    for (const term of queryTerms) {
      rules.push(`$boost=1.1,inurl:"${term}"`);
    }
    
    // Universal filtering rules
    rules.push(...this.getUniversalFilterRules());
    
    return rules;
  }

  getThreatSpecificSources(threatType) {
    const sources = {
      'prompt_injection': {
        'site:owasp.org': 1.5,
        'site:openai.com': 1.3,
        'site:anthropic.com': 1.3,
        'site:arxiv.org inurl:prompt': 1.2,
        'site:github.com inurl:prompt': 1.1
      },
      'spam': {
        'site:ftc.gov': 1.4,
        'site:spam.com': 1.3,
        'site:spamhaus.org': 1.3,
        'site:mailchimp.com/resources': 1.1
      },
      'phishing': {
        'site:phishing.org': 1.5,
        'site:antiphishing.org': 1.4,
        'site:ftc.gov': 1.3,
        'site:ic3.gov': 1.2
      },
      'steganography': {
        'site:*.edu inurl:steganography': 1.4,
        'site:researchgate.net': 1.3,
        'site:arxiv.org inurl:steganography': 1.3,
        'site:github.com inurl:stego': 1.1
      },
      'jailbreak': {
        'site:owasp.org': 1.4,
        'site:security.googleblog.com': 1.3,
        'site:openai.com/blog': 1.2,
        'site:anthropic.com/blog': 1.2
      }
    };
    
    return sources[threatType] || {};
  }

  getPromptInjectionRules(query) {
    const rules = [];
    
    // Boost security research terms
    const securityTerms = ['vulnerability', 'exploit', 'bypass', 'injection', 'attack'];
    for (const term of securityTerms) {
      if (query.toLowerCase().includes(term)) {
        rules.push(`$boost=1.2,inurl:"${term}"`);
      }
    }
    
    // Boost academic sources for technical queries
    if (query.includes('technique') || query.includes('method')) {
      rules.push('$boost=1.3,site:*.edu');
      rules.push('$boost=1.2,site:arxiv.org');
    }
    
    return rules;
  }

  getSocialMediaRules(query) {
    const rules = [];
    
    // Boost fraud detection sources
    rules.push('$boost=1.3,inurl:fraud+detection');
    rules.push('$boost=1.2,inurl:scam+warning');
    
    // Downrank social media platforms for analysis
    rules.push('$downrank=0.6,site:facebook.com');
    rules.push('$downrank=0.6,site:twitter.com');
    rules.push('$downrank=0.6,site:instagram.com');
    
    return rules;
  }

  getSteganographyRules(query) {
    const rules = [];
    
    // Boost technical and academic sources
    rules.push('$boost=1.4,site:*.edu');
    rules.push('$boost=1.3,filetype:pdf');
    rules.push('$boost=1.2,inurl:research');
    
    // Filter image hosting and social sites
    rules.push('$downrank=0.5,site:imgur.com');
    rules.push('$downrank=0.5,site:flickr.com');
    rules.push('$discard,site:pinterest.com');
    
    return rules;
  }

  extractSignificantTerms(query) {
    // Extract meaningful terms from query for boosting
    const stopWords = new Set(['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were']);
    
    return query.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(term => term.length > 3 && !stopWords.has(term))
      .slice(0, 5); // Limit to 5 most significant terms
  }

  getUniversalFilterRules() {
    return [
      // Common spam and low-quality filters
      '$discard,inurl:pinterest.com',
      '$discard,inurl:instagram.com',
      '$discard,site:*.shop inurl:buy',
      '$downrank=0.7,inurl:advertisement',
      '$downrank=0.7,inurl:sponsored',
      '$downrank=0.6,inurl:affiliate'
    ];
  }

  async searchWithGoggles(payload) {
    const { query, gogglesId, searchType = 'web', additionalParams = {} } = payload;
    
    try {
      let goggles;
      
      // Get goggles from cache or custom goggles
      if (this.gogglesCache.has(gogglesId)) {
        goggles = this.gogglesCache.get(gogglesId);
      } else if (this.customGoggles.has(gogglesId)) {
        goggles = this.customGoggles.get(gogglesId);
      } else {
        throw new Error(`Goggles not found: ${gogglesId}`);
      }
      
      // Convert rules to Brave Goggles format
      const gogglesRules = this.formatGogglesForBrave(goggles.rules);
      
      // Perform search with goggles
      const searchResults = await this.executeGogglesSearch(
        query, 
        gogglesRules, 
        searchType, 
        additionalParams
      );
      
      // Update goggles usage
      goggles.usage = (goggles.usage || 0) + 1;
      
      // Process and enhance results
      const enhancedResults = this.enhanceSearchResults(searchResults, goggles);
      
      await this.broadcast('goggles_search_complete', {
        query: query.slice(0, 50),
        gogglesId,
        resultsCount: enhancedResults.results?.length || 0,
        searchType,
        relevanceScore: enhancedResults.relevanceScore
      });
      
      return enhancedResults;
      
    } catch (error) {
      console.error('[Goggles] Search error:', error);
      await this.broadcast('goggles_search_error', {
        error: error.message,
        gogglesId,
        query: query.slice(0, 50)
      });
      throw error;
    }
  }

  formatGogglesForBrave(rules) {
    // Convert internal rules format to Brave Goggles syntax
    return rules.join('\n');
  }

  async executeGogglesSearch(query, gogglesRules, searchType, additionalParams) {
    const searchEndpoint = searchType === 'images' ? '/images/search' : '/web/search';
    
    const searchParams = {
      q: query,
      goggles: gogglesRules,
      count: additionalParams.count || 10,
      offset: additionalParams.offset || 0,
      ...additionalParams
    };
    
    if (this.braveApiKey) {
      // Direct API call
      return await this.makeBraveApiCall(searchEndpoint, searchParams);
    } else {
      // Use Railway proxy
      return await this.makeRailwayProxyCall(`brave${searchEndpoint}`, searchParams);
    }
  }

  async makeBraveApiCall(endpoint, params) {
    const url = new URL(this.braveApiUrl + endpoint);
    
    // Handle goggles parameter specially
    const goggles = params.goggles;
    delete params.goggles;
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value);
      }
    });
    
    const headers = {
      'X-Subscription-Token': this.braveApiKey,
      'Accept': 'application/json'
    };
    
    // Add goggles as header if present
    if (goggles) {
      headers['X-Brave-Goggles'] = goggles;
    }
    
    return await this.withRetry(() =>
      this.makeAPICall(url.toString(), { headers })
    );
  }

  async makeRailwayProxyCall(endpoint, params) {
    return await this.makeAPICall(`${this.railwayApiUrl}/proxy/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
  }

  enhanceSearchResults(searchResults, goggles) {
    if (!searchResults.web?.results && !searchResults.images?.results) {
      return { ...searchResults, relevanceScore: 0 };
    }
    
    const results = searchResults.web?.results || searchResults.images?.results || [];
    
    // Calculate relevance score based on goggles effectiveness
    let relevanceScore = 0;
    let securitySourceCount = 0;
    
    for (const result of results) {
      // Check if result matches boosted sources
      if (this.isFromBoostedSource(result.url, goggles.rules)) {
        relevanceScore += 0.2;
        securitySourceCount++;
      }
      
      // Check result quality indicators
      if (result.title && result.description) {
        relevanceScore += 0.1;
      }
      
      // Bonus for academic or official sources
      if (this.isHighQualitySource(result.url)) {
        relevanceScore += 0.15;
      }
    }
    
    // Normalize relevance score
    if (results.length > 0) {
      relevanceScore = Math.min(relevanceScore / results.length, 1);
    }
    
    return {
      ...searchResults,
      relevanceScore,
      securitySourceCount,
      gogglesEffectiveness: securitySourceCount / Math.max(results.length, 1),
      enhancedBy: goggles.name
    };
  }

  isFromBoostedSource(url, rules) {
    for (const rule of rules) {
      if (rule.startsWith('$boost=') && rule.includes('site:')) {
        const sitePattern = rule.match(/site:([^,\s]+)/);
        if (sitePattern && url.includes(sitePattern[1])) {
          return true;
        }
      }
    }
    return false;
  }

  isHighQualitySource(url) {
    const highQualityDomains = [
      '.edu', '.gov', '.org',
      'owasp.org', 'nist.gov', 'cve.mitre.org',
      'arxiv.org', 'acm.org', 'ieee.org'
    ];
    
    return highQualityDomains.some(domain => url.includes(domain));
  }

  async adaptGogglesForContext(payload) {
    const { gogglesId, newContext, threatType, feedback } = payload;
    
    try {
      let goggles = this.gogglesCache.get(gogglesId) || this.customGoggles.get(gogglesId);
      
      if (!goggles) {
        throw new Error(`Goggles not found for adaptation: ${gogglesId}`);
      }
      
      // Create adapted version
      const adaptedGogglesId = `${gogglesId}_adapted_${Date.now()}`;
      const adaptedRules = await this.adaptRulesForContext(goggles.rules, newContext, feedback);
      
      const adaptedGoggles = {
        ...goggles,
        id: adaptedGogglesId,
        name: `${goggles.name} (Adapted)`,
        rules: adaptedRules,
        adaptedFrom: gogglesId,
        adaptationContext: newContext,
        adaptationFeedback: feedback,
        timestamp: Date.now()
      };
      
      // Store adapted goggles
      this.adaptiveGoggles.set(adaptedGogglesId, adaptedGoggles);
      
      await this.broadcast('goggles_adapted', {
        originalId: gogglesId,
        adaptedId: adaptedGogglesId,
        context: newContext,
        rulesChanged: adaptedRules.length - goggles.rules.length
      });
      
      return adaptedGogglesId;
      
    } catch (error) {
      console.error('[Goggles] Adaptation error:', error);
      await this.broadcast('goggles_adaptation_error', {
        error: error.message,
        gogglesId
      });
      throw error;
    }
  }

  async adaptRulesForContext(originalRules, newContext, feedback) {
    const adaptedRules = [...originalRules];
    
    // Add context-specific rules
    if (newContext === 'high_precision') {
      // Increase boost values for authoritative sources
      for (let i = 0; i < adaptedRules.length; i++) {
        if (adaptedRules[i].includes('$boost=')) {
          const currentBoost = parseFloat(adaptedRules[i].match(/\$boost=([\d.]+)/)[1]);
          const newBoost = Math.min(currentBoost * 1.2, 2.0);
          adaptedRules[i] = adaptedRules[i].replace(/\$boost=[\d.]+/, `$boost=${newBoost}`);
        }
      }
    } else if (newContext === 'broad_coverage') {
      // Reduce strict filtering
      adaptedRules.push('$boost=1.1,site:*.com');
      adaptedRules.push('$boost=1.1,site:*.net');
    }
    
    // Apply feedback-based adaptations
    if (feedback) {
      if (feedback.tooRestrictive) {
        // Remove some discard rules
        const filteredRules = adaptedRules.filter(rule => !rule.includes('$discard'));
        adaptedRules.length = 0;
        adaptedRules.push(...filteredRules);
        
        // Add broader sources
        adaptedRules.push('$boost=1.0,site:reddit.com');
        adaptedRules.push('$boost=1.0,site:stackexchange.com');
      }
      
      if (feedback.lowQuality) {
        // Add more restrictive rules
        adaptedRules.push('$discard,inurl:forum');
        adaptedRules.push('$downrank=0.5,site:*.blogspot.com');
        adaptedRules.push('$downrank=0.5,site:medium.com');
      }
    }
    
    return adaptedRules;
  }

  async generateThreatSpecificGoggles(payload) {
    const { threatIndicators, context, priority = 'normal' } = payload;
    
    try {
      const gogglesId = `threat_specific_${Date.now()}`;
      const rules = [];
      
      // Generate rules based on threat indicators
      for (const indicator of threatIndicators) {
        if (indicator.type === 'domain') {
          rules.push(`$boost=1.3,site:${indicator.value}`);
        } else if (indicator.type === 'keyword') {
          rules.push(`$boost=1.2,inurl:"${indicator.value}"`);
        } else if (indicator.type === 'technique') {
          rules.push(`$boost=1.4,intext:"${indicator.value}"`);
        }
      }
      
      // Add context-appropriate base rules
      const baseRules = this.getBaseRulesForContext(context);
      rules.push(...baseRules);
      
      // Adjust for priority
      if (priority === 'high') {
        // More restrictive rules for high priority
        rules.push('$boost=1.5,site:*.gov');
        rules.push('$boost=1.4,site:*.edu');
        rules.push('$discard,site:*.shop');
        rules.push('$discard,site:*.store');
      }
      
      const threatGoggles = {
        id: gogglesId,
        name: `Threat-Specific Goggles`,
        description: `Generated for ${threatIndicators.length} threat indicators`,
        rules,
        context,
        priority,
        threatIndicators,
        timestamp: Date.now(),
        autoGenerated: true
      };
      
      this.gogglesCache.set(gogglesId, threatGoggles);
      
      await this.broadcast('threat_goggles_generated', {
        gogglesId,
        indicators: threatIndicators.length,
        rules: rules.length,
        context,
        priority
      });
      
      return gogglesId;
      
    } catch (error) {
      console.error('[Goggles] Error generating threat-specific goggles:', error);
      throw error;
    }
  }

  getBaseRulesForContext(context) {
    const contextRules = {
      'prompt_injection': [
        '$boost=1.5,site:owasp.org',
        '$boost=1.3,site:openai.com',
        '$discard,inurl:entertainment'
      ],
      'social_media': [
        '$boost=1.4,site:ftc.gov',
        '$boost=1.3,inurl:fraud',
        '$downrank=0.6,site:facebook.com'
      ],
      'steganography': [
        '$boost=1.4,site:*.edu',
        '$boost=1.3,site:arxiv.org',
        '$discard,site:pinterest.com'
      ],
      'general': [
        '$boost=1.2,site:*.gov',
        '$boost=1.1,site:*.edu',
        '$downrank=0.7,inurl:advertisement'
      ]
    };
    
    return contextRules[context] || contextRules['general'];
  }

  generateGogglesId(threatType, context, query) {
    const hash = btoa(`${threatType}_${context}_${query.slice(0, 50)}`).slice(0, 16);
    return `${threatType}_${hash}`;
  }

  cleanGogglesCache() {
    // Remove oldest cached goggles
    const entries = Array.from(this.gogglesCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, Math.floor(entries.length * 0.3));
    for (const [id] of toRemove) {
      this.gogglesCache.delete(id);
    }
  }

  async process(input) {
    const { type, query, gogglesId, context } = input;
    
    switch (type) {
      case 'search':
        return await this.searchWithGoggles({ query, gogglesId });
      case 'create':
        return await this.createDynamicGoggles({ threatType: context, context, query });
      case 'adapt':
        return await this.adaptGogglesForContext({ gogglesId, newContext: context });
      default:
        return { error: 'Unknown goggles operation' };
    }
  }

  async analyze(data) {
    // Analyze search effectiveness and suggest goggles improvements
    const { searchResults, gogglesId } = data;
    
    const goggles = this.gogglesCache.get(gogglesId) || this.customGoggles.get(gogglesId);
    if (!goggles) {
      return { error: 'Goggles not found for analysis' };
    }
    
    const analysis = {
      effectiveness: this.calculateGogglesEffectiveness(searchResults, goggles),
      suggestions: this.generateImprovementSuggestions(searchResults, goggles),
      sourceDistribution: this.analyzeSourceDistribution(searchResults),
      qualityMetrics: this.calculateQualityMetrics(searchResults)
    };
    
    return analysis;
  }

  calculateGogglesEffectiveness(searchResults, goggles) {
    if (!searchResults.web?.results) return 0;
    
    const results = searchResults.web.results;
    let boostedSourceCount = 0;
    let totalRelevance = 0;
    
    for (const result of results) {
      if (this.isFromBoostedSource(result.url, goggles.rules)) {
        boostedSourceCount++;
        totalRelevance += 0.8;
      } else if (this.isHighQualitySource(result.url)) {
        totalRelevance += 0.6;
      } else {
        totalRelevance += 0.3;
      }
    }
    
    return {
      boostedSourcePercentage: boostedSourceCount / results.length,
      averageRelevance: totalRelevance / results.length,
      overallScore: (boostedSourceCount / results.length) * 0.6 + (totalRelevance / results.length) * 0.4
    };
  }

  generateImprovementSuggestions(searchResults, goggles) {
    const suggestions = [];
    
    if (!searchResults.web?.results) {
      suggestions.push('No results returned - consider relaxing filters');
      return suggestions;
    }
    
    const results = searchResults.web.results;
    const boostedCount = results.filter(r => this.isFromBoostedSource(r.url, goggles.rules)).length;
    
    if (boostedCount / results.length < 0.3) {
      suggestions.push('Low boosted source percentage - consider adjusting boost values');
    }
    
    if (results.length < 5) {
      suggestions.push('Low result count - consider reducing restrictive filters');
    }
    
    const commercialCount = results.filter(r => r.url.includes('.com') && !this.isHighQualitySource(r.url)).length;
    if (commercialCount / results.length > 0.5) {
      suggestions.push('High commercial content - consider adding academic source boosts');
    }
    
    return suggestions;
  }

  analyzeSourceDistribution(searchResults) {
    if (!searchResults.web?.results) return {};
    
    const distribution = {
      educational: 0,
      government: 0,
      commercial: 0,
      security: 0,
      other: 0
    };
    
    for (const result of searchResults.web.results) {
      const url = result.url;
      
      if (url.includes('.edu')) {
        distribution.educational++;
      } else if (url.includes('.gov')) {
        distribution.government++;
      } else if (url.includes('owasp') || url.includes('security') || url.includes('cert')) {
        distribution.security++;
      } else if (url.includes('.com') || url.includes('.net')) {
        distribution.commercial++;
      } else {
        distribution.other++;
      }
    }
    
    return distribution;
  }

  calculateQualityMetrics(searchResults) {
    if (!searchResults.web?.results) return {};
    
    const results = searchResults.web.results;
    
    return {
      averageTitleLength: results.reduce((sum, r) => sum + (r.title?.length || 0), 0) / results.length,
      averageDescLength: results.reduce((sum, r) => sum + (r.description?.length || 0), 0) / results.length,
      resultsWithBothTitleAndDesc: results.filter(r => r.title && r.description).length,
      uniqueDomains: new Set(results.map(r => new URL(r.url).hostname)).size,
      securitySourceCount: results.filter(r => this.isHighQualitySource(r.url)).length
    };
  }

  getGogglesStats() {
    return {
      cachedGoggles: this.gogglesCache.size,
      customGoggles: this.customGoggles.size,
      adaptiveGoggles: this.adaptiveGoggles.size,
      totalUsage: Array.from(this.gogglesCache.values()).reduce((sum, g) => sum + (g.usage || 0), 0),
      config: this.gogglesConfig
    };
  }
}

export { GogglesAgent };