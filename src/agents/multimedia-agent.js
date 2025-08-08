/**
 * Multimedia Agent
 * Detects steganography and analyzes multimedia content for hidden threats
 */

import { BaseAgent } from './base-agent.js';

class MultimediaAgent extends BaseAgent {
  constructor(config = {}) {
    super('Multimedia', config);
    
    this.braveApiUrl = 'https://api.search.brave.com/res/v1';
    this.railwayApiUrl = 'https://promptgaurdian-production.up.railway.app';
    this.braveApiKey = null;
    this.analysisCache = new Map();
    this.steganographyPatterns = new Map();
    this.mediaQueue = [];
    this.isProcessingMedia = false;
    
    this.setupEventHandlers();
    this.initializeMultimedia();
  }

  setupEventHandlers() {
    this.on('scan_media', this.scanMedia.bind(this));
    this.on('scan_social_media', this.scanSocialMedia.bind(this));
    this.on('analyze_steganography', this.analyzeSteganography.bind(this));
    this.on('batch_media_scan', this.batchMediaScan.bind(this));
    this.on('update_stego_patterns', this.updateSteganographyPatterns.bind(this));
  }

  async initializeMultimedia() {
    await this.loadConfiguration();
    await this.loadSteganographyPatterns();
    this.startMediaProcessor();
    
    await this.broadcast('agent_ready', { 
      agentType: this.agentType,
      capabilities: ['steganography_detection', 'image_analysis', 'video_analysis', 'metadata_extraction']
    });
  }

  async loadConfiguration() {
    this.braveApiKey = await this.getStorageData('brave_api_key');
    this.multimediaConfig = await this.getStorageData('multimedia_config') || {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      supportedFormats: ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'mp4', 'avi', 'mov'],
      enableMetadataAnalysis: true,
      enablePixelAnalysis: true,
      enableFrequencyAnalysis: false, // CPU intensive
      cacheTtl: 1800000, // 30 minutes
      maxConcurrentAnalyses: 3
    };
  }

  async loadSteganographyPatterns() {
    // Load known steganography patterns and signatures
    const defaultPatterns = {
      'lsb_patterns': {
        name: 'Least Significant Bit Patterns',
        description: 'Common LSB steganography signatures',
        patterns: [
          'regular_lsb_distribution',
          'unusual_noise_patterns',
          'non_random_bit_sequences'
        ],
        confidence: 0.7
      },
      'metadata_anomalies': {
        name: 'Metadata Anomalies',
        description: 'Suspicious metadata patterns',
        patterns: [
          'unusual_software_signatures',
          'modified_timestamps',
          'suspicious_comments',
          'non_standard_fields'
        ],
        confidence: 0.6
      },
      'frequency_domain': {
        name: 'Frequency Domain Anomalies',
        description: 'DCT coefficient modifications',
        patterns: [
          'jpeg_dct_modifications',
          'unusual_compression_artifacts',
          'quantization_anomalies'
        ],
        confidence: 0.8
      },
      'file_structure': {
        name: 'File Structure Anomalies',
        description: 'Unusual file structure patterns',
        patterns: [
          'appended_data',
          'modified_headers',
          'unusual_file_sizes',
          'padding_anomalies'
        ],
        confidence: 0.5
      }
    };
    
    for (const [id, pattern] of Object.entries(defaultPatterns)) {
      this.steganographyPatterns.set(id, pattern);
    }
  }

  async scanMedia(payload) {
    const { content, type, priority = 'normal' } = payload;
    
    try {
      // Add to processing queue
      const mediaRequest = {
        id: crypto.randomUUID(),
        content,
        type,
        priority,
        timestamp: Date.now(),
        source: 'prompt_media'
      };
      
      this.addMediaToQueue(mediaRequest);
      
    } catch (error) {
      console.error('[Multimedia] Error scanning media:', error);
      await this.broadcast('media_scan_error', {
        error: error.message,
        type
      });
    }
  }

  async scanSocialMedia(payload) {
    const { mediaUrls, postContext } = payload;
    
    try {
      for (const [index, mediaUrl] of mediaUrls.entries()) {
        const mediaRequest = {
          id: crypto.randomUUID(),
          mediaUrl,
          postContext,
          type: 'social_media',
          priority: this.determinePriority(mediaUrl, postContext),
          timestamp: Date.now(),
          source: 'social_media',
          index
        };
        
        this.addMediaToQueue(mediaRequest);
        
        // Small delay between queuing social media items
        if (index < mediaUrls.length - 1) {
          await this.sleep(50);
        }
      }
      
    } catch (error) {
      console.error('[Multimedia] Error scanning social media:', error);
      await this.broadcast('social_media_scan_error', {
        error: error.message,
        mediaUrls: mediaUrls.length
      });
    }
  }

  addMediaToQueue(mediaRequest) {
    // Priority queue: high priority items go first
    if (mediaRequest.priority === 'high') {
      this.mediaQueue.unshift(mediaRequest);
    } else {
      this.mediaQueue.push(mediaRequest);
    }
  }

  startMediaProcessor() {
    // Process media queue periodically
    setInterval(async () => {
      if (this.mediaQueue.length > 0 && !this.isProcessingMedia) {
        await this.processMediaQueue();
      }
    }, 500);
  }

  async processMediaQueue() {
    if (this.isProcessingMedia || this.mediaQueue.length === 0) {
      return;
    }
    
    this.isProcessingMedia = true;
    
    try {
      // Process up to maxConcurrentAnalyses items
      const batch = this.mediaQueue.splice(0, this.multimediaConfig.maxConcurrentAnalyses);
      
      const analysisPromises = batch.map(mediaRequest => 
        this.processMediaRequest(mediaRequest)
      );
      
      await Promise.all(analysisPromises);
      
    } catch (error) {
      console.error('[Multimedia] Queue processing error:', error);
    } finally {
      this.isProcessingMedia = false;
    }
  }

  async processMediaRequest(mediaRequest) {
    try {
      let analysisResult;
      
      if (mediaRequest.source === 'prompt_media') {
        analysisResult = await this.analyzePromptMedia(mediaRequest);
      } else if (mediaRequest.source === 'social_media') {
        analysisResult = await this.analyzeSocialMediaItem(mediaRequest);
      }
      
      // Cache result
      const cacheKey = this.generateCacheKey(mediaRequest);
      this.analysisCache.set(cacheKey, {
        result: analysisResult,
        timestamp: Date.now()
      });
      
      // Broadcast result
      await this.broadcast('media_analysis_complete', {
        requestId: mediaRequest.id,
        source: mediaRequest.source,
        ...analysisResult
      });
      
    } catch (error) {
      console.error('[Multimedia] Media processing error:', error);
      await this.broadcast('media_analysis_error', {
        requestId: mediaRequest.id,
        error: error.message
      });
    }
  }

  async analyzePromptMedia(mediaRequest) {
    const { content, type } = mediaRequest;
    
    // Check if content refers to media files or contains media data
    const mediaAnalysis = {
      hasMediaReferences: false,
      mediaTypes: [],
      suspiciousPatterns: [],
      steganographyRisk: 0,
      recommendations: []
    };
    
    // Analyze text for media references
    const mediaPatterns = {
      'image_refs': /\.(jpg|jpeg|png|bmp|gif|webp)/gi,
      'video_refs': /\.(mp4|avi|mov|wmv|flv)/gi,
      'base64_data': /data:image\/[^;]+;base64,/gi,
      'steganography_terms': /(hidden|secret|encoded|steganography|lsb|embed)/gi,
      'suspicious_domains': /(temp|anonymous|hidden|secret|covert)/gi
    };
    
    for (const [patternType, regex] of Object.entries(mediaPatterns)) {
      const matches = content.match(regex);
      if (matches) {
        mediaAnalysis.hasMediaReferences = true;
        mediaAnalysis.suspiciousPatterns.push({
          type: patternType,
          matches: matches.length,
          samples: matches.slice(0, 3)
        });
        
        // Calculate risk based on pattern type
        if (patternType === 'steganography_terms') {
          mediaAnalysis.steganographyRisk += 0.6;
        } else if (patternType === 'base64_data') {
          mediaAnalysis.steganographyRisk += 0.4;
        } else if (patternType === 'suspicious_domains') {
          mediaAnalysis.steganographyRisk += 0.3;
        } else {
          mediaAnalysis.steganographyRisk += 0.1;
        }
      }
    }
    
    // If media references found, perform deeper analysis
    if (mediaAnalysis.hasMediaReferences) {
      const deepAnalysis = await this.performDeepMediaAnalysis(content, mediaAnalysis);
      Object.assign(mediaAnalysis, deepAnalysis);
    }
    
    // Generate recommendations
    mediaAnalysis.recommendations = this.generateMediaRecommendations(mediaAnalysis);
    
    return mediaAnalysis;
  }

  async analyzeSocialMediaItem(mediaRequest) {
    const { mediaUrl, postContext } = mediaRequest;
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(mediaRequest);
      const cached = this.analysisCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.multimediaConfig.cacheTtl) {
        return cached.result;
      }
      
      const analysis = {
        mediaUrl,
        fileType: this.extractFileType(mediaUrl),
        analysisType: 'social_media',
        steganographyRisk: 0,
        anomalies: [],
        verificationStatus: 'unknown',
        recommendations: []
      };
      
      // Analyze URL patterns
      analysis.urlAnalysis = this.analyzeMediaUrl(mediaUrl);
      analysis.steganographyRisk += analysis.urlAnalysis.riskScore;
      
      // Cross-reference with known steganography databases
      const crossReference = await this.crossReferenceMedia(mediaUrl, postContext);
      analysis.steganographyRisk += crossReference.riskScore;
      analysis.verificationStatus = crossReference.verificationStatus;
      
      // Metadata analysis if possible (limited by CORS/privacy)
      if (this.multimediaConfig.enableMetadataAnalysis) {
        const metadataAnalysis = await this.analyzeMediaMetadata(mediaUrl);
        if (metadataAnalysis.success) {
          analysis.metadata = metadataAnalysis;
          analysis.steganographyRisk += metadataAnalysis.riskScore;
          analysis.anomalies.push(...metadataAnalysis.anomalies);
        }
      }
      
      // Content-based analysis via reverse image search
      const contentAnalysis = await this.performContentAnalysis(mediaUrl);
      analysis.contentAnalysis = contentAnalysis;
      analysis.steganographyRisk += contentAnalysis.riskScore;
      
      // Final risk assessment
      analysis.steganographyRisk = Math.min(analysis.steganographyRisk, 1);
      analysis.riskLevel = this.categorizeRisk(analysis.steganographyRisk);
      analysis.recommendations = this.generateSocialMediaRecommendations(analysis);
      
      return analysis;
      
    } catch (error) {
      console.error('[Multimedia] Social media analysis error:', error);
      return {
        mediaUrl,
        error: error.message,
        steganographyRisk: 0.1, // Default low risk on error
        riskLevel: 'unknown',
        recommendations: ['analysis_failed_exercise_caution']
      };
    }
  }

  analyzeMediaUrl(mediaUrl) {
    const analysis = {
      url: mediaUrl,
      riskScore: 0,
      anomalies: [],
      indicators: []
    };
    
    // Check for suspicious URL patterns
    const suspiciousPatterns = [
      { pattern: /temp|tmp|anonymous|hidden/i, risk: 0.4, indicator: 'suspicious_keywords' },
      { pattern: /[0-9]{10,}/i, risk: 0.2, indicator: 'numeric_filename' },
      { pattern: /[a-f0-9]{32,}/i, risk: 0.3, indicator: 'hash_like_filename' },
      { pattern: /\.onion/i, risk: 0.8, indicator: 'darkweb_domain' },
      { pattern: /bit\.ly|tinyurl|t\.co/i, risk: 0.3, indicator: 'url_shortener' }
    ];
    
    for (const { pattern, risk, indicator } of suspiciousPatterns) {
      if (pattern.test(mediaUrl)) {
        analysis.riskScore += risk;
        analysis.anomalies.push(`URL contains ${indicator.replace('_', ' ')}`);
        analysis.indicators.push(indicator);
      }
    }
    
    // Check file extension
    const fileType = this.extractFileType(mediaUrl);
    if (['png', 'bmp'].includes(fileType)) {
      analysis.riskScore += 0.1; // PNG/BMP better for steganography
      analysis.indicators.push('steganography_friendly_format');
    }
    
    return analysis;
  }

  async crossReferenceMedia(mediaUrl, postContext) {
    try {
      // Search for the image URL in security databases and threat intelligence
      const searchQueries = [
        `"${mediaUrl}" steganography malicious`,
        `"${mediaUrl}" hidden message covert`,
        `"${mediaUrl}" suspicious reported`
      ];
      
      let totalRisk = 0;
      let verificationStatus = 'unknown';
      const findings = [];
      
      for (const query of searchQueries) {
        try {
          const searchResults = await this.searchForMediaIntelligence(query);
          
          if (searchResults.relevantResults > 0) {
            totalRisk += 0.3;
            findings.push(...searchResults.findings);
            
            if (searchResults.threatReports > 0) {
              verificationStatus = 'reported_malicious';
              totalRisk += 0.4;
            }
          }
        } catch (error) {
          console.warn('[Multimedia] Cross-reference search failed:', error.message);
        }
        
        // Small delay between searches
        await this.sleep(100);
      }
      
      return {
        riskScore: Math.min(totalRisk, 1),
        verificationStatus,
        findings,
        queriesChecked: searchQueries.length
      };
      
    } catch (error) {
      console.warn('[Multimedia] Cross-reference failed:', error.message);
      return {
        riskScore: 0,
        verificationStatus: 'unknown',
        findings: [],
        error: error.message
      };
    }
  }

  async searchForMediaIntelligence(query) {
    try {
      let searchResults;
      
      if (this.braveApiKey) {
        searchResults = await this.makeBraveApiCall('/web/search', {
          q: query,
          count: 5
        });
      } else {
        searchResults = await this.makeRailwayProxyCall('brave/web/search', {
          params: { q: query, count: 5 }
        });
      }
      
      return this.processIntelligenceResults(searchResults);
      
    } catch (error) {
      return {
        relevantResults: 0,
        threatReports: 0,
        findings: []
      };
    }
  }

  processIntelligenceResults(searchResults) {
    const analysis = {
      relevantResults: 0,
      threatReports: 0,
      findings: []
    };
    
    if (!searchResults.web?.results) {
      return analysis;
    }
    
    for (const result of searchResults.web.results) {
      const content = `${result.title} ${result.description}`.toLowerCase();
      
      // Check for threat indicators
      const threatKeywords = ['malicious', 'steganography', 'hidden', 'covert', 'suspicious', 'threat'];
      const reportKeywords = ['reported', 'warning', 'alert', 'detected'];
      
      let isRelevant = false;
      let isThreatReport = false;
      
      for (const keyword of threatKeywords) {
        if (content.includes(keyword)) {
          isRelevant = true;
          analysis.findings.push({
            source: result.url,
            indicator: keyword,
            context: result.description?.slice(0, 100)
          });
        }
      }
      
      for (const keyword of reportKeywords) {
        if (content.includes(keyword)) {
          isThreatReport = true;
        }
      }
      
      if (isRelevant) {
        analysis.relevantResults++;
      }
      
      if (isThreatReport) {
        analysis.threatReports++;
      }
    }
    
    return analysis;
  }

  async analyzeMediaMetadata(mediaUrl) {
    // Note: This is limited by CORS policies and privacy restrictions
    // In a real implementation, this would require server-side processing
    
    try {
      // Attempt to fetch minimal metadata through various techniques
      const response = await fetch(mediaUrl, { 
        method: 'HEAD',
        mode: 'cors'
      });
      
      const analysis = {
        success: true,
        riskScore: 0,
        anomalies: [],
        headers: {}
      };
      
      // Analyze HTTP headers
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const lastModified = response.headers.get('last-modified');
      
      analysis.headers = {
        contentType,
        contentLength: contentLength ? parseInt(contentLength) : null,
        lastModified
      };
      
      // Check for anomalies
      if (contentLength && parseInt(contentLength) > this.multimediaConfig.maxFileSize) {
        analysis.anomalies.push('unusually_large_file');
        analysis.riskScore += 0.2;
      }
      
      if (contentType && !contentType.startsWith('image/') && !contentType.startsWith('video/')) {
        analysis.anomalies.push('unexpected_content_type');
        analysis.riskScore += 0.3;
      }
      
      return analysis;
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        riskScore: 0,
        anomalies: []
      };
    }
  }

  async performContentAnalysis(mediaUrl) {
    try {
      // Use Brave's image search to find similar or related images
      const imageSearchQuery = `imageurl:${mediaUrl}`;
      
      let searchResults;
      
      if (this.braveApiKey) {
        searchResults = await this.makeBraveApiCall('/images/search', {
          q: imageSearchQuery,
          count: 5
        });
      } else {
        searchResults = await this.makeRailwayProxyCall('brave/images/search', {
          params: { q: imageSearchQuery, count: 5 }
        });
      }
      
      const analysis = {
        riskScore: 0,
        similarImages: 0,
        contexts: [],
        indicators: []
      };
      
      if (searchResults.images?.results) {
        analysis.similarImages = searchResults.images.results.length;
        
        // Analyze contexts where similar images appear
        for (const imageResult of searchResults.images.results) {
          if (imageResult.page && imageResult.page.title) {
            const context = imageResult.page.title.toLowerCase();
            
            // Check for suspicious contexts
            const suspiciousContexts = ['steganography', 'hidden', 'secret', 'covert', 'anonymous'];
            
            for (const suspicious of suspiciousContexts) {
              if (context.includes(suspicious)) {
                analysis.riskScore += 0.2;
                analysis.contexts.push(context);
                analysis.indicators.push(`found_in_${suspicious}_context`);
              }
            }
          }
        }
      }
      
      // No similar images might indicate unique/generated content
      if (analysis.similarImages === 0) {
        analysis.riskScore += 0.1;
        analysis.indicators.push('unique_content');
      }
      
      return analysis;
      
    } catch (error) {
      return {
        riskScore: 0,
        error: error.message,
        similarImages: 0,
        contexts: [],
        indicators: []
      };
    }
  }

  async performDeepMediaAnalysis(content, initialAnalysis) {
    const deepAnalysis = {
      textualPatterns: [],
      encodingPatterns: [],
      contextualRisk: 0
    };
    
    // Analyze for steganography-related terminology
    const steganographyTerms = [
      { term: /least.significant.bit|lsb/gi, risk: 0.8, type: 'technique' },
      { term: /discrete.cosine.transform|dct/gi, risk: 0.7, type: 'technique' },
      { term: /frequency.domain/gi, risk: 0.6, type: 'technique' },
      { term: /pixel.manipulation/gi, risk: 0.7, type: 'technique' },
      { term: /metadata.injection/gi, risk: 0.6, type: 'technique' },
      { term: /cover.image|host.image/gi, risk: 0.8, type: 'terminology' },
      { term: /payload|secret.message/gi, risk: 0.7, type: 'terminology' },
      { term: /stego.key|extraction.key/gi, risk: 0.9, type: 'terminology' }
    ];
    
    for (const { term, risk, type } of steganographyTerms) {
      const matches = content.match(term);
      if (matches) {
        deepAnalysis.textualPatterns.push({
          term: term.source,
          matches: matches.length,
          type,
          risk
        });
        deepAnalysis.contextualRisk += risk * Math.min(matches.length / 10, 1);
      }
    }
    
    // Look for encoding patterns
    const encodingPatterns = [
      { pattern: /[A-Za-z0-9+/]{20,}={0,2}/g, type: 'base64_like', risk: 0.4 },
      { pattern: /\\x[0-9a-fA-F]{2}/g, type: 'hex_escape', risk: 0.5 },
      { pattern: /[01]{50,}/g, type: 'binary_sequence', risk: 0.6 },
      { pattern: /[0-9A-Fa-f]{32,}/g, type: 'hex_sequence', risk: 0.3 }
    ];
    
    for (const { pattern, type, risk } of encodingPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        deepAnalysis.encodingPatterns.push({
          type,
          matches: matches.length,
          samples: matches.slice(0, 2),
          risk
        });
        deepAnalysis.contextualRisk += risk * Math.min(matches.length / 5, 1);
      }
    }
    
    return deepAnalysis;
  }

  async analyzeSteganography(payload) {
    const { mediaData, analysisType = 'comprehensive' } = payload;
    
    try {
      const stegoAnalysis = {
        analysisType,
        overallRisk: 0,
        detectedTechniques: [],
        confidence: 0,
        recommendations: []
      };
      
      // Apply different analysis techniques based on type
      if (analysisType === 'comprehensive') {
        stegoAnalysis.lsbAnalysis = await this.performLSBAnalysis(mediaData);
        stegoAnalysis.frequencyAnalysis = await this.performFrequencyAnalysis(mediaData);
        stegoAnalysis.metadataAnalysis = await this.performMetadataAnalysis(mediaData);
        stegoAnalysis.structuralAnalysis = await this.performStructuralAnalysis(mediaData);
      } else if (analysisType === 'quick') {
        stegoAnalysis.lsbAnalysis = await this.performLSBAnalysis(mediaData);
        stegoAnalysis.metadataAnalysis = await this.performMetadataAnalysis(mediaData);
      }
      
      // Aggregate results
      stegoAnalysis.overallRisk = this.aggregateSteganographyRisk(stegoAnalysis);
      stegoAnalysis.confidence = this.calculateConfidence(stegoAnalysis);
      stegoAnalysis.recommendations = this.generateSteganographyRecommendations(stegoAnalysis);
      
      await this.broadcast('steganography_analysis_complete', {
        overallRisk: stegoAnalysis.overallRisk,
        confidence: stegoAnalysis.confidence,
        techniquesDetected: stegoAnalysis.detectedTechniques.length,
        analysisType
      });
      
      return stegoAnalysis;
      
    } catch (error) {
      console.error('[Multimedia] Steganography analysis error:', error);
      await this.broadcast('steganography_analysis_error', {
        error: error.message,
        analysisType
      });
      throw error;
    }
  }

  async performLSBAnalysis(mediaData) {
    // Simplified LSB analysis - in production would use image processing libraries
    const analysis = {
      technique: 'lsb',
      riskScore: 0,
      anomalies: [],
      patterns: []
    };
    
    // Heuristic analysis based on data patterns
    if (mediaData.length > 1000) {
      // Check for repeating patterns that might indicate LSB embedding
      const chunks = [];
      for (let i = 0; i < Math.min(mediaData.length, 10000); i += 100) {
        chunks.push(mediaData.slice(i, i + 100));
      }
      
      // Simple entropy check
      const uniqueBytes = new Set(chunks.flat()).size;
      const expectedEntropy = chunks.flat().length * 0.8; // Expected for natural images
      
      if (uniqueBytes < expectedEntropy) {
        analysis.riskScore += 0.3;
        analysis.anomalies.push('low_entropy_detected');
      }
      
      // Check for regular patterns
      const regularityScore = this.checkForRegularPatterns(chunks);
      if (regularityScore > 0.5) {
        analysis.riskScore += 0.4;
        analysis.anomalies.push('regular_patterns_detected');
      }
    }
    
    return analysis;
  }

  checkForRegularPatterns(chunks) {
    // Simplified pattern detection
    let regularityScore = 0;
    
    for (let i = 1; i < chunks.length; i++) {
      const similarity = this.calculateChunkSimilarity(chunks[i-1], chunks[i]);
      regularityScore += similarity;
    }
    
    return regularityScore / Math.max(chunks.length - 1, 1);
  }

  calculateChunkSimilarity(chunk1, chunk2) {
    if (!chunk1 || !chunk2 || chunk1.length !== chunk2.length) return 0;
    
    let matches = 0;
    for (let i = 0; i < chunk1.length; i++) {
      if (Math.abs(chunk1[i] - chunk2[i]) <= 1) { // Allow for small differences
        matches++;
      }
    }
    
    return matches / chunk1.length;
  }

  async performFrequencyAnalysis(mediaData) {
    // Simplified frequency domain analysis
    const analysis = {
      technique: 'frequency_domain',
      riskScore: 0,
      anomalies: [],
      patterns: []
    };
    
    if (this.multimediaConfig.enableFrequencyAnalysis) {
      // This would typically involve DCT analysis for JPEG files
      // Simplified heuristic for demonstration
      
      const frequencyBins = new Array(256).fill(0);
      for (const byte of mediaData.slice(0, 10000)) {
        frequencyBins[byte]++;
      }
      
      // Check for unusual frequency distribution
      const maxFreq = Math.max(...frequencyBins);
      const avgFreq = frequencyBins.reduce((sum, freq) => sum + freq, 0) / 256;
      
      if (maxFreq > avgFreq * 10) {
        analysis.riskScore += 0.2;
        analysis.anomalies.push('unusual_frequency_distribution');
      }
    }
    
    return analysis;
  }

  async performMetadataAnalysis(mediaData) {
    // Simplified metadata analysis
    const analysis = {
      technique: 'metadata',
      riskScore: 0,
      anomalies: [],
      suspiciousFields: []
    };
    
    // Look for common metadata signatures at the beginning of files
    const header = mediaData.slice(0, 1000);
    const headerString = String.fromCharCode(...header);
    
    // Check for suspicious metadata patterns
    const suspiciousPatterns = [
      { pattern: /steghide/i, risk: 0.8, field: 'steghide_signature' },
      { pattern: /outguess/i, risk: 0.8, field: 'outguess_signature' },
      { pattern: /jsteg/i, risk: 0.7, field: 'jsteg_signature' },
      { pattern: /secret/i, risk: 0.4, field: 'secret_reference' },
      { pattern: /hidden/i, risk: 0.3, field: 'hidden_reference' }
    ];
    
    for (const { pattern, risk, field } of suspiciousPatterns) {
      if (pattern.test(headerString)) {
        analysis.riskScore += risk;
        analysis.suspiciousFields.push(field);
        analysis.anomalies.push(`${field}_detected`);
      }
    }
    
    return analysis;
  }

  async performStructuralAnalysis(mediaData) {
    const analysis = {
      technique: 'structural',
      riskScore: 0,
      anomalies: [],
      structuralIssues: []
    };
    
    // Check file size vs expected structure
    if (mediaData.length > 0) {
      // Look for appended data (common steganography technique)
      const lastBytes = mediaData.slice(-1000);
      const nullBytes = lastBytes.filter(byte => byte === 0).length;
      
      if (nullBytes < lastBytes.length * 0.8) {
        // Fewer null bytes than expected at end of file
        analysis.riskScore += 0.3;
        analysis.anomalies.push('potential_appended_data');
      }
      
      // Check for unusual padding patterns
      const paddingAnalysis = this.analyzePaddingPatterns(mediaData);
      analysis.riskScore += paddingAnalysis.riskScore;
      analysis.anomalies.push(...paddingAnalysis.anomalies);
    }
    
    return analysis;
  }

  analyzePaddingPatterns(mediaData) {
    const analysis = {
      riskScore: 0,
      anomalies: []
    };
    
    // Check last 500 bytes for unusual patterns
    const endSection = mediaData.slice(-500);
    
    // Calculate entropy of ending section
    const byteFreq = new Array(256).fill(0);
    endSection.forEach(byte => byteFreq[byte]++);
    
    let entropy = 0;
    for (const freq of byteFreq) {
      if (freq > 0) {
        const p = freq / endSection.length;
        entropy -= p * Math.log2(p);
      }
    }
    
    // High entropy in padding area is suspicious
    if (entropy > 6) {
      analysis.riskScore += 0.3;
      analysis.anomalies.push('high_entropy_padding');
    }
    
    return analysis;
  }

  aggregateSteganographyRisk(stegoAnalysis) {
    let totalRisk = 0;
    const techniques = ['lsbAnalysis', 'frequencyAnalysis', 'metadataAnalysis', 'structuralAnalysis'];
    
    for (const technique of techniques) {
      if (stegoAnalysis[technique]) {
        totalRisk += stegoAnalysis[technique].riskScore;
        
        if (stegoAnalysis[technique].anomalies.length > 0) {
          stegoAnalysis.detectedTechniques.push(technique);
        }
      }
    }
    
    return Math.min(totalRisk, 1);
  }

  calculateConfidence(stegoAnalysis) {
    let confidence = 0;
    
    // Higher confidence with more techniques showing consistent results
    const techniqueCount = stegoAnalysis.detectedTechniques.length;
    confidence += techniqueCount * 0.2;
    
    // Higher confidence with multiple anomalies
    const totalAnomalies = stegoAnalysis.detectedTechniques.reduce((total, technique) => {
      return total + (stegoAnalysis[technique]?.anomalies?.length || 0);
    }, 0);
    
    confidence += Math.min(totalAnomalies * 0.1, 0.5);
    
    return Math.min(confidence, 1);
  }

  extractFileType(url) {
    const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    return match ? match[1].toLowerCase() : 'unknown';
  }

  determinePriority(mediaUrl, postContext) {
    // Determine priority based on various factors
    if (postContext?.links?.length > 2) return 'high';
    if (mediaUrl.includes('temp') || mediaUrl.includes('anonymous')) return 'high';
    if (postContext?.text?.toLowerCase().includes('secret')) return 'high';
    return 'normal';
  }

  categorizeRisk(riskScore) {
    if (riskScore >= 0.8) return 'critical';
    if (riskScore >= 0.6) return 'high';
    if (riskScore >= 0.4) return 'medium';
    if (riskScore >= 0.2) return 'low';
    return 'minimal';
  }

  generateMediaRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.steganographyRisk > 0.7) {
      recommendations.push('HIGH_STEGANOGRAPHY_RISK');
      recommendations.push('AVOID_PROCESSING_MEDIA');
      recommendations.push('CONSIDER_PROFESSIONAL_ANALYSIS');
    } else if (analysis.steganographyRisk > 0.4) {
      recommendations.push('MODERATE_STEGANOGRAPHY_RISK');
      recommendations.push('EXERCISE_CAUTION');
      recommendations.push('SCAN_WITH_ADDITIONAL_TOOLS');
    } else if (analysis.steganographyRisk > 0.2) {
      recommendations.push('LOW_STEGANOGRAPHY_RISK');
      recommendations.push('MONITOR_FOR_UNUSUAL_BEHAVIOR');
    }
    
    if (analysis.hasMediaReferences) {
      recommendations.push('MEDIA_REFERENCES_DETECTED');
    }
    
    for (const pattern of analysis.suspiciousPatterns || []) {
      if (pattern.type === 'steganography_terms') {
        recommendations.push('STEGANOGRAPHY_TERMINOLOGY_DETECTED');
      }
    }
    
    return recommendations;
  }

  generateSocialMediaRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.riskLevel === 'critical' || analysis.riskLevel === 'high') {
      recommendations.push('HIGH_RISK_MEDIA_DETECTED');
      recommendations.push('AVOID_DOWNLOADING_OR_SHARING');
      recommendations.push('CONSIDER_REPORTING_POST');
    } else if (analysis.riskLevel === 'medium') {
      recommendations.push('MODERATE_RISK_MEDIA');
      recommendations.push('EXERCISE_CAUTION');
      recommendations.push('VERIFY_SOURCE_CREDIBILITY');
    }
    
    if (analysis.verificationStatus === 'reported_malicious') {
      recommendations.push('MEDIA_REPORTED_AS_MALICIOUS');
      recommendations.push('DO_NOT_INTERACT');
    }
    
    if (analysis.urlAnalysis?.indicators?.includes('url_shortener')) {
      recommendations.push('URL_SHORTENER_DETECTED');
      recommendations.push('VERIFY_ACTUAL_DESTINATION');
    }
    
    return recommendations;
  }

  generateSteganographyRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.confidence > 0.8 && analysis.overallRisk > 0.7) {
      recommendations.push('HIGH_CONFIDENCE_STEGANOGRAPHY_DETECTED');
      recommendations.push('ISOLATE_FILE_IMMEDIATELY');
      recommendations.push('PERFORM_FORENSIC_ANALYSIS');
    } else if (analysis.confidence > 0.5 && analysis.overallRisk > 0.4) {
      recommendations.push('POSSIBLE_STEGANOGRAPHY_DETECTED');
      recommendations.push('ADDITIONAL_ANALYSIS_REQUIRED');
      recommendations.push('HANDLE_WITH_CAUTION');
    } else if (analysis.overallRisk > 0.2) {
      recommendations.push('LOW_PROBABILITY_STEGANOGRAPHY');
      recommendations.push('MONITOR_FOR_CONTEXT');
    }
    
    for (const technique of analysis.detectedTechniques) {
      recommendations.push(`${technique.toUpperCase()}_ANOMALIES_DETECTED`);
    }
    
    return recommendations;
  }

  async makeBraveApiCall(endpoint, params) {
    const url = new URL(this.braveApiUrl + endpoint);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value);
      }
    });
    
    return await this.withRetry(() =>
      this.makeAPICall(url.toString(), {
        headers: {
          'X-Subscription-Token': this.braveApiKey,
          'Accept': 'application/json'
        }
      })
    );
  }

  async makeRailwayProxyCall(endpoint, data) {
    return await this.makeAPICall(`${this.railwayApiUrl}/proxy/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  async batchMediaScan(payload) {
    const { mediaItems, analysisType = 'quick' } = payload;
    const results = [];
    
    try {
      for (const [index, mediaItem] of mediaItems.entries()) {
        const mediaRequest = {
          id: crypto.randomUUID(),
          ...mediaItem,
          analysisType,
          priority: 'normal',
          timestamp: Date.now(),
          source: 'batch_scan',
          index
        };
        
        const result = await this.processMediaRequest(mediaRequest);
        results.push(result);
        
        // Small delay between batch items
        if (index < mediaItems.length - 1) {
          await this.sleep(100);
        }
      }
      
      await this.broadcast('batch_media_scan_complete', {
        totalItems: mediaItems.length,
        processed: results.length,
        highRiskItems: results.filter(r => r.steganographyRisk > 0.6).length
      });
      
      return results;
      
    } catch (error) {
      console.error('[Multimedia] Batch scan error:', error);
      throw error;
    }
  }

  async updateSteganographyPatterns(payload) {
    const { patterns, source, confidence } = payload;
    
    try {
      // Update local patterns database
      for (const pattern of patterns) {
        this.steganographyPatterns.set(pattern.id, {
          ...pattern,
          source,
          confidence,
          timestamp: Date.now()
        });
      }
      
      await this.broadcast('steganography_patterns_updated', {
        patternsUpdated: patterns.length,
        source,
        totalPatterns: this.steganographyPatterns.size
      });
      
    } catch (error) {
      console.error('[Multimedia] Pattern update error:', error);
      throw error;
    }
  }

  generateCacheKey(mediaRequest) {
    const keyData = mediaRequest.mediaUrl || mediaRequest.content?.slice(0, 100) || mediaRequest.id;
    return btoa(keyData).slice(0, 32);
  }

  async process(input) {
    const { type, mediaData, mediaUrl, analysisType } = input;
    
    switch (type) {
      case 'scan_media':
        return await this.scanMedia({ content: mediaData, type: analysisType });
      case 'analyze_steganography':
        return await this.analyzeSteganography({ mediaData, analysisType });
      case 'analyze_url':
        return this.analyzeMediaUrl(mediaUrl);
      default:
        return { error: 'Unknown multimedia operation' };
    }
  }

  async analyze(data) {
    if (data.mediaUrl) {
      return await this.analyzeSocialMediaItem({
        mediaUrl: data.mediaUrl,
        postContext: data.context
      });
    } else if (data.mediaData) {
      return await this.analyzeSteganography({
        mediaData: data.mediaData,
        analysisType: data.analysisType || 'comprehensive'
      });
    }
    
    return { error: 'Invalid data for multimedia analysis' };
  }

  getMultimediaStats() {
    return {
      cacheSize: this.analysisCache.size,
      queueLength: this.mediaQueue.length,
      isProcessing: this.isProcessingMedia,
      steganographyPatterns: this.steganographyPatterns.size,
      supportedFormats: this.multimediaConfig.supportedFormats,
      config: this.multimediaConfig
    };
  }
}

export { MultimediaAgent };