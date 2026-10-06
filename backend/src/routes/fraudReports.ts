import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { ApiResponse, FraudReport as SharedFraudReport } from "@grabmyseats/shared";
import { prisma } from "../lib/prisma";
import { storageProvider } from "../lib/storage";
import { requireAuth } from "../middleware/auth";
import { uploadFraudEvidence } from "../middleware/upload";
import { toSharedFraudReport } from "../lib/serialize";

export const fraudReportsRouter = Router();

function requireNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

class ReportedUserNotFoundError extends Error {}
class CannotReportSelfError extends Error {}
class TransactionNotFoundError extends Error {}
class NotPartyToTransactionError extends Error {}
class ReportedUserMismatchError extends Error {}

// Lets a buyer or seller report another user for suspected fraud - see
// GET /api/admin/fraud-reports and POST /api/admin/fraud-reports/:id/resolve
// (routes/admin.ts) for the admin side.
//
// Who's being reported:
// - With relatedTransactionId, it's derived server-side: the reporter must
//   be the buyer or seller on that transaction, and the reported user is
//   the *other* party. This is what the contact-reveal and
//   transaction-detail "Report user" entry points send (TransactionContact
//   carries no user id, and its phone is unverified and may be absent). A
//   client-supplied reportedUserId/reportedPhone is never trusted here -
//   if one is sent anyway it must match the derived party, or the report
//   is rejected rather than filed against someone else.
// - Without one, reportedUserId or reportedPhone identifies them directly.
fraudReportsRouter.post("/", requireAuth, uploadFraudEvidence, async (req, res) => {
  const reportedUserId = requireNonEmptyString(req.body?.reportedUserId);
  const reportedPhone = requireNonEmptyString(req.body?.reportedPhone);
  const relatedTransactionId = requireNonEmptyString(req.body?.relatedTransactionId);
  const description = requireNonEmptyString(req.body?.description);

  const errors: string[] = [];
  if (!description) errors.push("description is required");
  if (!reportedUserId && !reportedPhone && !relatedTransactionId) {
    errors.push("relatedTransactionId, reportedUserId or reportedPhone is required");
  }
  if (errors.length > 0) {
    const body: ApiResponse<never> = { success: false, error: errors.join("; ") };
    res.status(400).json(body);
    return;
  }

  try {
    let reportedUser;
    if (relatedTransactionId) {
      // Never let someone attach a transaction they had no part in, and
      // never silently accept a nonexistent one.
      const transaction = await prisma.transaction.findUnique({
        where: { id: relatedTransactionId },
        include: { listing: { include: { seller: true } }, buyer: true },
      });
      if (!transaction) throw new TransactionNotFoundError();
      const isBuyer = transaction.buyerId === req.user!.id;
      const isSeller = transaction.listing.sellerId === req.user!.id;
      if (!isBuyer && !isSeller) throw new NotPartyToTransactionError();

      reportedUser = isBuyer ? transaction.listing.seller : transaction.buyer;
      if (
        (reportedUserId && reportedUserId !== reportedUser.id) ||
        (reportedPhone && reportedPhone !== reportedUser.phone)
      ) {
        throw new ReportedUserMismatchError();
      }
    } else {
      reportedUser = reportedUserId
        ? await prisma.user.findUnique({ where: { id: reportedUserId } })
        : await prisma.user.findUnique({ where: { phone: reportedPhone! } });
      if (!reportedUser) throw new ReportedUserNotFoundError();
    }
    if (reportedUser.id === req.user!.id) throw new CannotReportSelfError();

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const evidenceUrls: string[] = [];
    for (const file of files) {
      const filename = `${req.user!.id}-${randomUUID()}`;
      const uploaded = await storageProvider.upload(file.buffer, filename, {
        resourceType: "raw",
        folder: "fraud-evidence",
      });
      evidenceUrls.push(uploaded.url);
    }

    const report = await prisma.fraudReport.create({
      data: {
        reporterId: req.user!.id,
        reportedUserId: reportedUser.id,
        relatedTransactionId,
        description: description!,
        evidenceUrls,
      },
    });

    const body: ApiResponse<{ report: SharedFraudReport }> = {
      success: true,
      data: { report: toSharedFraudReport(report) },
    };
    res.status(201).json(body);
  } catch (err) {
    if (err instanceof ReportedUserNotFoundError) {
      const body: ApiResponse<never> = {
        success: false,
        error: "Could not find that user to report",
      };
      res.status(404).json(body);
      return;
    }
    if (err instanceof CannotReportSelfError) {
      const body: ApiResponse<never> = { success: false, error: "You can't report yourself" };
      res.status(400).json(body);
      return;
    }
    if (err instanceof ReportedUserMismatchError) {
      const body: ApiResponse<never> = {
        success: false,
        error: "That user isn't the other party on that transaction",
      };
      res.status(400).json(body);
      return;
    }
    if (err instanceof TransactionNotFoundError) {
      const body: ApiResponse<never> = { success: false, error: "Transaction not found" };
      res.status(404).json(body);
      return;
    }
    if (err instanceof NotPartyToTransactionError) {
      const body: ApiResponse<never> = {
        success: false,
        error: "You are not a party to that transaction",
      };
      res.status(403).json(body);
      return;
    }
    throw err;
  }
});
