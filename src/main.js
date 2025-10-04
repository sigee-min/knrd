import { initializeGame } from './game/app.js';

initializeGame().catch((error) => {
  console.error('Failed to initialize game', error);
});
