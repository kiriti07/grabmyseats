This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Native app (Capacitor)

`android/` and `ios/` are native shell projects wrapping this same Next.js
app - they don't bundle a build of it. Instead, the native WebView is
pointed at a real running instance of it (local dev or deployed), set via
`CAPACITOR_SERVER_URL` in `.env.local` (see `capacitor.config.ts` and
`.env.example` for the full explanation, including the right value per
platform/emulator/device). If that variable is unset, it defaults to the
deployed production frontend.

To open the native projects after changing `capacitor.config.ts`,
`.env.local`, or `resources/icon.png`/`resources/splash.png`:

```bash
npx cap sync          # re-copies config into both native projects
npx cap open android  # requires Android Studio
npx cap open ios      # requires Xcode (macOS only)
```

To regenerate every platform-specific icon/splash size from the source
files in `resources/`:

```bash
npx capacitor-assets generate
```
