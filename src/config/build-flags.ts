// Build-time flags, set by vite.config.ts from Vercel's VERCEL_ENV.

declare const __DEV_TOOLS__: boolean | undefined;

/**
 * Dev tools (Settings > Handling tab, the live graphics tuner). On for local builds
 * and Vercel preview deployments; off for the Vercel production deployment.
 */
export const DEV_TOOLS: boolean = typeof __DEV_TOOLS__ === 'undefined' ? true : __DEV_TOOLS__;
