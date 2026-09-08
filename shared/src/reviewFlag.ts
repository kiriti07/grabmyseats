export interface ManualReviewFlag {
  id: string;
  transactionId: string;
  reason: string;
  razorpayOrderId: string;
  amountPaid: number;
  createdAt: string;
  resolvedAt: string | null;
}
