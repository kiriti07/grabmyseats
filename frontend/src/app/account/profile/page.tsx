"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { useAuth } from "@/context/AuthContext";
import { ApiError, fetchProfile, updateProfile } from "@/lib/api";

// Matches MAX_FILE_SIZE_BYTES in backend/src/middleware/upload.ts - caught
// here too so a seller/buyer finds out before waiting on an upload the
// server will reject anyway (same pattern as the sell form's screenshot).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function isoToDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [hasWhatsapp, setHasWhatsapp] = useState(false);

  // Existing photo (from the server) vs. a newly picked one (a local blob
  // URL) are both just "what to show", but only the latter needs to be
  // uploaded on save.
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchProfile()
      .then(({ user }) => {
        setFullName(user.fullName ?? "");
        setEmail(user.email ?? "");
        setDateOfBirth(isoToDateInputValue(user.dateOfBirth));
        setGender(user.gender ?? "");
        setAddress(user.address ?? "");
        setHasWhatsapp(user.hasWhatsapp);
        setExistingImageUrl(user.profileImageUrl);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load your profile.");
      })
      .finally(() => setIsLoadingProfile(false));
  }, [isAuthenticated]);

  // Revokes the previous blob URL (if any) whenever a new file is picked
  // or the component unmounts, so these don't leak.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);
    if (file && !file.type.startsWith("image/")) {
      setError("Profile photo must be an image file");
      return;
    }
    if (file && file.size > MAX_IMAGE_BYTES) {
      setError("Profile photo must be smaller than 8MB");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setProfileFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedNotice(false);

    if (!fullName.trim()) {
      setError("Full name is required");
      return;
    }

    setIsSaving(true);
    try {
      const { user } = await updateProfile(
        {
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          dateOfBirth: dateOfBirth || undefined,
          gender: gender.trim() || undefined,
          address: address.trim() || undefined,
          hasWhatsapp,
        },
        profileFile,
      );
      setExistingImageUrl(user.profileImageUrl);
      setProfileFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSavedNotice(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isAuthLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">
        Loading...
      </main>
    );
  }

  const displayedImage = previewUrl ?? existingImageUrl;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center justify-between">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-foreground">
          ← Account
        </Link>
        <span className="font-display text-2xl tracking-wide text-gold">Your Profile</span>
      </header>

      <div className="mt-6 w-full max-w-sm flex-1">
        {isLoadingProfile && <p className="text-center text-sm text-muted">Loading...</p>}
        {!isLoadingProfile && loadError && (
          <p className="text-center text-sm text-error">{loadError}</p>
        )}

        {!isLoadingProfile && !loadError && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Phone number
              </label>
              <p className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-foreground">
                {user?.phone}
              </p>
              <p className="mt-1 text-xs text-muted">
                Your phone number is tied to your sign-in and can&apos;t be changed here.
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={hasWhatsapp}
                  onChange={(e) => setHasWhatsapp(e.target.checked)}
                  className="h-4 w-4 rounded border-line accent-gold"
                />
                This number has WhatsApp
              </label>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Profile photo
              </label>
              <div className="flex items-center gap-3">
                {displayedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview / arbitrary uploaded URL, not worth next/image's remote-domain config here
                  <img
                    src={displayedImage}
                    alt="Profile"
                    className="h-14 w-14 flex-shrink-0 rounded-full border border-line object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-xs text-muted">
                    No photo
                  </div>
                )}
                <input
                  id="profileImage"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#1a1408]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-foreground">
                Full name
              </label>
              <input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="As you'd like it shown"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label
                htmlFor="dateOfBirth"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Date of birth
              </label>
              <input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="gender" className="mb-1.5 block text-sm font-medium text-foreground">
                Gender
              </label>
              <input
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                placeholder="Optional"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="address" className="mb-1.5 block text-sm font-medium text-foreground">
                Address
              </label>
              <textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Optional"
                rows={3}
                className={INPUT_CLASS}
              />
            </div>

            <ErrorText>{error}</ErrorText>
            {savedNotice && !error && (
              <p className="text-center text-sm text-success">Profile saved ✓</p>
            )}

            <Button type="submit" isLoading={isSaving}>
              {isSaving ? "Saving..." : "Save profile"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
