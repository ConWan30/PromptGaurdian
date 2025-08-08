/**
 * Verification Agent
 * Cross-references threats using Brave Search API and external intelligence sources
 */

import { BaseAgent } from './base-agent.js';

class VerificationAgent extends BaseAgent {
  constructor(config = {}) {
    super('Verification', config);
    
    this.braveApiUrl = 'https://api.search.brave.com/res/v1';
    this.railwayApiUrl = 'https://promptgaurdian-production.up.railway.app';
    this.braveApiKey = null;
    this.verificationCache = new Map();
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    this.setupEventHandlers();
    this.initializeVerification();
  }

  setupEventHandlers() {
    this.on('verify_threat', this.verifyThreat.bind(this));
    this.on('verify_social', this.verifySocialThreat.bind(this));
    this.on('batch_verify', this.batchVerify.bind(this));
    this.on('update_intelligence', this.updateThreatIntelligence.bind(this));
  }

  async initializeVerification() {
    // Load API key and configuration
    await this.loadConfiguration();
    
    // Start processing queue
    this.startQueueProcessor();
    
    await this.broadcast('agent_ready', { 
      agentType: this.agentType,
      capabilities: ['brave_search', 'threat_intel', 'batch_processing']
    });
  }

  async loadConfiguration() {
    this.braveApiKey = await this.getStorageData('brave_api_key');
    this.verificationConfig = await this.getStorageData('verification_config') || {
      enableBraveSearch: true,
      enableThreatIntel: true,
      batchSize: 5,
      cacheTtl: 1800000 // 30 minutes
    };
  }

  async verifyThreat(payload) {
    const { query, context, priority = 'normal' } = payload;
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(query, context);
      const cached = this.verificationCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.verificationConfig.cacheTtl) {
        await this.broadcast('verification_complete', {
          ...cached.result,
          cached: true,
          query: query.slice(0, 50)
        });
        return;
      }

      // Add to queue for processing
      const verificationRequest = {
        id: crypto.randomUUID(),
        query,
        context,
        priority,
        timestamp: Date.now(),
        type: 'prompt_verification'
      };
      
      this.addToQueue(verificationRequest);
      
    } catch (error) {
      console.error('[Verification] Error in threat verification:', error);
      await this.broadcast('verification_error', { 
        error: error.message,
        query: query.slice(0, 50)
      });
    }
  }

  async verifySocialThreat(payload) {
    const { query, context, postData } = payload;
    
    try {
      const cacheKey = this.generateCacheKey(query, 'social_media');
      const cached = this.verificationCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.verificationConfig.cacheTtl) {
        await this.broadcast('verification_complete', {
          ...cached.result,
          cached: true,
          type: 'social'
        });
        return;
      }

      const verificationRequest = {
        id: crypto.randomUUID(),
        query,
        context: 'social_media_threat',
        postData,
        timestamp: Date.now(),
        type: 'social_verification',
        priority: this.determineSocialPriority(postData)
      };
      
      this.addToQueue(verificationRequest);
      
    } catch (error) {
      console.error('[Verification] Error in social verification:', error);
      await this.broadcast('verification_error', { 
        error: error.message,
        type: 'social'
      });
    }
  }

  addToQueue(request) {
    // Priority queue: high priority requests go first
    if (request.priority === 'high') {
      this.requestQueue.unshift(request);
    } else {
      this.requestQueue.push(request);
    }
    
    // Process queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      
      try {
        await this.processVerificationRequest(request);
        
        // Small delay between requests to respect rate limits
        await this.sleep(200);
      } catch (error) {
        console.error('[Verification] Queue processing error:', error);
        await this.broadcast('verification_error', {
          error: error.message,
          requestId: request.id
        });
      }
    }
    
    this.isProcessingQueue = false;
  }

  async processVerificationRequest(request) {
    const { query, context, type, postData } = request;
    
    let verificationResult;
    
    if (type === 'prompt_verification') {
      verificationResult = await this.performPromptVerification(query, context);
    } else if (type === 'social_verification') {
      verificationResult = await this.performSocialVerification(query, postData);
    }
    
    // Cache the result
    const cacheKey = this.generateCacheKey(query, context);
    this.verificationCache.set(cacheKey, {
      result: verificationResult,
      timestamp: Date.now()
    });
    
    // Broadcast result
    await this.broadcast('verification_complete', {
      ...verificationResult,
      requestId: request.id,
      type: type.replace('_verification', '')
    });
  }

  async performPromptVerification(query, context) {
    const verificationSources = [];
    
    // 1. Brave Search for security-related information
    if (this.verificationConfig.enableBraveSearch && this.braveApiKey) {
      try {
        const braveResults = await this.searchBraveForThreatIntel(query, 'prompt_injection');
        verificationSources.push({
          source: 'brave_search',
          confidence: this.calculateBraveConfidence(braveResults),
          data: braveResults,
          indicators: this.extractThreatIndicators(braveResults, 'prompt')
        });
      } catch (error) {
        console.warn('[Verification] Brave Search failed:', error.message);
      }
    }
    
    // 2. Check against crowdsourced threat patterns via Railway
    if (this.verificationConfig.enableThreatIntel) {
      try {
        const threatIntel = await this.queryThreatIntelligence(query, 'prompt');
        verificationSources.push({
          source: 'threat_intelligence',
          confidence: threatIntel.confidence,
          data: threatIntel,
          indicators: threatIntel.patterns || []
        });
      } catch (error) {
        console.warn('[Verification] Threat intelligence failed:', error.message);
      }
    }
    
    // 3. OWASP and security knowledge base search
    try {
      const owaspResults = await this.searchSecurityKnowledgeBase(query);
      if (owaspResults.relevance > 0.3) {
        verificationSources.push({
          source: 'security_kb',
          confidence: owaspResults.relevance,
          data: owaspResults,
          indicators: owaspResults.techniques || []
        });
      }
    } catch (error) {
      console.warn('[Verification] Security KB search failed:', error.message);
    }
    
    // Aggregate and analyze all sources
    const aggregatedResult = this.aggregateVerificationSources(verificationSources, 'prompt');
    
    return {
      isVerifiedThreat: aggregatedResult.confidence > 0.6,
      confidence: aggregatedResult.confidence,
      threatType: aggregatedResult.primaryThreat,
      sources: verificationSources.length,
      evidence: aggregatedResult.evidence,
      recommendations: this.generateVerificationRecommendations(aggregatedResult, 'prompt')
    };
  }

  async performSocialVerification(query, postData) {
    const verificationSources = [];
    const { links = [], media = [] } = postData || {};
    
    // 1. Verify suspicious links
    for (const link of links.slice(0, 3)) { // Limit to 3 links
      try {
        const linkVerification = await this.verifyLink(link);
        verificationSources.push({
          source: 'link_verification',
          confidence: linkVerification.threatScore,
          data: linkVerification,
          indicators: linkVerification.indicators
        });
      } catch (error) {
        console.warn('[Verification] Link verification failed:', error.message);
      }
    }
    
    // 2. Search for spam/phishing patterns
    if (this.braveApiKey) {
      try {
        const spamResults = await this.searchBraveForThreatIntel(query, 'spam_detection');
        verificationSources.push({
          source: 'spam_intelligence',
          confidence: this.calculateSpamConfidence(spamResults),
          data: spamResults,
          indicators: this.extractThreatIndicators(spamResults, 'spam')
        });
      } catch (error) {
        console.warn('[Verification] Spam intelligence failed:', error.message);
      }
    }
    
    // 3. Media steganography check via image search
    for (const mediaItem of media.slice(0, 2)) { // Limit media checks
      if (mediaItem.type === 'image') {
        try {
          const mediaVerification = await this.verifyMediaSteganography(mediaItem);
          if (mediaVerification.suspicionLevel > 0.4) {
            verificationSources.push({
              source: 'media_verification',
              confidence: mediaVerification.suspicionLevel,
              data: mediaVerification,
              indicators: ['steganography_suspected']
            });
          }
        } catch (error) {
          console.warn('[Verification] Media verification failed:', error.message);
        }
      }
    }
    
    // 4. Cross-reference with known social media threats
    try {
      const socialIntel = await this.queryThreatIntelligence(query, 'social');
      verificationSources.push({
        source: 'social_intelligence',
        confidence: socialIntel.confidence,
        data: socialIntel,
        indicators: socialIntel.patterns || []
      });
    } catch (error) {
      console.warn('[Verification] Social intelligence failed:', error.message);
    }
    
    const aggregatedResult = this.aggregateVerificationSources(verificationSources, 'social');
    
    return {
      isVerifiedThreat: aggregatedResult.confidence > 0.5, // Lower threshold for social
      confidence: aggregatedResult.confidence,
      threatType: aggregatedResult.primaryThreat,
      sources: verificationSources.length,
      evidence: aggregatedResult.evidence,
      recommendations: this.generateVerificationRecommendations(aggregatedResult, 'social')
    };
  }

  async searchBraveForThreatIntel(query, threatCategory) {
    const searchQueries = this.buildBraveSearchQueries(query, threatCategory);
    const results = [];
    
    for (const searchQuery of searchQueries) {
      try {
        const response = await this.makeBraveApiCall('/web/search', {
          q: searchQuery,
          count: 5,
          safesearch: 'strict'
        });
        
        if (response.web && response.web.results) {
          results.push(...response.web.results);
        }
      } catch (error) {
        console.warn(`[Verification] Brave search failed for "${searchQuery}":`, error.message);
      }
      
      // Small delay between queries
      await this.sleep(100);
    }
    
    return this.processBraveResults(results, threatCategory);
  }

  buildBraveSearchQueries(query, threatCategory) {
    const baseQuery = query.slice(0, 100); // Limit query length
    
    const queryTemplates = {
      prompt_injection: [
        `"${baseQuery}" prompt injection security vulnerability`,
        `"${baseQuery}" AI jailbreak attack technique`,
        `prompt injection "${baseQuery}" OWASP security`,
        `"${baseQuery}" LLM security threat analysis`
      ],
      spam_detection: [
        `"${baseQuery}" spam phishing scam alert`,
        `"${baseQuery}" malicious link warning`,
        `"${baseQuery}" social media fraud detection`,
        `"${baseQuery}" suspicious activity report`
      ],
      steganography: [
        `"${baseQuery}" steganography hidden message`,
        `"${baseQuery}" covert communication technique`,
        `steganography detection "${baseQuery}"`
      ]
    };
    
    return queryTemplates[threatCategory] || [`"${baseQuery}" security threat`];
  }

  async makeBraveApiCall(endpoint, params) {
    if (!this.braveApiKey) {
      // Try to get key from Railway proxy
      return await this.makeRailwayProxyCall('brave' + endpoint, { params });
    }
    
    const url = new URL(this.braveApiUrl + endpoint);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    
    const response = await this.withRetry(() =>
      this.makeAPICall(url.toString(), {
        headers: {
          'X-Subscription-Token': this.braveApiKey,
          'Accept': 'application/json'
        }
      })
    );
    
    return response;
  }

  async makeRailwayProxyCall(endpoint, data) {
    const response = await this.makeAPICall(`${this.railwayApiUrl}/proxy/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    return response;
  }

  processBraveResults(results, threatCategory) {
    const processedResults = {
      relevantResults: [],
      securitySources: 0,
      threatIndicators: [],
      confidenceScore: 0
    };
    
    const securityDomains = [
      'owasp.org', 'cve.mitre.org', 'nvd.nist.gov', 
      'security.org', 'sans.org', 'cert.org'
    ];
    
    for (const result of results) {
      const { title, description, url } = result;
      const content = `${title} ${description}`.toLowerCase();
      
      // Check if result is from security source
      const isSecuritySource = securityDomains.some(domain => url.includes(domain));
      if (isSecuritySource) {
        processedResults.securitySources++;
      }
      
      // Extract threat indicators based on category
      const indicators = this.extractIndicatorsFromContent(content, threatCategory);
      processedResults.threatIndicators.push(...indicators);
      
      if (indicators.length > 0 || isSecuritySource) {
        processedResults.relevantResults.push({
          title,
          description,
          url,
          isSecuritySource,
          indicators,
          relevanceScore: this.calculateContentRelevance(content, threatCategory)
        });
      }
    }
    
    // Calculate overall confidence
    processedResults.confidenceScore = this.calculateBraveConfidence(processedResults);
    
    return processedResults;
  }

  extractIndicatorsFromContent(content, threatCategory) {
    const indicators = [];
    
    const indicatorPatterns = {
      prompt_injection: [
        'prompt injection', 'jailbreak', 'system prompt', 'instruction override',
        'llm security', 'ai vulnerability', 'prompt engineering attack'
      ],
      spam_detection: [
        'phishing', 'scam', 'fraud', 'malicious', 'suspicious link',
        'spam detection', 'fake offer', 'social engineering'
      ],
      steganography: [
        'steganography', 'hidden message', 'covert channel', 'data hiding',
        'image encoding', 'secret communication'
      ]
    };
    
    const patterns = indicatorPatterns[threatCategory] || [];
    
    for (const pattern of patterns) {
      if (content.includes(pattern)) {
        indicators.push(pattern);
      }
    }
    
    return indicators;
  }

  calculateBraveConfidence(braveResults) {
    if (!braveResults.relevantResults) return 0;
    
    let confidence = 0;
    const { relevantResults, securitySources, threatIndicators } = braveResults;
    
    // Base confidence from relevant results
    confidence += Math.min(relevantResults.length / 10, 0.4);
    
    // Bonus for security sources
    confidence += Math.min(securitySources / 5, 0.3);
    
    // Bonus for threat indicators
    confidence += Math.min(threatIndicators.length / 20, 0.3);
    
    return Math.min(confidence, 1);
  }

  async queryThreatIntelligence(query, context) {
    try {
      const response = await this.makeAPICall(`${this.railwayApiUrl}/threats/patterns/${context}`, {
        method: 'GET'
      });
      
      if (response.patterns) {
        return this.matchQueryAgainstPatterns(query, response.patterns);
      }
      
      return { confidence: 0, patterns: [] };
    } catch (error) {
      console.warn('[Verification] Threat intelligence query failed:', error.message);
      return { confidence: 0, patterns: [] };
    }
  }

  matchQueryAgainstPatterns(query, patterns) {
    let bestMatch = { confidence: 0, patterns: [] };
    const queryLower = query.toLowerCase();
    
    for (const pattern of patterns) {
      let matchScore = 0;
      const matchedIndicators = [];
      
      if (pattern.indicators) {
        for (const indicator of pattern.indicators) {
          if (queryLower.includes(indicator.toLowerCase())) {
            matchScore += 0.2;
            matchedIndicators.push(indicator);
          }
        }
      }
      
      if (matchScore > bestMatch.confidence) {
        bestMatch = {
          confidence: Math.min(matchScore, 1),
          patterns: matchedIndicators,
          threatType: pattern.threatType,
          reportCount: pattern.reportCount || 1
        };
      }
    }
    
    return bestMatch;
  }

  async searchSecurityKnowledgeBase(query) {
    // Search OWASP and security resources
    const owaspQuery = `site:owasp.org "${query}" OR "prompt injection" OR "AI security"`;
    
    try {
      const owaspResults = await this.makeBraveApiCall('/web/search', {
        q: owaspQuery,
        count: 3
      });
      
      return {
        relevance: owaspResults.web?.results?.length ? 0.7 : 0.2,
        techniques: this.extractOwaspTechniques(owaspResults),
        sources: owaspResults.web?.results || []
      };
    } catch (error) {
      return { relevance: 0, techniques: [], sources: [] };
    }
  }

  extractOwaspTechniques(owaspResults) {
    const techniques = [];
    
    if (owaspResults.web?.results) {
      for (const result of owaspResults.web.results) {
        const content = `${result.title} ${result.description}`.toLowerCase();
        
        // Extract OWASP technique identifiers
        const owaspPatterns = [
          'llm01', 'llm02', 'llm03', 'llm04', 'llm05',
          'prompt injection', 'insecure output handling', 'training data poisoning'
        ];
        
        for (const pattern of owaspPatterns) {
          if (content.includes(pattern)) {
            techniques.push(pattern);
          }
        }
      }
    }
    
    return [...new Set(techniques)];
  }

  async verifyLink(url) {
    try {
      // Use Brave's Safe Browsing equivalent via URL search
      const linkQuery = `"${url}" malicious phishing scam warning`;
      
      const searchResults = await this.makeBraveApiCall('/web/search', {
        q: linkQuery,
        count: 3
      });
      
      let threatScore = 0;
      const indicators = [];
      
      if (searchResults.web?.results) {
        for (const result of searchResults.web.results) {
          const content = `${result.title} ${result.description}`.toLowerCase();
          
          if (content.includes('malicious') || content.includes('phishing')) {
            threatScore += 0.4;
            indicators.push('reported_malicious');
          }
          
          if (content.includes('scam') || content.includes('fraud')) {
            threatScore += 0.3;
            indicators.push('reported_scam');
          }
        }
      }
      
      // Additional heuristic checks
      if (this.isUrlSuspicious(url)) {
        threatScore += 0.2;
        indicators.push('suspicious_structure');
      }
      
      return {
        url,
        threatScore: Math.min(threatScore, 1),
        indicators,
        verified: searchResults.web?.results?.length > 0
      };
    } catch (error) {
      return {
        url,
        threatScore: 0,
        indicators: [],
        verified: false,
        error: error.message
      };
    }
  }

  isUrlSuspicious(url) {
    // Heuristic URL analysis
    const suspiciousPatterns = [
      /bit\.ly|tinyurl|shorturl|t\.co/, // URL shorteners
      /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/, // IP addresses
      /-[a-z]{10,}\./, // Suspicious subdomains
      /[a-z]{20,}\.com/, // Very long domains
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  async verifyMediaSteganography(mediaItem) {
    try {
      // Search for similar images that might contain steganography
      const imageQuery = `steganography "hidden message" image analysis`;
      
      const imageResults = await this.makeBraveApiCall('/images/search', {
        q: imageQuery,
        count: 5
      });
      
      let suspicionLevel = 0;
      
      // Heuristic analysis based on file characteristics
      if (mediaItem.src) {
        // Check file extension and URL patterns
        if (/\.(png|bmp)$/i.test(mediaItem.src)) {
          suspicionLevel += 0.2; // PNG/BMP more suitable for steganography
        }
        
        // Suspicious URL patterns
        if (/temp|anonymous|hidden/i.test(mediaItem.src)) {
          suspicionLevel += 0.3;
        }
      }
      
      return {
        mediaItem,
        suspicionLevel,
        technique: 'heuristic_analysis',
        recommendations: suspicionLevel > 0.5 ? ['further_analysis_required'] : []
      };
    } catch (error) {
      return {
        mediaItem,
        suspicionLevel: 0,
        error: error.message
      };
    }
  }

  aggregateVerificationSources(sources, context) {
    if (sources.length === 0) {
      return {
        confidence: 0,
        primaryThreat: 'none',
        evidence: [],
        sources: []
      };
    }
    
    // Weighted confidence calculation
    const weights = {
      'brave_search': 0.4,
      'threat_intelligence': 0.3,
      'security_kb': 0.2,
      'link_verification': 0.3,
      'media_verification': 0.2,
      'social_intelligence': 0.3
    };
    
    let totalConfidence = 0;
    let totalWeight = 0;
    const evidence = [];
    const threatTypes = new Map();
    
    for (const source of sources) {
      const weight = weights[source.source] || 0.1;
      totalConfidence += source.confidence * weight;
      totalWeight += weight;
      
      // Collect evidence
      if (source.indicators && source.indicators.length > 0) {
        evidence.push({
          source: source.source,
          indicators: source.indicators,
          confidence: source.confidence
        });
      }
      
      // Track threat types
      if (source.data && source.data.threatType) {
        const currentCount = threatTypes.get(source.data.threatType) || 0;
        threatTypes.set(source.data.threatType, currentCount + source.confidence);
      }
    }
    
    // Determine primary threat type
    let primaryThreat = 'unknown';
    let maxThreatScore = 0;
    
    for (const [threatType, score] of threatTypes.entries()) {
      if (score > maxThreatScore) {
        maxThreatScore = score;
        primaryThreat = threatType;
      }
    }
    
    return {
      confidence: totalWeight > 0 ? totalConfidence / totalWeight : 0,
      primaryThreat,
      evidence,
      sources: sources.map(s => s.source)
    };
  }

  generateVerificationRecommendations(result, context) {
    const recommendations = [];
    
    if (result.confidence > 0.8) {
      recommendations.push('HIGH_CONFIDENCE_THREAT_DETECTED');
      if (context === 'prompt') {
        recommendations.push('AVOID_SUBMITTING_PROMPT');
        recommendations.push('CONSIDER_REPHRASING');
      } else if (context === 'social') {
        recommendations.push('AVOID_INTERACTING_WITH_POST');
        recommendations.push('CONSIDER_REPORTING');
      }
    } else if (result.confidence > 0.5) {
      recommendations.push('MODERATE_THREAT_DETECTED');
      recommendations.push('EXERCISE_CAUTION');
      recommendations.push('VERIFY_FROM_ADDITIONAL_SOURCES');
    } else if (result.confidence > 0.3) {
      recommendations.push('LOW_THREAT_DETECTED');
      recommendations.push('REMAIN_VIGILANT');
    }
    
    // Evidence-based recommendations
    for (const evidence of result.evidence) {
      if (evidence.indicators.includes('reported_malicious')) {
        recommendations.push('MALICIOUS_CONTENT_REPORTED');
      }
      if (evidence.indicators.includes('steganography_suspected')) {
        recommendations.push('HIDDEN_MESSAGE_SUSPECTED');
      }
    }
    
    return [...new Set(recommendations)];
  }

  determineSocialPriority(postData) {
    // Determine verification priority for social posts
    if (postData.links && postData.links.length > 2) {
      return 'high'; // Multiple links = higher priority
    }
    if (postData.media && postData.media.length > 0) {
      return 'normal'; // Media content = normal priority
    }
    return 'low';
  }

  generateCacheKey(query, context) {
    return btoa(`${query.slice(0, 100)}_${context}`).slice(0, 32);
  }

  calculateContentRelevance(content, threatCategory) {
    // Simple relevance scoring based on keyword density
    const keywords = {
      prompt_injection: ['prompt', 'injection', 'jailbreak', 'bypass', 'override'],
      spam_detection: ['spam', 'phishing', 'scam', 'fraud', 'malicious'],
      steganography: ['steganography', 'hidden', 'covert', 'secret', 'encode']
    };
    
    const categoryKeywords = keywords[threatCategory] || [];
    let relevanceScore = 0;
    
    for (const keyword of categoryKeywords) {
      const regex = new RegExp(keyword, 'gi');
      const matches = content.match(regex);
      if (matches) {
        relevanceScore += matches.length * 0.1;
      }
    }
    
    return Math.min(relevanceScore, 1);
  }

  async batchVerify(payload) {
    const { queries, context } = payload;
    const results = [];
    
    for (const query of queries) {
      try {
        const result = await this.verifyThreat({ query, context });
        results.push(result);
        
        // Small delay between batch items
        await this.sleep(100);
      } catch (error) {
        results.push({ query, error: error.message });
      }
    }
    
    await this.broadcast('batch_verification_complete', {
      results,
      total: queries.length,
      context
    });
  }

  async updateThreatIntelligence(payload) {
    // Update local threat intelligence cache
    const { patterns, source, confidence } = payload;
    
    // This would typically update a local database or cache
    // For now, we'll just broadcast the update
    await this.broadcast('threat_intelligence_updated', {
      patterns: patterns.length,
      source,
      confidence,
      timestamp: Date.now()
    });
  }

  startQueueProcessor() {
    // Process queue periodically
    setInterval(() => {
      if (this.requestQueue.length > 0 && !this.isProcessingQueue) {
        this.processQueue();
      }
    }, 1000);
  }

  async process(input) {
    const { type, query, context } = input;
    
    switch (type) {
      case 'verify':
        return await this.verifyThreat({ query, context });
      case 'verify_social':
        return await this.verifySocialThreat({ query, context });
      case 'verify_link':
        return await this.verifyLink(query);
      default:
        return { error: 'Unknown verification type' };
    }
  }

  async analyze(data) {
    // Main analysis entry point
    if (typeof data === 'string') {
      return await this.performPromptVerification(data, 'general');
    } else if (data.postData) {
      return await this.performSocialVerification(data.query, data.postData);
    }
    
    return { error: 'Invalid data for verification' };
  }

  getVerificationStats() {
    return {
      cacheSize: this.verificationCache.size,
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue,
      hasBraveKey: !!this.braveApiKey,
      config: this.verificationConfig
    };
  }
}

export { VerificationAgent };