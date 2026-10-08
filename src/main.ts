import { Game } from '@/game/game';
import { installAndroidPresentation } from '@/phone/android-presentation';
import { installTouchGuards } from '@/input/touch-guards';
import { ACTIVE_CIRCUIT, CIRCUITS } from '@/track/circuits';

if (ACTIVE_CIRCUIT !== 'bathurst') document.title = `${CIRCUITS[ACTIVE_CIRCUIT].name} — Gen3 time trial`;

declare global {
  interface Window { __game?: Game; __shotReady?: boolean }
}

const root = document.getElementById('game');
const showError = (message: string) => {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.style.display = 'grid';
  el.textContent = message;
};

if (!root) {
  showError('Game container missing.');
} else if (!document.createElement('canvas').getContext('webgl2')) {
  showError('This game needs WebGL 2. Please use a current version of Chrome, Edge, Firefox or Safari.');
} else {
  installTouchGuards(root);
  installAndroidPresentation(root);
  let running: Game | null = null;
  // iOS can drop the WebGL context when the phone runs short of memory: stop the race and offer a reload.
  root.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running?.halt();
    showError('The graphics stopped because the device ran short of memory. Tap to reload. If this happens again, set Settings > Graphics quality to Low.');
    document.getElementById('boot-error')?.addEventListener('click', () => location.reload(), { once: true });
  }, true);
  Game.create(root)
    .then((game) => {
      running = game;
      window.__game = game;
      window.__shotReady = true;
    })
    .catch((err: unknown) => {
      console.error('Failed to start the game', err);
      showError('The game failed to start. Reload the page to try again.');
    });
}
