// Every first race shows the "First race setup" screen (section.mn-screen--onboarding) right after
// "Start time trial", on desktop and touch alike, until `onboarded` is saved. A touch device that
// has not answered is then asked once how to steer (src/ui/screens/steer-onboarding.ts).
// Scripts that start a race call acceptFirstRaceSetup(page) right after clicking "Start time
// trial" (desktop), or answerSteerQuestion(page) (any device): it accepts the setup screen first
// (two steps: Next on the level step, then Start on the camera and graphics step; the step change
// is synchronous), then answers the steering question with Finger when it is showing. Both do
// nothing when their screen is not showing (already answered, or a desktop for the steering
// question).
export async function acceptFirstRaceSetup(page) {
  const next = page.locator('.mn-screen--onboarding:not([hidden]) [data-onboarding-next]');
  if (await next.count()) await next.click();
  const start = page.locator('.mn-screen--onboarding:not([hidden]) [data-onboarding-start]');
  if (await start.count()) await start.click();
}

export async function answerSteerQuestion(page) {
  await acceptFirstRaceSetup(page);
  const finger = page.locator('.mn-screen--steer:not([hidden]) [data-steer-choice="drag"]');
  if (await finger.count()) await finger.click();
}
