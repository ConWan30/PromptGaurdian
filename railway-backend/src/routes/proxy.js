/**
 * API Proxy Routes
 * Proxies requests to xAI Grok and Brave Search APIs
 */

const express = require('express');
const NodeCache = require('node-cache');
const crypto = require('crypto');

// Re-enabled dependencies for autonomous AI-security mesh
const axios = require('axios');

// Circuit breaker implementation
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
  }

  async execute(operation, fallback) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log(`[CircuitBreaker:${this.name}] Attempting reset...`);
      } else {
        console.log(`[CircuitBreaker:${this.name}] Circuit open, executing fallback`);
        return await fallback();
      }
    }

    try {
      const result = await operation();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        console.log(`[CircuitBreaker:${this.name}] Circuit reset successful`);
      }
      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        console.log(`[CircuitBreaker:${this.name}] Circuit opened due to failures`);
      }
      
      if (fallback) {
        console.log(`[CircuitBreaker:${this.name}] Executing fallback due to error:`, error.message);
        return await fallback();
      }
      throw error;
    }
  }
}

// Initialize circuit breakers for autonomous mesh
const grokBreaker = new CircuitBreaker('Grok', {
  failureThreshold: 3,
  resetTimeout: 45000
});

const braveBreaker = new CircuitBreaker('Brave', {
  failureThreshold: 3,
  resetTimeout: 30000
});

// Enhanced local threat detector for autonomous mesh
const localThreatDetector = {
  async analyzeThreat(content, context = {}) {
    console.log('[LocalML] Analyzing threat with enhanced patterns...');
    
    const patterns = {
      'prompt_injection': {
        regex: /ignore.*instruction|forget.*rule|disregard.*guideline/i,
        score: 0.85
      },
      'jailbreak': {
        regex: /jailbreak|bypass.*safety|act.*as.*(admin|root|god)/i,
        score: 0.90
      },
      'system_extraction': {
        regex: /system.*prompt|your.*instruction|tell.*me.*your.*rule/i,
        score: 0.75
      },
      'roleplay_attack': {
        regex: /roleplay|pretend.*you.*are|act.*as.*unrestricted/i,
        score: 0.70
      },
      'encoding_bypass': {
        regex: /base64|hex.*encode|\\x[0-9a-f]{2}|%[0-9a-f]{2}/i,
        score: 0.65
      }
    };

    let maxScore = 0.1;
    let detectedType = 'safe';
    let matchedPattern = '';

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.regex.test(content)) {
        if (pattern.score > maxScore) {
          maxScore = pattern.score;
          detectedType = type;
          matchedPattern = content.match(pattern.regex)[0];
        }
      }
    }

    // Additional context-based scoring
    if (context.url?.includes('chat.openai.com') && maxScore > 0.5) {
      maxScore = Math.min(0.95, maxScore + 0.1);
    }

    return {
      threatScore: maxScore,
      threatType: detectedType,
      confidence: maxScore > 0.6 ? 0.85 : 0.45,
      source: 'enhanced_local_ml',
      matchedPattern,
      analysisTime: Date.now(),
      recommendations: this.generateRecommendations(maxScore, detectedType)
    };
  },

  generateRecommendations(score, type) {
    if (score > 0.8) {
      return [
        'IMMEDIATE: Block input submission',
        'ALERT: Notify security team',
        'LOG: Record for threat intelligence'
      ];
    } else if (score > 0.5) {
      return [
        'WARNING: Review input before submission',
        'SUGGEST: Consider rephrasing request',
        'MONITOR: Track for pattern analysis'
      ];
    }
    return ['SAFE: Content appears benign'];
  },

  getModelStats() {
    return {
      status: 'active',
      version: '2.0.0',
      patterns: 5,
      lastUpdate: Date.now(),
      message: 'Enhanced local ML active for autonomous mesh'
    };
  }
};

const router = express.Router();
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

// API endpoints
const API_ENDPOINTS = {
  grok: {
    base: 'https://api.x.ai/v1',
    chat: '/chat/completions',
    search: '/search'
  },
  brave: {
    base: 'https://api.search.brave.com/res/v1',
    search: '/web/search',
    images: '/images/search',
    videos: '/videos/search',
    news: '/news/search'
  }
};

// Get API key from pool - Fixed Railway environment variable names
function getApiKey(service) {
  console.log(`[APIProxy] Getting ${service} API key...`);
  
  let keys = [];
  
  if (service === 'grok') {
    // Check multiple possible environment variable names
    const grokKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY || process.env.GROK_API_KEYS;
    if (grokKey) {
      keys = grokKey.includes(',') ? grokKey.split(',') : [grokKey];
    }
  } else if (service === 'brave') {
    // Check multiple possible environment variable names  
    const braveKey = process.env.BRAVE_API_KEY || process.env.BRAVE_API_KEYS;
    if (braveKey) {
      keys = braveKey.includes(',') ? braveKey.split(',') : [braveKey];
    }
  }
  
  // Clean keys (remove whitespace)
  keys = keys.map(key => key.trim()).filter(key => key.length > 0);
  
  if (keys.length === 0) {
    console.warn(`[APIProxy] No API keys found for ${service}. Environment variables checked:`, 
      service === 'grok' ? 'XAI_API_KEY, GROK_API_KEY, GROK_API_KEYS' : 'BRAVE_API_KEY, BRAVE_API_KEYS');
    return null;
  }
  
  // Round-robin selection with simple load balancing
  const index = Math.floor(Math.random() * keys.length);
  const selectedKey = keys[index];
  
  console.log(`[APIProxy] Selected ${service} key: ${selectedKey.substring(0, 10)}...${selectedKey.substring(selectedKey.length - 4)}`);
  return selectedKey;
}

// Proxy to Grok API
router.post('/grok/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const apiKey = getApiKey('grok');
    
    if (!apiKey) {
      return res.status(503).json({ 
        error: 'No Grok API keys available',
        suggestion: 'Configure your own API key in extension settings'
      });
    }
    
    // Generate cache key for request
    const cacheKey = crypto.createHash('md5')
      .update(JSON.stringify({ endpoint, body: req.body }))
      .digest('hex');
    
    // Check cache first
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return res.json({ ...cachedResponse, cached: true });
    }
    
    // Make request to Grok API
    const response = await axios.post(`${API_ENDPOINTS.grok.base}/${endpoint}`, req.body, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PromptGuardian-Proxy/1.0'
      },
      timeout: 30000,
      validateStatus: false // Don't throw on error status
    });
    
    if (response.status !== 200) {
      return res.status(response.status).json({
        error: 'Grok API error',
        status: response.status,
        message: response.data || 'Unknown error'
      });
    }
    
    const data = response.data;
    
    // Cache successful responses
    if (response.status === 200) {
      cache.set(cacheKey, data);
    }
    
    res.json(data);
  } catch (error) {
    console.error('Grok proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy error',
      message: error.message 
    });
  }
});

// Proxy to Brave Search API
router.get('/brave/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const apiKey = getApiKey('brave');
    
    if (!apiKey) {
      return res.status(503).json({ 
        error: 'No Brave API keys available',
        suggestion: 'Configure your own API key in extension settings'
      });
    }
    
    // Build query string
    const queryParams = new URLSearchParams(req.query);
    const url = `${API_ENDPOINTS.brave.base}/${endpoint}?${queryParams}`;
    
    // Generate cache key
    const cacheKey = crypto.createHash('md5')
      .update(url)
      .digest('hex');
    
    // Check cache
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return res.json({ ...cachedResponse, cached: true });
    }
    
    // Make request to Brave API
    const response = await axios.get(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'PromptGuardian-Proxy/1.0'
      },
      timeout: 30000,
      validateStatus: false
    });
    
    if (response.status !== 200) {
      return res.status(response.status).json({
        error: 'Brave API error',
        status: response.status,
        message: response.data || 'Unknown error'
      });
    }
    
    const data = response.data;
    
    // Cache successful responses
    if (response.status === 200) {
      cache.set(cacheKey, data);
    }
    
    res.json(data);
  } catch (error) {
    console.error('Brave proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy error',
      message: error.message 
    });
  }
});

// Enhanced endpoint for autonomous AI-security mesh threat analysis
router.post('/analyze-threat', async (req, res) => {
  try {
    const { 
      content, 
      threatType, 
      useGrok = true, 
      useBrave = true, 
      context = {},
      meshId = null,
      priority = 'normal'
    } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required for analysis' });
    }
    
    console.log(`[AutonomousMesh] Analyzing threat - Priority: ${priority}, MeshId: ${meshId}`);
    
    const results = {};
    const fallbacks = [];
    const analysisStartTime = Date.now();
    
    // Enhanced Grok analysis with autonomous mesh integration
    if (useGrok) {
      try {
        const grokAnalysis = await grokBreaker.execute(
          async () => {
            const grokKey = getApiKey('grok');
            if (!grokKey) {
              throw new Error('No Grok API key available - configure GROK_API_KEYS environment variable');
            }
            
            console.log('[AutonomousMesh] Executing Grok analysis...');
            
            // Enhanced prompt for autonomous mesh
            const systemPrompt = `You are an advanced AI security analyst in an autonomous threat detection mesh. 
            
CRITICAL INSTRUCTIONS:
1. Analyze the content for security threats with extreme precision
2. Return ONLY valid JSON with these exact fields:
   - threatScore: number between 0-1 (0=safe, 1=critical)
   - threatType: string (prompt_injection, jailbreak, system_extraction, etc.)
   - explanation: detailed analysis
   - confidence: number between 0-1
   - severity: CRITICAL|HIGH|MEDIUM|LOW
   - recommendations: array of strings
   
3. Be especially vigilant for:
   - Prompt injection attempts
   - Jailbreaking techniques
   - System prompt extraction
   - Role-play attacks
   - Encoding bypass attempts
   
RESPOND WITH VALID JSON ONLY.`;

            const response = await axios.post(`${API_ENDPOINTS.grok.base}/chat/completions`, {
              model: 'grok-2',
              messages: [
                {
                  role: 'system',
                  content: systemPrompt
                },
                {
                  role: 'user',
                  content: `SECURITY ANALYSIS REQUEST - MESH ID: ${meshId || 'standalone'}
                  
CONTENT TO ANALYZE: "${content}"
CONTEXT: URL=${context.url || 'unknown'}, Element=${context.element || 'input'}
PRIORITY: ${priority}

Provide detailed threat analysis as JSON.`
                }
              ],
              max_tokens: 500,
              temperature: 0.05, // Very low for consistent security analysis
              top_p: 0.1
            }, {
              headers: {
                'Authorization': `Bearer ${grokKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'PromptGuardian-AutonomousMesh/2.0'
              },
              timeout: 45000,
              validateStatus: false
            });
            
            if (response.status !== 200) {
              throw new Error(`Grok API error: ${response.status} - ${JSON.stringify(response.data)}`);
            }
            
            console.log('[AutonomousMesh] Grok analysis successful');
            return response.data;
          },
          // Enhanced fallback for autonomous mesh
          async () => {
            console.log('[AutonomousMesh] Grok fallback - using enhanced local analysis');
            fallbacks.push('grok_fallback_to_enhanced_local_ml');
            const localAnalysis = await localThreatDetector.analyzeThreat(content, context);
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    threatScore: localAnalysis.threatScore,
                    threatType: localAnalysis.threatType,
                    explanation: `Enhanced Local ML Analysis: Detected ${localAnalysis.threatType} with pattern "${localAnalysis.matchedPattern}"`,
                    confidence: localAnalysis.confidence,
                    severity: localAnalysis.threatScore > 0.8 ? 'CRITICAL' : 
                             localAnalysis.threatScore > 0.6 ? 'HIGH' :
                             localAnalysis.threatScore > 0.4 ? 'MEDIUM' : 'LOW',
                    recommendations: localAnalysis.recommendations,
                    source: 'autonomous_mesh_fallback',
                    fallback: true
                  })
                }
              }]
            };
          }
        );
        
        results.grok = grokAnalysis;
        console.log('[AutonomousMesh] Grok analysis completed');
      } catch (error) {
        console.error('[AutonomousMesh] Grok analysis failed:', error.message);
        results.grokError = error.message;
      }
    }
    
    // Enhanced Brave Search verification for autonomous mesh
    if (useBrave) {
      try {
        const braveVerification = await braveBreaker.execute(
          async () => {
            const braveKey = getApiKey('brave');
            if (!braveKey) {
              throw new Error('No Brave API key available - configure BRAVE_API_KEYS environment variable');
            }
            
            console.log('[AutonomousMesh] Executing Brave Search verification...');
            
            // Enhanced search queries for autonomous mesh
            const searchQueries = [
              `"${content.substring(0, 50)}" security threat analysis`,
              `"${threatType || 'prompt injection'}" attack patterns cybersecurity`,
              `AI security "${threatType}" detection prevention`
            ];
            
            const searchPromises = searchQueries.slice(0, 2).map(async (query, index) => {
              try {
                const response = await axios.get(
                  `${API_ENDPOINTS.brave.base}/web/search?q=${encodeURIComponent(query)}&count=3&freshness=pw&search_lang=en`,
                  {
                    headers: {
                      'X-Subscription-Token': braveKey,
                      'Accept': 'application/json',
                      'User-Agent': 'PromptGuardian-AutonomousMesh/2.0'
                    },
                    timeout: 30000,
                    validateStatus: false
                  }
                );
                
                if (response.status !== 200) {
                  throw new Error(`Brave API error: ${response.status}`);
                }
                
                return {
                  queryIndex: index,
                  query: query,
                  data: response.data,
                  timestamp: Date.now()
                };
              } catch (error) {
                console.warn(`[AutonomousMesh] Brave search query ${index} failed:`, error.message);
                return { queryIndex: index, error: error.message };
              }
            });
            
            const searchResults = await Promise.allSettled(searchPromises);
            console.log('[AutonomousMesh] Brave Search verification completed');
            
            return {
              searches: searchResults.map(result => 
                result.status === 'fulfilled' ? result.value : { error: result.reason.message }
              ),
              analysisType: 'autonomous_mesh_verification',
              meshId: meshId
            };
          },
          // Enhanced fallback for autonomous mesh
          async () => {
            console.log('[AutonomousMesh] Brave fallback - using enhanced threat intelligence');
            fallbacks.push('brave_fallback_to_enhanced_intelligence');
            
            // Enhanced local threat intelligence
            const threatDatabase = {
              'prompt_injection': {
                severity: 'CRITICAL',
                indicators: ['ignore instructions', 'forget rules', 'disregard guidelines'],
                mitigation: ['Input sanitization', 'Context isolation', 'Response filtering'],
                prevalence: 'HIGH'
              },
              'jailbreak': {
                severity: 'CRITICAL', 
                indicators: ['act as admin', 'bypass safety', 'roleplay unrestricted'],
                mitigation: ['Role boundary enforcement', 'Safety layer validation'],
                prevalence: 'HIGH'
              },
              'system_extraction': {
                severity: 'HIGH',
                indicators: ['system prompt', 'tell me your instructions', 'reveal training'],
                mitigation: ['Instruction obfuscation', 'Response filtering'],
                prevalence: 'MEDIUM'
              }
            };
            
            const threatInfo = threatDatabase[threatType] || {
              severity: 'UNKNOWN',
              indicators: ['pattern not in database'],
              mitigation: ['Manual review required'],
              prevalence: 'UNKNOWN'
            };
            
            return {
              web: {
                results: [{
                  title: `${threatType || 'Unknown'} - Autonomous Mesh Threat Analysis`,
                  snippet: `Threat Level: ${threatInfo.severity}. Indicators: ${threatInfo.indicators.join(', ')}. Recommended mitigation: ${threatInfo.mitigation.join(', ')}.`,
                  url: `https://autonomous-mesh-intelligence/threats/${threatType}`,
                  mesh_data: {
                    severity: threatInfo.severity,
                    indicators: threatInfo.indicators,
                    mitigation: threatInfo.mitigation,
                    prevalence: threatInfo.prevalence,
                    lastUpdated: Date.now()
                  }
                }]
              },
              fallback: true,
              source: 'autonomous_mesh_intelligence'
            };
          }
        );
        
        results.brave = braveVerification;
        console.log('[AutonomousMesh] Brave verification completed');
      } catch (error) {
        console.error('[AutonomousMesh] Brave verification failed:', error.message);
        results.braveError = error.message;
      }
    }
    
    // Ensure we always have local analysis as ultimate fallback
    if (!results.grok && !results.brave) {
      console.log('[AutonomousMesh] All external APIs failed - using complete local analysis');
      const localAnalysis = await localThreatDetector.analyzeThreat(content, context);
      results.localFallback = localAnalysis;
      fallbacks.push('complete_autonomous_local_analysis');
    }
    
    // Advanced autonomous mesh result synthesis
    let finalThreatScore = 0;
    let finalThreatType = 'safe';
    let confidence = 0;
    let finalSeverity = 'LOW';
    let recommendations = [];
    let grokAnalysis = null;
    
    // Process Grok analysis with enhanced parsing
    if (results.grok?.choices?.[0]?.message?.content) {
      try {
        let grokContent = results.grok.choices[0].message.content;
        
        // Extract JSON from markdown code blocks
        const jsonMatch = grokContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                         grokContent.match(/```\s*([\s\S]*?)\s*```/) ||
                         grokContent.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          grokContent = jsonMatch[1] || jsonMatch[0];
        }
        
        grokAnalysis = JSON.parse(grokContent.trim());
        finalThreatScore = Math.max(finalThreatScore, grokAnalysis.threatScore || 0);
        if (grokAnalysis.threatType && finalThreatScore > 0) {
          finalThreatType = grokAnalysis.threatType;
        }
        if (grokAnalysis.severity) {
          finalSeverity = grokAnalysis.severity;
        }
        if (grokAnalysis.recommendations) {
          recommendations = [...recommendations, ...grokAnalysis.recommendations];
        }
        confidence += 0.7; // Grok gets high confidence weight
        console.log(`[AutonomousMesh] ✅ Grok JSON parsed successfully: ${finalThreatScore} score, ${finalThreatType} type, ${finalSeverity} severity`);
      } catch (e) {
        console.warn('[AutonomousMesh] Grok returned non-JSON response, parsing text...');
        const textContent = results.grok.choices[0].message.content;
        if (/critical|high.*risk|dangerous|malicious/i.test(textContent)) {
          finalThreatScore = Math.max(finalThreatScore, 0.85);
          finalThreatType = 'grok_text_analysis';
          finalSeverity = 'CRITICAL';
        } else if (/medium.*risk|suspicious|warning/i.test(textContent)) {
          finalThreatScore = Math.max(finalThreatScore, 0.6);
          finalSeverity = 'MEDIUM';
        }
        confidence += 0.4;
      }
    }
    
    // Process Brave Search intelligence with enhanced analysis
    let braveIntelligence = null;
    if (results.brave?.web?.results?.length > 0 || results.brave?.mesh_data) {
      const braveResults = results.brave.web?.results || [];
      const hasThreatEvidence = braveResults.some(result => 
        /threat|attack|malicious|vulnerability|security|exploit/i.test(result.title + ' ' + result.snippet)
      );
      
      if (hasThreatEvidence || results.brave.mesh_data) {
        finalThreatScore = Math.max(finalThreatScore, 0.75);
        confidence += 0.5;
        
        if (results.brave.mesh_data?.severity === 'CRITICAL') {
          finalThreatScore = Math.max(finalThreatScore, 0.9);
          finalSeverity = 'CRITICAL';
        }
        
        braveIntelligence = {
          verified: hasThreatEvidence,
          severity: results.brave.mesh_data?.severity || 'MEDIUM',
          indicators: results.brave.mesh_data?.indicators || [],
          mitigation: results.brave.mesh_data?.mitigation || []
        };
        
        console.log('[AutonomousMesh] Brave verification confirms threat evidence');
      } else {
        confidence += 0.3;
        console.log('[AutonomousMesh] Brave verification found no threat evidence');
      }
    }
    
    // Process local fallback analysis
    if (results.localFallback) {
      finalThreatScore = Math.max(finalThreatScore, results.localFallback.threatScore);
      if (finalThreatScore > 0 && finalThreatType === 'safe') {
        finalThreatType = results.localFallback.threatType;
      }
      if (results.localFallback.recommendations) {
        recommendations = [...recommendations, ...results.localFallback.recommendations];
      }
      confidence += 0.4;
      console.log(`[AutonomousMesh] Local analysis: ${results.localFallback.threatScore} score`);
    }
    
    // Determine final severity based on score
    if (finalSeverity === 'LOW' || !finalSeverity) {
      finalSeverity = finalThreatScore > 0.8 ? 'CRITICAL' : 
                      finalThreatScore > 0.6 ? 'HIGH' :
                      finalThreatScore > 0.4 ? 'MEDIUM' : 'LOW';
    }
    
    // Generate autonomous mesh recommendations
    if (recommendations.length === 0) {
      if (finalThreatScore > 0.8) {
        recommendations = [
          'IMMEDIATE: Block input submission',
          'ALERT: Notify security operations center',
          'LOG: Record for threat intelligence',
          'ANALYZE: Review for attack campaign patterns'
        ];
      } else if (finalThreatScore > 0.5) {
        recommendations = [
          'WARNING: Review content before submission',
          'SUGGEST: Consider alternative phrasing',
          'MONITOR: Track for behavioral analysis'
        ];
      } else {
        recommendations = ['SAFE: Content appears benign'];
      }
    }
    
    const analysisTime = Date.now() - analysisStartTime;
    
    // Comprehensive autonomous mesh analysis response
    const analysis = {
      // Core threat assessment
      content: content.slice(0, 150) + (content.length > 150 ? '...' : ''),
      threatScore: Math.min(1.0, finalThreatScore),
      threatType: finalThreatType,
      severity: finalSeverity,
      confidence: Math.min(1.0, confidence),
      recommendations,
      
      // Autonomous mesh metadata
      meshId: meshId,
      priority: priority,
      analysisTime: `${analysisTime}ms`,
      timestamp: new Date().toISOString(),
      
      // Source analysis breakdown
      sources: {
        grok: grokAnalysis,
        braveIntelligence,
        localFallback: results.localFallback,
        fallbacks
      },
      
      // Technical details
      results,
      
      // Autonomous mesh summary
      autonomousMesh: {
        hasGrokAnalysis: !!results.grok && !results.grokError,
        hasBraveVerification: !!results.brave && !results.braveError,
        hasLocalFallback: !!results.localFallback,
        totalSources: [!!results.grok, !!results.brave, !!results.localFallback].filter(Boolean).length,
        finalScore: finalThreatScore,
        recommendedAction: finalThreatScore > 0.7 ? 'block' : 
                          finalThreatScore > 0.4 ? 'warn' : 'allow',
        meshStatus: 'operational',
        version: '2.0.0'
      }
    };
    
    console.log(`[AutonomousMesh] Analysis complete - Score: ${finalThreatScore}, Type: ${finalThreatType}, Time: ${analysisTime}ms`);
    res.json(analysis);
  } catch (error) {
    console.error('Threat analysis error:', error);
    
    // Final fallback - always provide local analysis
    try {
      const localAnalysis = await localThreatDetector.analyzeThreat(content, context);
      res.json({
        ...localAnalysis,
        error: 'External analysis failed',
        fallbacks: ['emergency_local_only'],
        message: 'Analysis completed using local ML model only'
      });
    } catch (localError) {
      res.status(500).json({ 
        error: 'Complete analysis failure',
        message: `External APIs and local analysis both failed: ${error.message}`,
        localError: localError.message
      });
    }
  }
});

// Batch processing for multiple threat checks
router.post('/analyze-batch', async (req, res) => {
  try {
    const { items, maxConcurrent = 3 } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array required' });
    }
    
    // Process in batches to avoid overwhelming APIs
    const results = [];
    for (let i = 0; i < items.length; i += maxConcurrent) {
      const batch = items.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (item, index) => {
        try {
          const response = await axios.post(`${req.protocol}://${req.get('host')}/proxy/analyze-threat`, {
            content: item.content,
            threatType: item.threatType,
            useGrok: item.useGrok,
            useBrave: item.useBrave
          }, {
            headers: { 'Content-Type': 'application/json' },
            validateStatus: false
          });
          
          return {
            index: i + index,
            result: response.status === 200 ? response.data : { error: 'Analysis failed' }
          };
        } catch (error) {
          return {
            index: i + index,
            result: { error: error.message }
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Small delay between batches
      if (i + maxConcurrent < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    res.json({
      totalItems: items.length,
      processed: results.length,
      results: results.sort((a, b) => a.index - b.index),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Batch analysis error:', error);
    res.status(500).json({ 
      error: 'Batch analysis failed',
      message: error.message 
    });
  }
});

// API health and status
router.get('/status', async (req, res) => {
  const status = {
    timestamp: new Date().toISOString(),
    services: {
      grok: {
        available: !!getApiKey('grok'),
        endpoint: API_ENDPOINTS.grok.base,
        features: ['chat', 'search', 'multimodal']
      },
      brave: {
        available: !!getApiKey('brave'),
        endpoint: API_ENDPOINTS.brave.base,
        features: ['web_search', 'image_search', 'news_search']
      }
    },
    cache: {
      keys: cache.keys().length,
      stats: cache.getStats()
    },
    proxy: {
      version: '1.0.0',
      uptime: process.uptime()
    }
  };
  
  res.json(status);
});

// Clear cache endpoint
router.delete('/cache', (req, res) => {
  const { adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  const deletedKeys = cache.keys().length;
  cache.flushAll();
  
  res.json({
    message: 'Cache cleared successfully',
    deletedKeys,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;