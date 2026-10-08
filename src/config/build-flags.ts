// Build-time flags, set by vite.config.ts from Vercel's VERCEL_ENV.

declare const __DEV_TOOLS__: boolean | undefined;
declare const __USAGE_ANALYTICS__: boolean | undefined;

/** Vercel Web Analytics page views and the race/lap events in src/game/usage-analytics.ts; production deployment only. */
export const USAGE_ANALYTICS: boolean = typeof __USAGE_ANALYTICS__ === 'undefined' ? false : __USAGE_ANALYTICS__;

/**
 * Dev tools (Settings > Handling tab, the live graphics tuner). On for local builds
 * and Vercel preview deployments; off for the Vercel production deployment.
 */
export const DEV_TOOLS: boolean = typeof __DEV_TOOLS__ === 'undefined' ? true : __DEV_TOOLS__;
