import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A csatolmányokat (CV, ajánlólevél) semmi nem importálja a kódból, ezért a
  // fájlkövetés nem tenné be a serverless csomagba — a telepített példány üres
  // mappát látna. Ezzel a route-ok mellé kerülnek.
  outputFileTracingIncludes: {
    "/api/contacts/*": ["./attachments/**/*"],
  },
};

export default nextConfig;
