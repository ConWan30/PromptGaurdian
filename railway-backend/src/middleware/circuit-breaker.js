/**
 * Circuit Breaker Pattern Implementation
 * Provides resilient API calling with automatic failure handling
 */

const EventEmitter = require('events');

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.name = options.name || 'unnamed';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 60 seconds
    this.monitoringPeriod = options.monitoringPeriod || 300000; // 5 minutes
    this.expectedErrors = options.expectedErrors || [];
    
    // Circuit states
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = Date.now();
    
    // Statistics
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      averageResponseTime: 0,
      lastResetTime: Date.now()
    };
    
    // Periodic reset of statistics
    setInterval(() => this.resetStats(), this.monitoringPeriod);
  }

  async execute(operation, fallback = null) {
    this.stats.totalRequests++;
    
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        this.emit('reject', { reason: 'circuit_open', name: this.name });
        
        if (fallback) {
          return await this.executeFallback(fallback);
        }
        
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      } else {
        // Try to transition to HALF_OPEN
        this.state = 'HALF_OPEN';
        this.emit('half_open', { name: this.name });
      }
    }

    const startTime = Date.now();
    
    try {
      const result = await operation();
      this.onSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this.onFailure(error, Date.now() - startTime);
      
      if (fallback) {
        return await this.executeFallback(fallback);
      }
      
      throw error;
    }
  }

  async executeFallback(fallback) {
    try {
      this.emit('fallback', { name: this.name });
      return await fallback();
    } catch (fallbackError) {
      this.emit('fallback_failed', { name: this.name, error: fallbackError.message });
      throw fallbackError;
    }
  }

  onSuccess(responseTime) {
    this.stats.totalSuccesses++;
    this.updateAverageResponseTime(responseTime);
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      
      // Require 2 successes to close circuit
      if (this.successCount >= 2) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.emit('close', { name: this.name });
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
    
    this.emit('success', { 
      name: this.name, 
      responseTime, 
      state: this.state 
    });
  }

  onFailure(error, responseTime) {
    this.stats.totalFailures++;
    this.updateAverageResponseTime(responseTime);
    this.lastFailureTime = Date.now();
    
    // Don't count expected errors as failures
    const isExpectedError = this.expectedErrors.some(expectedError => {
      if (typeof expectedError === 'string') {
        return error.message.includes(expectedError);
      }
      if (expectedError instanceof RegExp) {
        return expectedError.test(error.message);
      }
      return false;
    });
    
    if (isExpectedError) {
      this.emit('expected_error', { 
        name: this.name, 
        error: error.message,
        responseTime 
      });
      return;
    }
    
    this.failureCount++;
    this.successCount = 0;
    
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      this.emit('open', { 
        name: this.name, 
        failureCount: this.failureCount,
        nextAttempt: this.nextAttempt
      });
    }
    
    this.emit('failure', { 
      name: this.name, 
      error: error.message, 
      responseTime,
      failureCount: this.failureCount,
      state: this.state 
    });
  }

  updateAverageResponseTime(responseTime) {
    const alpha = 0.1; // Exponential moving average factor
    this.stats.averageResponseTime = 
      (1 - alpha) * this.stats.averageResponseTime + alpha * responseTime;
  }

  resetStats() {
    const now = Date.now();
    const timePeriod = now - this.stats.lastResetTime;
    
    this.emit('stats_reset', {
      name: this.name,
      period: timePeriod,
      stats: { ...this.stats }
    });
    
    // Keep running averages, reset counters
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      averageResponseTime: this.stats.averageResponseTime,
      lastResetTime: now
    };
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      stats: { ...this.stats },
      healthRatio: this.stats.totalRequests > 0 ? 
        this.stats.totalSuccesses / this.stats.totalRequests : 1
    };
  }

  // Force state transitions (for testing/admin)
  forceOpen() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.resetTimeout;
    this.emit('force_open', { name: this.name });
  }

  forceClose() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.emit('force_close', { name: this.name });
  }

  forceHalfOpen() {
    this.state = 'HALF_OPEN';
    this.successCount = 0;
    this.emit('force_half_open', { name: this.name });
  }
}

// Circuit breaker manager for multiple services
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
    this.globalStats = {
      totalCircuits: 0,
      openCircuits: 0,
      halfOpenCircuits: 0,
      closedCircuits: 0
    };
  }

  createBreaker(name, options = {}) {
    const breaker = new CircuitBreaker({ ...options, name });
    
    // Log important events
    breaker.on('open', (event) => {
      console.warn(`[CircuitBreaker] ${event.name} opened after ${event.failureCount} failures`);
    });
    
    breaker.on('close', (event) => {
      console.log(`[CircuitBreaker] ${event.name} closed - service recovered`);
    });
    
    breaker.on('half_open', (event) => {
      console.log(`[CircuitBreaker] ${event.name} half-open - testing service`);
    });
    
    breaker.on('fallback', (event) => {
      console.log(`[CircuitBreaker] ${event.name} using fallback`);
    });
    
    this.breakers.set(name, breaker);
    this.updateGlobalStats();
    
    return breaker;
  }

  getBreaker(name) {
    return this.breakers.get(name);
  }

  updateGlobalStats() {
    this.globalStats.totalCircuits = this.breakers.size;
    this.globalStats.openCircuits = 0;
    this.globalStats.halfOpenCircuits = 0;
    this.globalStats.closedCircuits = 0;
    
    this.breakers.forEach(breaker => {
      switch (breaker.state) {
        case 'OPEN':
          this.globalStats.openCircuits++;
          break;
        case 'HALF_OPEN':
          this.globalStats.halfOpenCircuits++;
          break;
        case 'CLOSED':
          this.globalStats.closedCircuits++;
          break;
      }
    });
  }

  getAllStats() {
    this.updateGlobalStats();
    
    return {
      global: this.globalStats,
      breakers: Array.from(this.breakers.values()).map(breaker => breaker.getStats()),
      timestamp: new Date().toISOString()
    };
  }

  // Health check for all breakers
  getHealthStatus() {
    const stats = this.getAllStats();
    const healthyBreakers = stats.breakers.filter(b => b.state === 'CLOSED').length;
    const totalBreakers = stats.breakers.length;
    
    return {
      healthy: stats.global.openCircuits === 0,
      healthRatio: totalBreakers > 0 ? healthyBreakers / totalBreakers : 1,
      openCircuits: stats.global.openCircuits,
      totalCircuits: totalBreakers,
      timestamp: new Date().toISOString()
    };
  }
}

// Global instance
const circuitBreakerManager = new CircuitBreakerManager();

// Create standard breakers for APIs
const grokBreaker = circuitBreakerManager.createBreaker('grok', {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
  expectedErrors: ['API key', 'rate limit', 'quota exceeded']
});

const braveBreaker = circuitBreakerManager.createBreaker('brave', {
  failureThreshold: 5,
  resetTimeout: 60000, // 60 seconds  
  expectedErrors: ['rate limit', 'quota exceeded']
});

const railwayBreaker = circuitBreakerManager.createBreaker('railway-internal', {
  failureThreshold: 10,
  resetTimeout: 120000, // 2 minutes
  expectedErrors: ['timeout']
});

// Middleware for circuit breaker stats
const circuitBreakerStatsMiddleware = (req, res, next) => {
  req.circuitBreakers = {
    manager: circuitBreakerManager,
    grok: grokBreaker,
    brave: braveBreaker,
    railway: railwayBreaker
  };
  next();
};

module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakerManager,
  grokBreaker,
  braveBreaker,
  railwayBreaker,
  circuitBreakerStatsMiddleware
};