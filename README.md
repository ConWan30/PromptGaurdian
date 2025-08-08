# PromptGuardian

A pioneering browser extension that detects threatening, harmful, or critical prompt threats in real-time while users type into AI interfaces, enhanced with **SocialShield** module for X (Twitter) social media threat monitoring.

PromptGuardian is a unique browser extension detecting harmful AI prompts & X threats in real-time. Using xAI's Grok & Brave Search APIs, its agents catch spam & steganography via SecurePromptMesh. Railway scales it. Offers alerts & suggestions—a novel AI security tool.

## Features

### Core PromptGuardian
- **Real-Time Prompt Monitoring**: Detects injection attacks, jailbreaks, and harmful prompts
- **Brave API Integration**: Dynamic Goggles, RAG-enhanced forensics, multimedia scanning
- **8-Agent Architecture**: Autonomous AI agents using Web Workers and SPM protocol

### SocialShield Module
- **X Timeline Monitoring**: Scans public posts for spam, steganography, misinformation
- **xAI Grok Integration**: Real-time threat analysis using Grok API
- **Community Intelligence**: Crowdsourced threat sharing via Railway backend

### Railway Backend
- **API Proxy**: Scalable backend for API calls and threat data aggregation
- **Enterprise Features**: Team sharing, analytics dashboards
- **SOC 2/GDPR Compliant**: Secure data handling and privacy protection

## Project Structure

```
src/
├── agents/          # 8 AI agents (Orchestrator, Detection, Analysis, etc.)
├── content/         # Content scripts for browser injection
├── background/      # Service worker for extension lifecycle
├── popup/           # Extension popup UI
├── utils/           # Shared utilities and SPM protocol
railway-backend/     # Railway deployment backend
tests/               # Test suites
docs/                # Documentation
assets/              # Icons and static assets
```

## Technology Stack

- **Frontend**: Vanilla JavaScript (Manifest V3)
- **AI Integration**: xAI Grok API, Brave Search API
- **Backend**: Node.js/Express.js on Railway
- **Security**: Web Crypto APIs, hash-chained SPM protocol
- **ML**: TensorFlow.js for on-device adaptation

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up API keys (xAI Grok, Brave Search)
4. Load extension in Chrome/Firefox developer mode
5. Deploy Railway backend (optional for enterprise features)

## License

MIT License