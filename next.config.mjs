/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma is a server-only dependency; keep it external to the server bundle
  // so the generated query engine is loaded at runtime rather than bundled.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
