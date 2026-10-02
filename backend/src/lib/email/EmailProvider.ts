export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}
