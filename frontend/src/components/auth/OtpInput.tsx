"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

export function OtpInput({
  onChange,
  disabled = false,
  hasError = false,
}: {
  onChange: (code: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function updateDigits(next: string[]) {
    setDigits(next);
    onChange(next.join(""));
  }

  function handleChange(index: number, rawValue: string) {
    const value = rawValue.replace(/\D/g, "");
    if (!value) {
      const next = [...digits];
      next[index] = "";
      updateDigits(next);
      return;
    }

    const next = [...digits];
    const chars = value.split("");
    let i = index;
    for (const char of chars) {
      if (i >= LENGTH) break;
      next[i] = char;
      i++;
    }
    updateDigits(next);

    const nextIndex = Math.min(i, LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = "";
      updateDigits(next);
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    const next = Array(LENGTH).fill("");
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    updateDigits(next);
    inputRefs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  return (
    <div className="relative rounded-2xl bg-surface">
      <div className="ticket-notch relative flex items-center justify-center border-b border-dashed border-line py-3">
        <span className="font-display text-xs tracking-[0.3em] text-gold-dim">
          ADMIT ONE
        </span>
      </div>
      <div className="flex justify-between gap-2 p-5">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            autoFocus={index === 0}
            disabled={disabled}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            aria-label={`Digit ${index + 1}`}
            className={`h-12 w-full min-w-0 rounded-lg border bg-surface-raised text-center font-sans text-xl font-semibold text-foreground focus:outline-none focus:ring-1 disabled:opacity-60 ${
              hasError
                ? "border-error focus:border-error focus:ring-error"
                : "border-line focus:border-gold focus:ring-gold"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
