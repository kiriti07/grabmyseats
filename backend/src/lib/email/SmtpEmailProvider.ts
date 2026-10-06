import nodemailer, { type Transporter } from "nodemailer";
import type { EmailProvider } from "./EmailProvider";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

// Plain-text only - no HTML part, images, or links of our own. Date and
// Message-ID are left for nodemailer to set (it always does), rather than
// hand-built here.
export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      // 465 is implicit TLS; anything else (587, 25) upgrades via STARTTLS,
      // which requireTLS makes mandatory instead of opportunistic.
      secure: config.port === 465,
      requireTLS: config.port !== 465,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from;
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, text: body });
  }
}
