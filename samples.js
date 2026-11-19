// A visitor should never hear two samples at once, especially on mobile.
const players = [...document.querySelectorAll('audio')];
players.forEach(player => player.addEventListener('play', () => {
  players.forEach(other => { if (other !== player && !other.paused) other.pause(); });
}));
