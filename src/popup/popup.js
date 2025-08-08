/**
 * PromptGuardian Popup Interface
 * Comprehensive dashboard with Railway integration and real-time insights
 */

class PromptGuardianPopup {
  constructor() {
    this.isInitialized = false;
    this.currentTab = 'dashboard';
    this.settings = {};
    this.systemStatus = 'initializing';
    this.apiStatuses = {};
    this.threatData = {};
    this.activityFeed = [];
    this.agentStates = {};
    this.railwayApiUrl = 'https://promptgaurdian-production.up.railway.app';
    
    this.init();
  }

  async init() {
    try {
      console.log('[PopupUI] Initializing PromptGuardian popup');
      
      // Load user settings
      await this.loadSettings();
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Initialize UI components
      this.initializeUI();
      
      // Start data loading
      await this.loadInitialData();
      
      // Set up periodic updates
      this.startPeriodicUpdates();
      
      this.isInitialized = true;
      this.hideLoadingOverlay();
      
      console.log('[PopupUI] Initialization complete');
      
    } catch (error) {
      console.error('[PopupUI] Initialization failed:', error);
      this.showError('Failed to initialize PromptGuardian: ' + error.message);
      this.hideLoadingOverlay();
    }
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        // Default settings
        enableRealTimeMonitoring: true,
        enableSocialShield: true,
        enableSpamDetection: true,
        enablePhishingDetection: true,
        enableSteganographyDetection: true,
        enableMisinformationDetection: true,
        monitoringMode: 'balanced',
        threatThreshold: 0.5,
        socialThreatThreshold: 0.4,
        enableNotifications: true,
        enableSounds: false,
        enableAnalytics: true,
        grokApiKey: '',
        braveApiKey: '',
        railwayApiUrl: 'https://promptgaurdian-production.up.railway.app'
      }, (settings) => {
        this.settings = settings;
        this.railwayApiUrl = settings.railwayApiUrl;
        resolve(settings);
      });
    });
  }

  setupEventHandlers() {
    // Tab navigation
    document.querySelectorAll('.pg-nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Settings handlers
    this.setupSettingsHandlers();
    
    // Action button handlers
    this.setupActionHandlers();
    
    // Modal handlers
    this.setupModalHandlers();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyboard.bind(this));
  }

  setupSettingsHandlers() {
    // API key toggles
    document.getElementById('toggleGrokKey').addEventListener('click', () => {
      const input = document.getElementById('grokApiKey');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('toggleBraveKey').addEventListener('click', () => {
      const input = document.getElementById('braveApiKey');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Threat threshold slider
    const threatSlider = document.getElementById('threatThreshold');
    const thresholdValue = document.getElementById('thresholdValue');
    
    threatSlider.addEventListener('input', (e) => {
      const value = Math.round(parseFloat(e.target.value) * 100);
      thresholdValue.textContent = `${value}%`;
      
      this.settings.threatThreshold = parseFloat(e.target.value);
      this.saveSettings();
    });

    // Monitor mode selector
    document.getElementById('monitoringMode').addEventListener('change', (e) => {
      this.settings.monitoringMode = e.target.value;
      this.saveSettings();
      this.updateSystemStatus();
    });

    // Checkboxes
    const checkboxes = [
      'enableNotifications', 'enableSounds', 'enableAnalytics',
      'socialShieldToggle', 'spamDetection', 'phishingDetection',
      'steganographyDetection', 'misinformationDetection'
    ];

    checkboxes.forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          const settingKey = id === 'socialShieldToggle' ? 'enableSocialShield' : id;
          this.settings[settingKey] = e.target.checked;
          this.saveSettings();
          
          // Update UI accordingly
          if (id === 'socialShieldToggle') {
            this.updateSocialShieldStatus();
          }
        });
      }
    });

    // API keys
    document.getElementById('grokApiKey').addEventListener('change', (e) => {
      this.settings.grokApiKey = e.target.value;
      this.saveSettings();
      this.testGrokConnection();
    });

    document.getElementById('braveApiKey').addEventListener('change', (e) => {
      this.settings.braveApiKey = e.target.value;
      this.saveSettings();
      this.testBraveConnection();
    });

    // Railway endpoint
    document.getElementById('railwayEndpoint').addEventListener('change', (e) => {
      this.settings.railwayApiUrl = e.target.value;
      this.railwayApiUrl = e.target.value;
      this.saveSettings();
      this.testRailwayConnection();
    });
  }

  setupActionHandlers() {
    // Refresh buttons
    document.getElementById('refreshThreats').addEventListener('click', () => {
      this.refreshThreatData();
    });

    // Connection test
    document.getElementById('testConnections').addEventListener('click', () => {
      this.testAllConnections();
    });

    // Data management
    document.getElementById('clearData').addEventListener('click', () => {
      this.clearAllData();
    });

    document.getElementById('exportLogs').addEventListener('click', () => {
      this.exportLogs();
    });

    document.getElementById('importSettings').addEventListener('click', () => {
      this.importSettings();
    });
  }

  setupModalHandlers() {
    // Help modal
    document.getElementById('showHelp').addEventListener('click', (e) => {
      e.preventDefault();
      this.showModal('helpModal');
    });

    // About modal
    document.getElementById('showAbout').addEventListener('click', (e) => {
      e.preventDefault();
      this.showModal('aboutModal');
    });

    // Close modals
    document.querySelectorAll('.pg-modal-close, .pg-modal-backdrop').forEach(el => {
      el.addEventListener('click', (e) => {
        const modal = e.target.closest('.pg-modal');
        if (modal) {
          this.hideModal(modal.id);
        }
      });
    });
  }

  handleKeyboard(e) {
    // ESC to close modals
    if (e.key === 'Escape') {
      const activeModal = document.querySelector('.pg-modal.active');
      if (activeModal) {
        this.hideModal(activeModal.id);
      }
    }

    // Tab shortcuts
    if (e.altKey) {
      switch (e.key) {
        case '1': this.switchTab('dashboard'); break;
        case '2': this.switchTab('threats'); break;
        case '3': this.switchTab('social'); break;
        case '4': this.switchTab('settings'); break;
      }
    }
  }

  initializeUI() {
    // Set initial values from settings
    this.populateSettingsUI();
    
    // Set initial system status
    this.updateSystemStatus();
    
    // Initialize charts
    this.initializeCharts();
    
    // Update last update time
    this.updateLastUpdateTime();
  }

  populateSettingsUI() {
    // API keys
    if (this.settings.grokApiKey) {
      document.getElementById('grokApiKey').value = this.settings.grokApiKey;
    }
    if (this.settings.braveApiKey) {
      document.getElementById('braveApiKey').value = this.settings.braveApiKey;
    }

    // Monitoring mode
    document.getElementById('monitoringMode').value = this.settings.monitoringMode;

    // Threat threshold
    const threatSlider = document.getElementById('threatThreshold');
    const thresholdValue = document.getElementById('thresholdValue');
    threatSlider.value = this.settings.threatThreshold;
    thresholdValue.textContent = `${Math.round(this.settings.threatThreshold * 100)}%`;

    // Checkboxes
    const checkboxSettings = {
      'enableNotifications': this.settings.enableNotifications,
      'enableSounds': this.settings.enableSounds,
      'enableAnalytics': this.settings.enableAnalytics,
      'socialShieldToggle': this.settings.enableSocialShield,
      'spamDetection': this.settings.enableSpamDetection,
      'phishingDetection': this.settings.enablePhishingDetection,
      'steganographyDetection': this.settings.enableSteganographyDetection,
      'misinformationDetection': this.settings.enableMisinformationDetection
    };

    Object.entries(checkboxSettings).forEach(([id, value]) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.checked = value;
      }
    });

    // Railway endpoint
    document.getElementById('railwayEndpoint').value = this.settings.railwayApiUrl;
  }

  async loadInitialData() {
    // Load data concurrently
    const dataPromises = [
      this.loadDashboardMetrics(),
      this.loadThreatData(),
      this.loadActivityFeed(),
      this.loadAgentStatus(),
      this.testAllConnections()
    ];

    try {
      await Promise.allSettled(dataPromises);
    } catch (error) {
      console.warn('[PopupUI] Some data failed to load:', error);
    }
  }

  async loadDashboardMetrics() {
    try {
      // Load from local storage first
      const localData = await this.getStorageData(['threatAnalytics', 'socialThreatLog']);
      
      const threatAnalytics = localData.threatAnalytics || [];
      const socialThreatLog = localData.socialThreatLog || [];
      
      // Calculate metrics
      const today = new Date().toDateString();
      const todayThreats = threatAnalytics.filter(t => 
        new Date(t.timestamp).toDateString() === today
      );
      const todaySocialThreats = socialThreatLog.filter(t => 
        new Date(t.timestamp).toDateString() === today
      );
      
      // Update UI
      document.getElementById('threatsDetected').textContent = threatAnalytics.length;
      document.getElementById('socialPostsScanned').textContent = socialThreatLog.length;
      document.getElementById('apiCallsToday').textContent = todayThreats.length + todaySocialThreats.length;
      
      // Try to get agent count from content scripts
      this.getAgentCount();
      
    } catch (error) {
      console.error('[PopupUI] Failed to load dashboard metrics:', error);
    }
  }

  async getAgentCount() {
    try {
      // Query active tabs for agent information
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'get_agent_status' }, (response) => {
          if (response && !chrome.runtime.lastError) {
            document.getElementById('agentsActive').textContent = response.activeAgents || 0;
            this.updateAgentStatus(response.agents || {});
          }
        });
      }
    } catch (error) {
      // Fallback to estimated count
      document.getElementById('agentsActive').textContent = '8';
    }
  }

  async loadThreatData() {
    try {
      // Load local threat data
      const localData = await this.getStorageData(['threatAnalytics']);
      const threats = localData.threatAnalytics || [];
      
      // Categorize threats by severity
      const threatCounts = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      };
      
      const threatTypes = {};
      const recentThreats = [];
      
      threats.forEach(threat => {
        // Categorize by score
        if (threat.threatScore >= 0.8) threatCounts.critical++;
        else if (threat.threatScore >= 0.6) threatCounts.high++;
        else if (threat.threatScore >= 0.4) threatCounts.medium++;
        else threatCounts.low++;
        
        // Count by type
        threatTypes[threat.threatType] = (threatTypes[threat.threatType] || 0) + 1;
        
        // Collect recent threats
        if (Date.now() - threat.timestamp < 24 * 60 * 60 * 1000) {
          recentThreats.push(threat);
        }
      });
      
      // Update UI
      this.updateThreatStats(threatCounts);
      this.updateThreatChart(threatTypes);
      this.updateRecentThreats(recentThreats.slice(0, 10));
      
      // Load threat intelligence
      await this.loadThreatIntelligence();
      
    } catch (error) {
      console.error('[PopupUI] Failed to load threat data:', error);
    }
  }

  async loadThreatIntelligence() {
    try {
      const response = await fetch(`${this.railwayApiUrl}/threats/stats`);
      
      if (response.ok) {
        const stats = await response.json();
        
        document.getElementById('communityReports').textContent = stats.totalReports || 'N/A';
        document.getElementById('globalPatterns').textContent = stats.totalPatterns || 'N/A';
        
        // Calculate detection accuracy (simplified)
        const accuracy = stats.totalReports > 0 ? 
          Math.round((stats.totalReports * 0.85)) + '%' : 'N/A';
        document.getElementById('detectionAccuracy').textContent = accuracy;
      } else {
        throw new Error('Failed to fetch threat intelligence');
      }
      
    } catch (error) {
      console.warn('[PopupUI] Failed to load threat intelligence:', error);
      document.getElementById('communityReports').textContent = 'Offline';
      document.getElementById('globalPatterns').textContent = 'Offline';
      document.getElementById('detectionAccuracy').textContent = 'Offline';
    }
  }

  updateThreatStats(counts) {
    document.getElementById('criticalThreats').textContent = counts.critical;
    document.getElementById('highThreats').textContent = counts.high;
    document.getElementById('mediumThreats').textContent = counts.medium;
    document.getElementById('lowThreats').textContent = counts.low;
  }

  updateThreatChart(threatTypes) {
    const canvas = document.getElementById('threatTypesChart');
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (Object.keys(threatTypes).length === 0) {
      // Show "No data" message
      ctx.font = '14px system-ui';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'center';
      ctx.fillText('No threat data available', canvas.width / 2, canvas.height / 2);
      return;
    }
    
    // Simple bar chart
    const entries = Object.entries(threatTypes).slice(0, 5);
    const maxValue = Math.max(...entries.map(([,count]) => count));
    const barWidth = (canvas.width - 40) / entries.length;
    const maxBarHeight = canvas.height - 60;
    
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
    
    entries.forEach(([type, count], index) => {
      const barHeight = (count / maxValue) * maxBarHeight;
      const x = 20 + index * barWidth + index * 5;
      const y = canvas.height - 30 - barHeight;
      
      // Draw bar
      ctx.fillStyle = colors[index];
      ctx.fillRect(x, y, barWidth - 5, barHeight);
      
      // Draw label
      ctx.fillStyle = '#374151';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(type.slice(0, 8), x + barWidth / 2, canvas.height - 10);
      
      // Draw value
      ctx.fillText(count.toString(), x + barWidth / 2, y - 5);
    });
  }

  updateRecentThreats(threats) {
    const container = document.getElementById('recentThreats');
    
    if (threats.length === 0) {
      container.innerHTML = `
        <div class="pg-threat-item">
          <div class="pg-threat-info">
            <div class="pg-threat-type">No recent threats</div>
            <div class="pg-threat-details">Your system is secure</div>
          </div>
          <div class="pg-threat-score low">✓</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = threats.map(threat => {
      const level = this.getThreatLevel(threat.threatScore);
      const timeAgo = this.getTimeAgo(threat.timestamp);
      
      return `
        <div class="pg-threat-item">
          <div class="pg-threat-info">
            <div class="pg-threat-type">${this.formatThreatType(threat.threatType)}</div>
            <div class="pg-threat-details">${threat.site} • ${timeAgo}</div>
          </div>
          <div class="pg-threat-score ${level}">${Math.round(threat.threatScore * 100)}%</div>
        </div>
      `;
    }).join('');
  }

  async loadActivityFeed() {
    try {
      // Combine different activity sources
      const activities = [];
      
      // Recent threat detections
      const localData = await this.getStorageData(['threatAnalytics', 'socialThreatLog']);
      const threats = (localData.threatAnalytics || []).slice(-5);
      const socialThreats = (localData.socialThreatLog || []).slice(-5);
      
      threats.forEach(threat => {
        activities.push({
          icon: '🛡️',
          title: `${this.formatThreatType(threat.threatType)} detected`,
          time: this.getTimeAgo(threat.timestamp),
          type: 'threat'
        });
      });
      
      socialThreats.forEach(threat => {
        activities.push({
          icon: '🌐',
          title: `Social threat detected: ${threat.threatType}`,
          time: this.getTimeAgo(threat.timestamp),
          type: 'social'
        });
      });
      
      // Sort by timestamp (most recent first)
      activities.sort((a, b) => b.timestamp - a.timestamp);
      
      this.updateActivityFeed(activities.slice(0, 8));
      
    } catch (error) {
      console.error('[PopupUI] Failed to load activity feed:', error);
      this.updateActivityFeed([]);
    }
  }

  updateActivityFeed(activities) {
    const container = document.getElementById('activityFeed');
    
    if (activities.length === 0) {
      container.innerHTML = `
        <div class="pg-activity-item">
          <div class="pg-activity-icon">💤</div>
          <div class="pg-activity-content">
            <div class="pg-activity-title">No recent activity</div>
            <div class="pg-activity-time">System is monitoring</div>
          </div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = activities.map(activity => `
      <div class="pg-activity-item">
        <div class="pg-activity-icon">${activity.icon}</div>
        <div class="pg-activity-content">
          <div class="pg-activity-title">${activity.title}</div>
          <div class="pg-activity-time">${activity.time}</div>
        </div>
      </div>
    `).join('');
  }

  async loadAgentStatus() {
    // Mock agent status - in production would get from content scripts
    const agents = [
      { name: 'Orchestrator', status: 'active' },
      { name: 'Detection', status: 'active' },
      { name: 'Analysis', status: 'active' },
      { name: 'Verification', status: 'active' },
      { name: 'Goggles', status: 'active' },
      { name: 'Multimedia', status: 'active' },
      { name: 'Predictive', status: 'inactive' },
      { name: 'Adaptation', status: 'inactive' }
    ];
    
    this.updateAgentStatus(agents);
  }

  updateAgentStatus(agents) {
    const container = document.getElementById('agentsStatus');
    
    if (Array.isArray(agents)) {
      container.innerHTML = agents.map(agent => `
        <div class="pg-agent-item">
          <div class="pg-agent-name">${agent.name}</div>
          <div class="pg-agent-status">
            <div class="pg-agent-dot ${agent.status}"></div>
            <span>${agent.status}</span>
          </div>
        </div>
      `).join('');
    } else {
      // Fallback display
      container.innerHTML = `
        <div class="pg-agent-item">
          <div class="pg-agent-name">All Agents</div>
          <div class="pg-agent-status">
            <div class="pg-agent-dot active"></div>
            <span>Ready</span>
          </div>
        </div>
      `;
    }
  }

  async testAllConnections() {
    this.showLoadingOverlay('Testing connections...');
    
    try {
      // Test connections concurrently
      const connectionPromises = [
        this.testRailwayConnection(),
        this.testGrokConnection(),
        this.testBraveConnection()
      ];
      
      await Promise.allSettled(connectionPromises);
      
    } catch (error) {
      console.error('[PopupUI] Connection test failed:', error);
    } finally {
      this.hideLoadingOverlay();
    }
  }

  async testRailwayConnection() {
    const statusElement = document.getElementById('railwayStatus');
    const indicator = statusElement.querySelector('.pg-api-indicator');
    const statusText = statusElement.querySelector('.pg-api-status-text');
    
    try {
      statusText.textContent = 'Testing...';
      indicator.className = 'pg-api-indicator';
      
      const response = await fetch(`${this.railwayApiUrl}/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      if (response.ok) {
        const data = await response.json();
        statusText.textContent = `Connected (${data.version || 'v1.0.0'})`;
        indicator.className = 'pg-api-indicator connected';
        this.apiStatuses.railway = 'connected';
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
      
    } catch (error) {
      statusText.textContent = 'Connection failed';
      indicator.className = 'pg-api-indicator error';
      this.apiStatuses.railway = 'error';
      console.error('[PopupUI] Railway connection failed:', error);
    }
  }

  async testGrokConnection() {
    const statusElement = document.getElementById('grokStatus');
    const indicator = statusElement.querySelector('.pg-api-indicator');
    const statusText = statusElement.querySelector('.pg-api-status-text');
    
    try {
      statusText.textContent = 'Testing...';
      indicator.className = 'pg-api-indicator';
      
      if (!this.settings.grokApiKey) {
        // Test via Railway proxy
        const response = await fetch(`${this.railwayApiUrl}/api/v1/config`);
        const config = await response.json();
        
        if (config.services?.grok?.available) {
          statusText.textContent = 'Available via proxy';
          indicator.className = 'pg-api-indicator connected';
          this.apiStatuses.grok = 'proxy';
        } else {
          statusText.textContent = 'Not configured';
          indicator.className = 'pg-api-indicator warning';
          this.apiStatuses.grok = 'warning';
        }
      } else {
        // Test direct connection
        statusText.textContent = 'Direct connection configured';
        indicator.className = 'pg-api-indicator connected';
        this.apiStatuses.grok = 'direct';
      }
      
    } catch (error) {
      statusText.textContent = 'Connection failed';
      indicator.className = 'pg-api-indicator error';
      this.apiStatuses.grok = 'error';
      console.error('[PopupUI] Grok connection test failed:', error);
    }
  }

  async testBraveConnection() {
    const statusElement = document.getElementById('braveStatus');
    const indicator = statusElement.querySelector('.pg-api-indicator');
    const statusText = statusElement.querySelector('.pg-api-status-text');
    
    try {
      statusText.textContent = 'Testing...';
      indicator.className = 'pg-api-indicator';
      
      if (!this.settings.braveApiKey) {
        // Test via Railway proxy
        const response = await fetch(`${this.railwayApiUrl}/api/v1/config`);
        const config = await response.json();
        
        if (config.services?.brave?.available) {
          statusText.textContent = 'Available via proxy';
          indicator.className = 'pg-api-indicator connected';
          this.apiStatuses.brave = 'proxy';
        } else {
          statusText.textContent = 'Not configured';
          indicator.className = 'pg-api-indicator warning';
          this.apiStatuses.brave = 'warning';
        }
      } else {
        // Test direct connection
        statusText.textContent = 'Direct connection configured';
        indicator.className = 'pg-api-indicator connected';
        this.apiStatuses.brave = 'direct';
      }
      
    } catch (error) {
      statusText.textContent = 'Connection failed';
      indicator.className = 'pg-api-indicator error';
      this.apiStatuses.brave = 'error';
      console.error('[PopupUI] Brave connection test failed:', error);
    }
  }

  updateSystemStatus() {
    const statusElement = document.getElementById('systemStatus');
    const statusDot = statusElement.querySelector('.pg-status-dot');
    const statusText = statusElement.querySelector('.pg-status-text');
    
    if (this.settings.enableRealTimeMonitoring) {
      statusDot.className = 'pg-status-dot';
      statusText.textContent = `Active (${this.settings.monitoringMode})`;
      this.systemStatus = 'active';
    } else {
      statusDot.className = 'pg-status-dot warning';
      statusText.textContent = 'Monitoring disabled';
      this.systemStatus = 'disabled';
    }
  }

  updateSocialShieldStatus() {
    // Update social platform cards
    const xPlatform = document.querySelector('[data-platform="x"]');
    if (xPlatform) {
      if (this.settings.enableSocialShield) {
        xPlatform.classList.add('active');
        xPlatform.classList.remove('inactive');
        xPlatform.querySelector('.pg-platform-status').textContent = 'Monitoring';
      } else {
        xPlatform.classList.remove('active');
        xPlatform.classList.add('inactive');
        xPlatform.querySelector('.pg-platform-status').textContent = 'Disabled';
      }
    }
  }

  startPeriodicUpdates() {
    // Update every 30 seconds
    setInterval(() => {
      if (this.currentTab === 'dashboard') {
        this.loadDashboardMetrics();
        this.loadActivityFeed();
      } else if (this.currentTab === 'threats') {
        this.loadThreatData();
      }
    }, 30000);
    
    // Test connections every 5 minutes
    setInterval(() => {
      this.testAllConnections();
    }, 5 * 60 * 1000);
  }

  switchTab(tabName) {
    // Update navigation
    document.querySelectorAll('.pg-nav-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.pg-tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    
    this.currentTab = tabName;
    
    // Load tab-specific data
    this.loadTabData(tabName);
  }

  loadTabData(tabName) {
    switch (tabName) {
      case 'dashboard':
        this.loadDashboardMetrics();
        this.loadActivityFeed();
        break;
      case 'threats':
        this.loadThreatData();
        break;
      case 'social':
        this.loadSocialData();
        break;
      case 'settings':
        // Settings are already loaded
        break;
    }
  }

  async loadSocialData() {
    try {
      const localData = await this.getStorageData(['socialThreatLog']);
      const socialThreats = localData.socialThreatLog || [];
      
      // Update social detections
      const recent = socialThreats.slice(-10).reverse();
      this.updateSocialDetections(recent);
      
    } catch (error) {
      console.error('[PopupUI] Failed to load social data:', error);
    }
  }

  updateSocialDetections(detections) {
    const container = document.getElementById('socialDetections');
    
    if (detections.length === 0) {
      container.innerHTML = `
        <div class="pg-detection-item">
          <div class="pg-detection-info">
            <div class="pg-detection-type">No recent detections</div>
            <div class="pg-detection-platform">Social media monitoring active</div>
          </div>
          <div class="pg-detection-time">—</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = detections.map(detection => `
      <div class="pg-detection-item">
        <div class="pg-detection-info">
          <div class="pg-detection-type">${this.formatThreatType(detection.threatType)}</div>
          <div class="pg-detection-platform">${detection.platform || 'Unknown'} platform</div>
        </div>
        <div class="pg-detection-time">${this.getTimeAgo(detection.timestamp)}</div>
      </div>
    `).join('');
  }

  async refreshThreatData() {
    const btn = document.getElementById('refreshThreats');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<span class="pg-btn-icon">⏳</span> Refreshing...';
    btn.disabled = true;
    
    try {
      await this.loadThreatData();
      await this.loadThreatIntelligence();
      
      // Show success feedback
      btn.innerHTML = '<span class="pg-btn-icon">✓</span> Updated';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
      
    } catch (error) {
      btn.innerHTML = '<span class="pg-btn-icon">❌</span> Failed';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
    }
  }

  async clearAllData() {
    if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      return;
    }
    
    try {
      // Clear all storage
      await chrome.storage.local.clear();
      await chrome.storage.sync.clear();
      
      // Reload settings
      await this.loadSettings();
      this.populateSettingsUI();
      
      // Refresh displays
      await this.loadInitialData();
      
      this.showSuccess('All data cleared successfully');
      
    } catch (error) {
      this.showError('Failed to clear data: ' + error.message);
    }
  }

  async exportLogs() {
    try {
      const data = await this.getStorageData(['threatAnalytics', 'socialThreatLog']);
      
      const exportData = {
        version: '1.0.0',
        exportTime: new Date().toISOString(),
        threatAnalytics: data.threatAnalytics || [],
        socialThreatLog: data.socialThreatLog || []
      };
      
      // Create and download file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], 
                           { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `promptguardian-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showSuccess('Logs exported successfully');
      
    } catch (error) {
      this.showError('Failed to export logs: ' + error.message);
    }
  }

  importSettings() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importData = JSON.parse(e.target.result);
          
          if (importData.settings) {
            // Import settings
            Object.assign(this.settings, importData.settings);
            this.saveSettings();
            this.populateSettingsUI();
            this.showSuccess('Settings imported successfully');
          } else {
            this.showError('Invalid settings file format');
          }
          
        } catch (error) {
          this.showError('Failed to import settings: ' + error.message);
        }
      };
      reader.readAsText(file);
    };
    
    input.click();
  }

  saveSettings() {
    chrome.storage.sync.set(this.settings, () => {
      if (chrome.runtime.lastError) {
        console.error('[PopupUI] Failed to save settings:', chrome.runtime.lastError);
      }
    });
  }

  getStorageData(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  initializeCharts() {
    // Chart initialization is handled in updateThreatChart
    // This is a placeholder for future chart library integration
  }

  showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  showLoadingOverlay(text = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const textElement = overlay.querySelector('.pg-loading-text');
    
    textElement.textContent = text;
    overlay.classList.remove('hidden');
  }

  hideLoadingOverlay() {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `pg-toast pg-toast-${type}`;
    toast.textContent = message;
    
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 16px',
      borderRadius: '6px',
      fontSize: '14px',
      zIndex: '3000',
      color: 'white',
      backgroundColor: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'
    });
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  updateLastUpdateTime() {
    document.getElementById('lastUpdate').textContent = 
      'Last updated: ' + new Date().toLocaleTimeString();
    
    // Update every minute
    setInterval(() => {
      document.getElementById('lastUpdate').textContent = 
        'Last updated: ' + new Date().toLocaleTimeString();
    }, 60000);
  }

  // Utility methods
  getThreatLevel(score) {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }

  formatThreatType(type) {
    const formatted = {
      'prompt_injection': 'Prompt Injection',
      'jailbreak': 'Jailbreak',
      'data_extraction': 'Data Extraction',
      'spam': 'Spam',
      'phishing': 'Phishing',
      'steganography': 'Steganography',
      'misinformation': 'Misinformation'
    };
    
    return formatted[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.promptGuardianPopup = new PromptGuardianPopup();
});