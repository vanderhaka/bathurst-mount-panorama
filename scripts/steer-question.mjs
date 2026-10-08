// A touch device is asked once how to steer when its first time trial starts
// (src/ui/screens/steer-onboarding.ts). Scripts that start a race on a touch context call
// this right after tapping "Start time trial": it answers with Finger when the question is
// showing, and does nothing when it is not (already answered, or a desktop).
export async function answerSteerQuestion(page) {
  const finger = page.locator('.mn-screen--steer:not([hidden]) [data-steer-choice="drag"]');
  if (await finger.count()) await finger.click();
}
