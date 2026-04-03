type SignalMessage = {
  from: string;
  type: string;
  data: any;
  ts: number;
};

export class SignalChannel {
  private roomCode: string;
  private role: "host" | "guest";
  private lastTs = 0;
  private polling = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private onMessage: (msg: SignalMessage) => void;

  constructor(
    roomCode: string,
    role: "host" | "guest",
    onMessage: (msg: SignalMessage) => void
  ) {
    this.roomCode = roomCode;
    this.role = role;
    this.onMessage = onMessage;
  }

  async send(type: string, data: any) {
    await fetch(`/api/meetings/live/${this.roomCode}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.role, type, data }),
    });
  }

  startPolling(intervalMs = 500) {
    if (this.polling) return;
    this.polling = true;
    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/meetings/live/${this.roomCode}/signal?role=${this.role}&since=${this.lastTs}`
        );
        if (!res.ok) return;
        const { messages } = await res.json();
        for (const msg of messages) {
          this.lastTs = Math.max(this.lastTs, msg.ts);
          this.onMessage(msg);
        }
      } catch {
        // Network error — will retry on next interval
      }
    }, intervalMs);
  }

  stopPolling() {
    this.polling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
