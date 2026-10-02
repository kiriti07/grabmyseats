import type { EmailProvider } from "./EmailProvider";
import { ConsoleEmailProvider } from "./ConsoleEmailProvider";

export type { EmailProvider };

// The rest of the app only depends on the EmailProvider interface, so
// going live with a real vendor is a one-file change: add e.g.
// ResendEmailProvider or SesEmailProvider (implementing EmailProvider) next
// to ConsoleEmailProvider, then swap the line below.
export const emailProvider: EmailProvider = new ConsoleEmailProvider();
