import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse@2.x wraps pdfjs-dist, which loads a sibling pdf.worker.mjs file
  // at runtime relative to its own module location. Turbopack/webpack bundle
  // pdfjs-dist into a hashed chunk without copying that sibling file, causing
  // "Setting up fake worker failed: Cannot find module ...pdf.worker.mjs".
  // Marking these as external keeps them resolved via native Node require/
  // import against the real node_modules layout instead of being bundled.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;
