const path = require("path")
const { PHASE_PRODUCTION_BUILD } = require("next/constants")
const checkEnvVariables = require("./check-env-variables")

/**
 * Medusa Cloud-related environment variables
 */
const S3_HOSTNAME = process.env.MEDUSA_CLOUD_S3_HOSTNAME
const S3_PATHNAME = process.env.MEDUSA_CLOUD_S3_PATHNAME

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: "*.s3.*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.s3.amazonaws.com",
      },
      // Bamoer reference photos, hotlinked for local development only.
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/files/1/1013/3304/1466/files/**",
      },
      ...(S3_HOSTNAME && S3_PATHNAME
        ? [
            {
              protocol: "https",
              hostname: S3_HOSTNAME,
              pathname: S3_PATHNAME,
            },
          ]
        : []),
    ],
  },
}

// The production image is built without a key and reads it at runtime.
module.exports = (phase) => {
  if (phase !== PHASE_PRODUCTION_BUILD) {
    checkEnvVariables()
  }
  return nextConfig
}
