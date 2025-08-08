/**
 * Threat Intelligence Routes
 * Handles crowdsourced threat data and pattern sharing
 */

const express = require('express');
const NodeCache = require('node-cache');
const crypto = require('crypto');

const router = express.Router();
const threatCache = new NodeCache({ stdTTL: 1800 }); // 30 minutes

// In-memory threat database (in production, use a real database)
let threatDatabase = {
  patterns: [],
  indicators: [],
  reports: []
};

// Submit threat detection (anonymized)
router.post('/report', (req, res) => {
  const { 
    threatType, 
    pattern, 
    confidence, 
    context, 
    indicators,
    metadata 
  } = req.body;
  
  if (!threatType || !pattern || confidence === undefined) {
    return res.status(400).json({ error: 'threatType, pattern, and confidence required' });
  }
  
  // Anonymize the report
  const anonymizedReport = {
    id: crypto.randomUUID(),
    threatType,
    patternHash: crypto.createHash('sha256').update(pattern).digest('hex'),
    confidence: Math.max(0, Math.min(1, confidence)), // Clamp to 0-1
    context: context || 'unknown',
    indicators: indicators || [],
    timestamp: new Date().toISOString(),
    source: 'community',
    metadata: {
      version: metadata?.version || '1.0.0',
      userAgent: crypto.createHash('md5').update(req.get('User-Agent') || '').digest('hex').slice(0, 8)
    }
  };
  
  // Store the report
  threatDatabase.reports.push(anonymizedReport);
  
  // Update pattern database if confidence is high
  if (confidence > 0.7) {
    updateThreatPatterns(threatType, pattern, confidence);
  }
  
  res.json({
    message: 'Threat report submitted successfully',
    reportId: anonymizedReport.id,
    status: 'processed'
  });
});

// Get threat patterns for a specific type
router.get('/patterns/:type?', (req, res) => {
  const { type } = req.params;
  const { limit = 50, minConfidence = 0.5 } = req.query;
  
  let patterns = threatDatabase.patterns;
  
  // Filter by type if specified
  if (type) {
    patterns = patterns.filter(p => p.threatType === type);
  }
  
  // Filter by confidence
  patterns = patterns.filter(p => p.confidence >= parseFloat(minConfidence));
  
  // Sort by confidence and recency
  patterns = patterns
    .sort((a, b) => (b.confidence * 0.7 + (Date.now() - new Date(b.timestamp)) / 86400000 * 0.3) - 
                    (a.confidence * 0.7 + (Date.now() - new Date(a.timestamp)) / 86400000 * 0.3))
    .slice(0, parseInt(limit));
  
  // Remove sensitive data
  const sanitizedPatterns = patterns.map(p => ({
    threatType: p.threatType,
    confidence: p.confidence,
    indicators: p.indicators,
    timestamp: p.timestamp,
    reportCount: p.reportCount || 1
  }));
  
  res.json({
    patterns: sanitizedPatterns,
    total: sanitizedPatterns.length,
    filters: { type, minConfidence, limit }
  });
});

// Get threat statistics
router.get('/stats', (req, res) => {
  const stats = {
    totalReports: threatDatabase.reports.length,
    totalPatterns: threatDatabase.patterns.length,
    threatTypes: {},
    recentActivity: {
      last24h: 0,
      last7d: 0,
      last30d: 0
    },
    topThreatTypes: [],
    confidenceDistribution: {
      high: 0,    // > 0.8
      medium: 0,  // 0.5 - 0.8
      low: 0      // < 0.5
    }
  };
  
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  
  threatDatabase.reports.forEach(report => {
    const reportTime = new Date(report.timestamp).getTime();
    const ageMs = now - reportTime;
    
    // Count by threat type
    stats.threatTypes[report.threatType] = (stats.threatTypes[report.threatType] || 0) + 1;
    
    // Recent activity
    if (ageMs <= day) stats.recentActivity.last24h++;
    if (ageMs <= 7 * day) stats.recentActivity.last7d++;
    if (ageMs <= 30 * day) stats.recentActivity.last30d++;
    
    // Confidence distribution
    if (report.confidence > 0.8) stats.confidenceDistribution.high++;
    else if (report.confidence >= 0.5) stats.confidenceDistribution.medium++;
    else stats.confidenceDistribution.low++;
  });
  
  // Top threat types
  stats.topThreatTypes = Object.entries(stats.threatTypes)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));
  
  res.json(stats);
});

// Get threat indicators for real-time detection
router.get('/indicators', (req, res) => {
  const { type, format = 'json', limit = 100 } = req.query;
  
  let indicators = threatDatabase.indicators;
  
  // Filter by type if specified
  if (type) {
    indicators = indicators.filter(i => i.threatType === type);
  }
  
  // Limit results
  indicators = indicators.slice(0, parseInt(limit));
  
  if (format === 'yara') {
    // Return YARA-style rules
    const yaraRules = indicators.map((indicator, index) => 
      `rule ThreatIndicator_${index} {
        meta:
          description = "${indicator.description || 'Threat indicator'}"
          threat_type = "${indicator.threatType}"
          confidence = "${indicator.confidence}"
        strings:
          $pattern = "${indicator.pattern}"
        condition:
          $pattern
      }`
    ).join('\n\n');
    
    res.set('Content-Type', 'text/plain');
    res.send(yaraRules);
  } else {
    res.json({
      indicators,
      total: indicators.length,
      format,
      timestamp: new Date().toISOString()
    });
  }
});

// Bulk threat data for enterprise clients
router.get('/bulk-export', (req, res) => {
  const { apiKey, format = 'json', since } = req.query;
  
  // Simple API key check (in production, use proper authentication)
  if (!apiKey || apiKey !== process.env.ENTERPRISE_API_KEY) {
    return res.status(403).json({ error: 'Valid API key required for bulk export' });
  }
  
  let exportData = {
    patterns: threatDatabase.patterns,
    indicators: threatDatabase.indicators,
    statistics: {},
    exportTime: new Date().toISOString()
  };
  
  // Filter by date if specified
  if (since) {
    const sinceDate = new Date(since);
    exportData.patterns = exportData.patterns.filter(p => new Date(p.timestamp) >= sinceDate);
    exportData.indicators = exportData.indicators.filter(i => new Date(i.timestamp) >= sinceDate);
  }
  
  if (format === 'csv') {
    // Convert to CSV format
    let csv = 'ThreatType,Confidence,Timestamp,Indicators\n';
    exportData.patterns.forEach(p => {
      csv += `${p.threatType},${p.confidence},${p.timestamp},"${p.indicators.join(';')}"\n`;
    });
    
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="threat-export.csv"');
    res.send(csv);
  } else {
    res.json(exportData);
  }
});

// Submit feedback on threat detection accuracy
router.post('/feedback', (req, res) => {
  const { reportId, accurate, feedback, context } = req.body;
  
  if (!reportId) {
    return res.status(400).json({ error: 'reportId required' });
  }
  
  const feedbackEntry = {
    id: crypto.randomUUID(),
    reportId,
    accurate: Boolean(accurate),
    feedback: feedback || '',
    context: context || '',
    timestamp: new Date().toISOString(),
    ip: crypto.createHash('md5').update(req.ip).digest('hex').slice(0, 8) // Anonymized IP
  };
  
  // Store feedback (in production, use database)
  if (!threatDatabase.feedback) {
    threatDatabase.feedback = [];
  }
  threatDatabase.feedback.push(feedbackEntry);
  
  // Update pattern confidence based on feedback
  const report = threatDatabase.reports.find(r => r.id === reportId);
  if (report) {
    updatePatternConfidence(report.patternHash, accurate);
  }
  
  res.json({
    message: 'Feedback submitted successfully',
    feedbackId: feedbackEntry.id
  });
});

// Helper function to update threat patterns
function updateThreatPatterns(threatType, pattern, confidence) {
  const patternHash = crypto.createHash('sha256').update(pattern).digest('hex');
  
  let existingPattern = threatDatabase.patterns.find(p => p.patternHash === patternHash);
  
  if (existingPattern) {
    // Update existing pattern with weighted average
    const reportCount = existingPattern.reportCount || 1;
    existingPattern.confidence = ((existingPattern.confidence * reportCount) + confidence) / (reportCount + 1);
    existingPattern.reportCount = reportCount + 1;
    existingPattern.lastSeen = new Date().toISOString();
  } else {
    // Add new pattern
    threatDatabase.patterns.push({
      id: crypto.randomUUID(),
      threatType,
      patternHash,
      confidence,
      indicators: extractIndicators(pattern),
      timestamp: new Date().toISOString(),
      reportCount: 1,
      lastSeen: new Date().toISOString()
    });
  }
}

// Helper function to update pattern confidence based on feedback
function updatePatternConfidence(patternHash, accurate) {
  const pattern = threatDatabase.patterns.find(p => p.patternHash === patternHash);
  
  if (pattern) {
    // Adjust confidence based on feedback
    const adjustment = accurate ? 0.1 : -0.1;
    pattern.confidence = Math.max(0, Math.min(1, pattern.confidence + adjustment));
  }
}

// Helper function to extract indicators from patterns
function extractIndicators(pattern) {
  // Simple indicator extraction (in production, use NLP/ML)
  const indicators = [];
  
  // Extract common threat indicators
  const keywordPatterns = [
    /ignore\s+previous/gi,
    /forget\s+instructions/gi,
    /click\s+here/gi,
    /urgent/gi,
    /free\s+crypto/gi
  ];
  
  keywordPatterns.forEach(regex => {
    const matches = pattern.match(regex);
    if (matches) {
      indicators.push(...matches);
    }
  });
  
  return [...new Set(indicators)]; // Remove duplicates
}

module.exports = router;