import type { EmailProvider } from "./EmailProvider";

// Dev-only stub: logs instead of sending. Swap the provider wired up in
// `./index.ts` for a real one (Resend, SES, ...) when ready to go live.
export class ConsoleEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<void> {
    console.log(`[email] to ${to}: ${subject}\n${body}`);
  }
}
