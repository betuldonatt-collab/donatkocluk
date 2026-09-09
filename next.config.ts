import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  devIndicators: false,
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // org/project/authToken are all optional here on purpose: without them
  // (local dev, a PR build without the secret) the plugin just skips
  // source map upload instead of failing the build.
  silent: true,
  widenClientFileUpload: true,
});
