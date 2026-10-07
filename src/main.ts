import { Game } from '@/game/game';

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
  Game.create(root)
    .then((game) => {
      window.__game = game;
      window.__shotReady = true;
    })
    .catch((err: unknown) => {
      console.error('Failed to start the game', err);
      showError('The game failed to start. Reload the page to try again.');
    });
}
