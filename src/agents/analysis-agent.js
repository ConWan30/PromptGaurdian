/**
 * Analysis Agent
 * Evaluates threats using xAI Grok API with multimodal reasoning
 */

import { BaseAgent } from './base-agent.js';

class AnalysisAgent extends BaseAgent {
  constructor(config = {}) {
    super('Analysis', config);
    
    this.grokApiUrl = 'https://api.x.ai/v1/chat/completions';
    this.grokApiKey = null;
    this.threatPatterns = new Map();
    this.analysisCache = new Map();
    
    this.setupEventHandlers();
    this.loadThreatPatterns();
  }

  async setupEventHandlers() {
    await super.setupEventHandlers();
    
    this.on('analyze_prompt', this.analyzePromptThreat.bind(this));
    this.on('analyze_social', this.analyzeSocialThreat.bind(this));
    this.on('coordinate_analysis', this.coordinateAnalysis.bind(this));
  }

  async loadThreatPatterns() {
    // Load threat patterns from storage or defaults
    const patterns = await this.getStorageData('threat_patterns') || this.getDefaultPatterns();
    
    patterns.forEach(pattern => {
      this.threatPatterns.set(pattern.type, pattern);
    });
  }

  getDefaultPatterns() {
    return [
      {
        type: 'prompt_injection',
        patterns: ['ignore previous', 'forget instructions', 'new instructions', 'system prompt'],
        severity: 'high'
      },
      {
        type: 'jailbreak',
        patterns: ['DAN mode', 'developer mode', 'roleplay as', 'pretend you are'],
        severity: 'critical'
      },
      {
        type: 'social_spam',
        patterns: ['click here now', 'limited time offer', 'free crypto', 'urgent action'],
        severity: 'medium'
      },
      {
        type: 'steganography',
        patterns: ['hidden message', 'decode this', 'secret code', 'base64'],
        severity: 'high'
      }
    ];
  }

  async analyzePromptThreat(payload) {
    const { data, threatType, priority } = payload;
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(data);
      if (this.analysisCache.has(cacheKey)) {
        const cachedResult = this.analysisCache.get(cacheKey);
        await this.broadcast('analysis_complete', cachedResult);
        return;
      }
      
      // Perform initial pattern matching
      const patternAnalysis = this.performPatternMatching(data, 'prompt');
      
      // Use Grok API for deep analysis if pattern matching indicates potential threat
      if (patternAnalysis.threatScore > 0.3) {
        const grokAnalysis = await this.analyzeWithGrok(data, 'prompt_security', patternAnalysis);
        
        const finalResult = {
          result: {
            isThreat: grokAnalysis.confidence > 0.6,
            threatType: grokAnalysis.threatType,
            severity: grokAnalysis.severity,
            explanation: grokAnalysis.reasoning
          },
          confidence: grokAnalysis.confidence,
          recommendations: this.generateRecommendations(grokAnalysis, 'prompt'),
          agentType: this.agentType,
          rawAnalysis: grokAnalysis
        };
        
        // Cache result
        this.analysisCache.set(cacheKey, finalResult);
        
        await this.broadcast('analysis_complete', finalResult);
      } else {
        // Low threat, quick response
        await this.broadcast('analysis_complete', {
          result: { isThreat: false, threatType: 'none' },
          confidence: 1 - patternAnalysis.threatScore,
          recommendations: [],
          agentType: this.agentType
        });
      }
    } catch (error) {
      console.error('[Analysis] Error analyzing prompt threat:', error);
      await this.broadcast('analysis_error', { error: error.message });
    }
  }

  async analyzeSocialThreat(payload) {
    const { postData, searchQuery, analysisType } = payload;
    
    try {
      // Use Grok's Search tool for X post analysis
      const grokSearchResult = await this.searchWithGrok(searchQuery, postData);
      
      // Analyze each type requested
      const analyses = await Promise.all(
        analysisType.map(type => this.analyzeSpecificThreatType(postData, type, grokSearchResult))
      );
      
      // Combine analyses
      const combinedAnalysis = this.combineAnalyses(analyses);
      
      const finalResult = {
        result: {
          isThreat: combinedAnalysis.maxThreatScore > 0.7,
          threatType: combinedAnalysis.primaryThreat,
          severity: combinedAnalysis.severity,
          explanation: combinedAnalysis.explanation
        },
        confidence: combinedAnalysis.confidence,
        recommendations: this.generateRecommendations(combinedAnalysis, 'social'),
        agentType: this.agentType,
        analysisBreakdown: analyses
      };
      
      await this.broadcast('analysis_complete', finalResult);
    } catch (error) {
      console.error('[Analysis] Error analyzing social threat:', error);
      await this.broadcast('analysis_error', { error: error.message });
    }
  }

  async analyzeWithGrok(content, analysisType, initialAnalysis = {}) {
    const apiKey = await this.getGrokApiKey();
    if (!apiKey) {
      throw new Error('Grok API key not configured');
    }
    
    const prompt = this.buildGrokPrompt(content, analysisType, initialAnalysis);
    
    const response = await this.withRetry(() =>
      this.makeAPICall(this.grokApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'grok-2-1212',
          messages: [
            {
              role: 'system',
              content: 'You are a cybersecurity expert specializing in AI prompt injection and social media threat detection. Analyze the provided content and return a JSON response with threat assessment.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.1
        })
      })
    );
    
    return this.parseGrokResponse(response);
  }

  async searchWithGrok(searchQuery, context) {
    // Use Grok's Search tool functionality
    const apiKey = await this.getGrokApiKey();
    if (!apiKey) return null;
    
    const searchPrompt = `${searchQuery}. Context: ${JSON.stringify(context)}`;
    
    const response = await this.makeAPICall(this.grokApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-2-1212',
        messages: [
          {
            role: 'system',
            content: 'You have access to real-time X (Twitter) data. Search and analyze posts for security threats.'
          },
          {
            role: 'user',
            content: searchPrompt
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'search_x_posts',
              description: 'Search X posts for patterns and threats',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  limit: { type: 'number', default: 10 }
                }
              }
            }
          }
        ]
      })
    });
    
    return response;
  }

  buildGrokPrompt(content, analysisType, initialAnalysis) {
    let prompt = `Analyze this content for security threats:\n\n"${content}"\n\n`;
    
    if (analysisType === 'prompt_security') {
      prompt += `Focus on:
      - Prompt injection attempts
      - Jailbreak techniques
      - Social engineering
      - Information extraction attempts
      
      Initial pattern analysis detected: ${JSON.stringify(initialAnalysis)}
      `;
    } else if (analysisType === 'social_media') {
      prompt += `Focus on:
      - Spam patterns
      - Phishing attempts  
      - Misinformation indicators
      - Steganography in media
      - Malicious links
      `;
    }
    
    prompt += `
    Return response in JSON format:
    {
      "threatType": "string",
      "confidence": number (0-1),
      "severity": "low|medium|high|critical",
      "reasoning": "detailed explanation",
      "indicators": ["list", "of", "threat", "indicators"]
    }`;
    
    return prompt;
  }

  parseGrokResponse(response) {
    try {
      const content = response.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback parsing
      return {
        threatType: 'unknown',
        confidence: 0.5,
        severity: 'medium',
        reasoning: content,
        indicators: []
      };
    } catch (error) {
      console.error('[Analysis] Error parsing Grok response:', error);
      return {
        threatType: 'parse_error',
        confidence: 0,
        severity: 'low',
        reasoning: 'Failed to parse response',
        indicators: []
      };
    }
  }

  performPatternMatching(content, context) {
    let threatScore = 0;
    const matchedPatterns = [];
    
    const contentLower = content.toLowerCase();
    
    this.threatPatterns.forEach((pattern, type) => {
      const matches = pattern.patterns.filter(p => contentLower.includes(p.toLowerCase()));
      
      if (matches.length > 0) {
        matchedPatterns.push({ type, matches, severity: pattern.severity });
        
        // Weight score by severity
        const severityWeight = {
          'low': 0.1,
          'medium': 0.3,
          'high': 0.6,
          'critical': 0.9
        };
        
        threatScore += severityWeight[pattern.severity] * (matches.length / pattern.patterns.length);
      }
    });
    
    return {
      threatScore: Math.min(threatScore, 1),
      matchedPatterns,
      context
    };
  }

  async analyzeSpecificThreatType(postData, threatType, searchContext) {
    switch (threatType) {
      case 'spam':
        return this.analyzeSpamThreat(postData, searchContext);
      case 'steganography':
        return this.analyzeSteganographyThreat(postData, searchContext);
      case 'misinformation':
        return this.analyzeMisinformationThreat(postData, searchContext);
      default:
        return { threatType, score: 0, confidence: 0 };
    }
  }

  async analyzeSpamThreat(postData, context) {
    // Analyze for spam patterns
    const spamIndicators = [
      'urgency keywords',
      'suspicious links',
      'repetitive content',
      'fake engagement'
    ];
    
    return {
      threatType: 'spam',
      score: 0.5, // Placeholder - would use ML model
      confidence: 0.7,
      indicators: spamIndicators.filter(() => Math.random() > 0.5) // Placeholder
    };
  }

  combineAnalyses(analyses) {
    const maxScore = Math.max(...analyses.map(a => a.score));
    const primaryThreat = analyses.find(a => a.score === maxScore)?.threatType;
    
    return {
      maxThreatScore: maxScore,
      primaryThreat,
      severity: maxScore > 0.8 ? 'critical' : maxScore > 0.6 ? 'high' : 'medium',
      confidence: analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length,
      explanation: `Combined analysis of ${analyses.length} threat types`
    };
  }

  generateRecommendations(analysis, context) {
    const recommendations = [];
    
    if (context === 'prompt' && analysis.confidence > 0.7) {
      recommendations.push('Consider rephrasing to avoid potential security risks');
      recommendations.push('Review content for injection patterns');
    } else if (context === 'social' && analysis.maxThreatScore > 0.6) {
      recommendations.push('Exercise caution with this post');
      recommendations.push('Consider reporting if spam/malicious');
      recommendations.push('Verify information from additional sources');
    }
    
    return recommendations;
  }

  generateCacheKey(content) {
    return btoa(content).slice(0, 32);
  }

  async getGrokApiKey() {
    if (!this.grokApiKey) {
      this.grokApiKey = await this.getStorageData('grok_api_key');
    }
    return this.grokApiKey;
  }

  async coordinateAnalysis(payload) {
    const { analysisId, data, mode } = payload;
    
    // Coordinate with other agents based on mode
    if (mode === 'prompt') {
      await this.analyzePromptThreat({ data, threatType: 'general', priority: 'normal' });
    } else if (mode === 'social') {
      await this.analyzeSocialThreat({ 
        postData: data, 
        searchQuery: 'analyze this post for threats',
        analysisType: ['spam', 'steganography', 'misinformation']
      });
    }
  }

  async process(input) {
    return await this.analyze(input);
  }

  async analyze(data) {
    // Main analysis entry point
    const analysisType = this.determineAnalysisType(data);
    
    if (analysisType === 'prompt') {
      return await this.analyzePromptThreat({ data, threatType: 'general' });
    } else if (analysisType === 'social') {
      return await this.analyzeSocialThreat({ 
        postData: data,
        searchQuery: 'general threat analysis',
        analysisType: ['spam', 'steganography']
      });
    }
    
    return { error: 'Unknown analysis type' };
  }

  determineAnalysisType(data) {
    if (typeof data === 'string') {
      return 'prompt';
    } else if (data.postData || data.media) {
      return 'social';
    }
    return 'unknown';
  }
}

export { AnalysisAgent };