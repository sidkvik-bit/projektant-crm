import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sidebar has its own controls fixed to the bottom-left corner (theme toggle) — keep the
  // dev-only Next.js indicator out of the way instead of stacking on top of them.
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
