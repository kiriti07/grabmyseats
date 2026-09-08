"use client";

import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { ApiError, createFraudReport } from "@/lib/api";

// Matches MAX_EVIDENCE_FILES / MAX_FILE_SIZE_BYTES in
// backend/src/middleware/upload.ts - caught here too so a reporter finds
// out before waiting on an upload the server will reject anyway.
const MAX_EVIDENCE_FILES = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// "Report user" - reachable from wherever the other party's contact has
// already been revealed (the transaction detail page's contact section,
// and the buy page's contact-reveal card), since that's the only place a
// buyer/seller ever has a phone number to report by - see
// shared/src/transaction.ts's TransactionContact, which never carries a
// user id. relatedTransactionId is optional: the contact-reveal card in
// PAYMENT_MODE=contact_only has one (the reservation that triggered the
// reveal), but a report could in principle be filed with just a phone
// number and no transaction context at all.
export function ReportUserButton({
  reportedPhone,
  relatedTransactionId,
}: {
  reportedPhone: string;
  relatedTransactionId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setError(null);
    if (selected.length > MAX_EVIDENCE_FILES) {
      setError(`Attach up to ${MAX_EVIDENCE_FILES} files`);
      return;
    }
    if (selected.some((f) => f.size > MAX_FILE_BYTES)) {
      setError("Each file must be smaller than 8MB");
      return;
    }
    setFiles(selected);
  }

  async function handleSubmit() {
    setError(null);
    if (!description.trim()) {
      setError("Describe what happened");
      return;
    }
    setIsSubmitting(true);
    try {
      await createFraudReport({
        reportedPhone,
        relatedTransactionId,
        description: description.trim(),
        evidence: files,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p className="mt-3 text-center text-xs text-success">
        Report submitted. Our team will review it ✓
      </p>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-3 text-xs font-medium text-muted hover:text-error"
      >
        Report this user
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-raised p-3 text-left">
      <p className="text-sm font-medium text-foreground">Report user</p>
      <p className="mt-1 text-xs text-muted">Tell us what happened - our team will review it.</p>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What happened?"
        rows={3}
        className={`mt-2 ${INPUT_CLASS}`}
      />

      <div className="mt-2">
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={handleFilesChange}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-gold file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[#1a1408]"
        />
        {files.length > 0 && (
          <p className="mt-1 text-xs text-muted">{files.length} file(s) attached</p>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          disabled={isSubmitting}
          className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-medium text-foreground hover:border-gold disabled:opacity-60"
        >
          Cancel
        </button>
        <div className="flex-1">
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
