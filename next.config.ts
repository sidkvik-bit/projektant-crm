import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sidebar has its own controls fixed to the bottom-left corner (theme toggle) — keep the
  // dev-only Next.js indicator out of the way instead of stacking on top of them.
  // OAuth discovery musí ležet na /.well-known/… (tam ho klienti hledají), ale samotné handlery
  // chceme mít u ostatních API rout. Cesty s příponou pokrývají klienty, co za well-known lepí
  // ještě cestu ke zdroji (RFC 9728 to připouští).
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata/authorization-server" },
      { source: "/.well-known/openid-configuration", destination: "/api/oauth/metadata/authorization-server" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/metadata/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/metadata/protected-resource" },
    ];
  },

  devIndicators: {
    position: "bottom-right",
  },
  experimental: {
    serverActions: {
      // Drive file uploads below RESUMABLE_UPLOAD_THRESHOLD_BYTES go through the multipart
      // server action — leave headroom above that threshold for multipart/form-data overhead.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
