import type { EmailProvider } from "./EmailProvider";
import { ConsoleEmailProvider } from "./ConsoleEmailProvider";
import { SmtpEmailProvider } from "./SmtpEmailProvider";

export type { EmailProvider };

const DEFAULT_FROM = "GrabMySeats <noreply@grabmyseats.com>";

// The rest of the app only depends on the EmailProvider interface. SMTP is
// used when all of SMTP_HOST/PORT/USER/PASS are set (SMTP_FROM is optional,
// defaulting to DEFAULT_FROM above); otherwise this falls back to the
// console stub, which only logs - see index.ts's startup log of which one
// is active.
function createEmailProvider(): { provider: EmailProvider; name: "smtp" | "console" } {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  const port = Number(SMTP_PORT);
  if (SMTP_HOST && SMTP_USER && SMTP_PASS && Number.isInteger(port) && port > 0) {
    return {
      provider: new SmtpEmailProvider({
        host: SMTP_HOST,
        port,
        user: SMTP_USER,
        pass: SMTP_PASS,
        from: SMTP_FROM || DEFAULT_FROM,
      }),
      name: "smtp",
    };
  }
  return { provider: new ConsoleEmailProvider(), name: "console" };
}

const selected = createEmailProvider();

export const emailProvider: EmailProvider = selected.provider;
export const emailProviderName = selected.name;

// The one-time login/add-email code. Deliberately fixed text plus the code
// and nothing else - no name, ref, or any other caller-supplied value ever
// goes into a message sent to an arbitrary address, so these endpoints
// can't be used to relay someone else's content from our domain.
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await emailProvider.send(
    to,
    `Your GrabMySeats code: ${code}`,
    `Your GrabMySeats code is ${code}. It expires in 5 minutes.\n\n` +
      "If you didn't request this, you can ignore this email.\n",
  );
}
