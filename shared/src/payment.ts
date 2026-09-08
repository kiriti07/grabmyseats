// What POST /api/transactions/:id/pay returns for the client to hand to
// Razorpay's Checkout SDK. `key` is the Razorpay key id, which is public by
// design (unlike the key secret) - safe to send to a client.
export interface RazorpayCheckoutOrder {
  orderId: string;
  amount: number;
  currency: string;
  key: string;
}
