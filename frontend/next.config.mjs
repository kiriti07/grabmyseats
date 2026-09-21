/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
    // next/image refuses local SVGs by default (they can carry scripts) -
    // needed for the Brilliant Eight logo in the login footer
    // (public/images/brilliant-eight-logo.svg). The CSP below is Next's
    // own recommended mitigation: it still runs the file through the
    // image optimizer, but strips any ability for embedded SVG script/
    // interactivity to execute.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
