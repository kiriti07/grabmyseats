// POST /api/push/tokens - registers this device for ticket-alert push
// notifications (backend routes/pushTokens.ts). Android only for now.
export interface RegisterPushTokenInput {
  token: string;
  platform: "android";
}
