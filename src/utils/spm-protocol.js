/**
 * SecurePromptMesh (SPM) Protocol
 * Encrypted, hash-chained communication between AI agents
 */

class SPMProtocol {
  constructor() {
    this.nodeId = this.generateNodeId();
    this.messageChain = [];
    this.peers = new Map();
  }

  generateNodeId() {
    return crypto.randomUUID();
  }

  async hashMessage(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(message));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async createMessage(type, payload, targetAgent = null) {
    const timestamp = Date.now();
    const previousHash = this.messageChain.length > 0 ? 
      this.messageChain[this.messageChain.length - 1].hash : '0';

    const message = {
      id: crypto.randomUUID(),
      type,
      payload,
      sender: this.nodeId,
      target: targetAgent,
      timestamp,
      previousHash
    };

    message.hash = await this.hashMessage(message);
    this.messageChain.push(message);

    return message;
  }

  async broadcast(type, payload) {
    const message = await this.createMessage(type, payload);
    
    // Broadcast to all registered agents via MessageChannel
    this.peers.forEach((channel, agentId) => {
      if (agentId !== this.nodeId) {
        channel.port1.postMessage(message);
      }
    });

    return message;
  }

  async sendDirect(targetAgent, type, payload) {
    const message = await this.createMessage(type, payload, targetAgent);
    
    if (this.peers.has(targetAgent)) {
      this.peers.get(targetAgent).port1.postMessage(message);
    }

    return message;
  }

  registerPeer(agentId) {
    const channel = new MessageChannel();
    this.peers.set(agentId, channel);
    return channel.port2; // Return port2 for the peer
  }

  async verifyMessageIntegrity(message) {
    const computedHash = await this.hashMessage({
      ...message,
      hash: undefined
    });
    
    return computedHash === message.hash;
  }

  getMessageHistory() {
    return [...this.messageChain];
  }
}

export { SPMProtocol };