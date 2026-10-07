// Short-lived preview credentials are applied only to the requested origin.
// Supply VERCEL_OIDC_TOKEN through a local, ignored environment file.
export async function authenticatePreview(page, url) {
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) return;
  const origin = new URL(url).origin;
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) return route.continue();
    return route.continue({ headers: { ...route.request().headers(), 'x-vercel-trusted-oidc-idp-token': token } });
  });
}
