import type { PushMessage, PushOutcome, PushSender } from "../lib/push";

// Stands in for FCM in tests: records every push, and answers per token -
// "sent" unless a token's outcome was set with outcomeFor().
export class FakePushSender implements PushSender {
  readonly sent: { tokens: string[]; message: PushMessage }[] = [];
  private readonly outcomes = new Map<string, PushOutcome>();
  failWith: Error | null = null;

  outcomeFor(token: string, outcome: PushOutcome): this {
    this.outcomes.set(token, outcome);
    return this;
  }

  async send(tokens: string[], message: PushMessage) {
    if (this.failWith) throw this.failWith;
    this.sent.push({ tokens: [...tokens], message });
    return tokens.map((token) => ({ token, outcome: this.outcomes.get(token) ?? ("sent" as const) }));
  }

  messagesTo(token: string): PushMessage[] {
    return this.sent.filter((s) => s.tokens.includes(token)).map((s) => s.message);
  }
}
