// Real-time client: WebSocket with exponential-backoff reconnect, stale
// connection handling, and re-subscription after reconnect. NEVER polls as
// a substitute for live updates — polling exists only as a last-resort
// fallback when WebSocket is completely unavailable.

const config = window.LINELESS_CONFIG ?? {};

export class QueueSocket {
  /**
   * @param {object} subscription {scopeType:'queue', queueId} or {scopeType:'customer', token}
   * @param {(message: object) => void} onMessage
   * @param {(status: 'connecting'|'live'|'offline') => void} [onStatus]
   */
  constructor(subscription, onMessage, onStatus) {
    this.subscription = subscription;
    this.onMessage = onMessage;
    this.onStatus = onStatus ?? (() => {});
    this.socket = null;
    this.attempt = 0;
    this.stopped = false;
    this.keepalive = null;
    this.connect();
  }

  connect() {
    if (this.stopped) return;
    this.onStatus('connecting');
    const base = config.wsBaseUrl ?? '';
    const url = base.replace(/^http/, 'ws');
    try {
      this.socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener('open', () => {
      this.attempt = 0;
      this.onStatus('live');
      this.socket.send(JSON.stringify({
        action: 'subscribe',
        scopeType: this.subscription.scopeType,
        queueId: this.subscription.queueId,
        token: this.subscription.token,
      }));
      this.keepalive = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ action: 'ping' }));
        }
      }, 60000);
    });

    this.socket.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'PONG' || msg.type === 'SUBSCRIBED') return;
        this.onMessage(msg);
      } catch {
        // ignore malformed frames
      }
    });

    this.socket.addEventListener('close', () => {
      clearInterval(this.keepalive);
      if (!this.stopped) this.scheduleReconnect();
    });

    this.socket.addEventListener('error', () => {
      clearInterval(this.keepalive);
      try { this.socket?.close(); } catch { /* already closing */ }
    });
  }

  scheduleReconnect() {
    this.onStatus('offline');
    const delay = Math.min(8000, 500 * 2 ** this.attempt) + Math.random() * 250;
    this.attempt += 1;
    setTimeout(() => this.connect(), delay);
  }

  close() {
    this.stopped = true;
    clearInterval(this.keepalive);
    try { this.socket?.close(); } catch { /* already closed */ }
  }
}
