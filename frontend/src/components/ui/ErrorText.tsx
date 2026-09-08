export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-error">
      {children}
    </p>
  );
}
