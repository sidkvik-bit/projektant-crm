"use client";

import dynamic from "next/dynamic";

// mapbox-gl touches window/DOM at import time — must not run during SSR. `ssr: false` on
// next/dynamic only works from inside a Client Component (Server Components error on it),
// hence this thin wrapper instead of dynamic-importing straight from page.tsx.
export const ProjectLocationMap = dynamic(
  () => import("./ProjectLocationMap").then((mod) => mod.ProjectLocationMap),
  { ssr: false, loading: () => <div className="h-80 w-full animate-pulse rounded-lg border bg-muted/30" /> },
);
