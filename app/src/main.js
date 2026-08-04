const widgetContainer = document.getElementById('widget-container');
const bgVideo = document.getElementById('bg-video');
const bgAudio = document.getElementById('bg-audio');
const clockDisplay = document.getElementById('clock-display');
const muteBtn = document.getElementById('mute-btn');
const iconMuted = document.getElementById('icon-muted');
const iconUnmuted = document.getElementById('icon-unmuted');

let isIdle = false;
let idleTimer = null;
const IDLE_TIMEOUT = 5000; // 5 seconds for testing (usually 60000)

// Sample media list
const videoList = [
  "assets/videos/Season 2/Season 2 - Day - 21.webm",
  "assets/videos/Season 4/Season 4 - Night - 32.webm",
  "assets/videos/Season 4/Season 4 - Day - 22.webm",
  "assets/videos/Season 2/Season 2 - Night - 15.webm",
  "assets/videos/Season 4/Season 4 - Night - 05.webm"
];

const audioList = [
  "assets/music/00 - Season 1.ogg",
  "assets/music/01 - Season 1.ogg",
  "assets/music/04 - Season 2.ogg",
  "assets/music/Night - 01 - Season 2.ogg",
  "assets/music/05 - Season 3.ogg",
  "assets/music/Night - 02 - Season 4.ogg",
  "assets/music/09 - Season 5.ogg"
];

function setRandomMedia() {
  const randomVideo = videoList[Math.floor(Math.random() * videoList.length)];
  const randomAudio = audioList[Math.floor(Math.random() * audioList.length)];
  
  bgVideo.src = randomVideo;
  bgAudio.src = randomAudio;
}

// Initial set
setRandomMedia();

// Clock Logic
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  clockDisplay.textContent = `${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// Mute Button Logic
let isMuted = false;
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  bgAudio.muted = isMuted;
  
  if (isMuted) {
    iconUnmuted.classList.add('hidden');
    iconMuted.classList.remove('hidden');
  } else {
    iconMuted.classList.add('hidden');
    iconUnmuted.classList.remove('hidden');
  }
});

const { listen } = window.__TAURI__.event;

listen('idle-state-changed', (event) => {
  const isIdleNow = event.payload;
  isIdle = isIdleNow;

  if (isIdle) {
    // Go Idle! Randomize media, fade in, play media
    setRandomMedia();
    widgetContainer.classList.remove('hidden');
    bgVideo.play().catch(e => console.error("Video play error:", e));
    bgAudio.play().catch(e => console.error("Audio play error:", e));
  } else {
    // Wake up! (Fade out, pause media)
    widgetContainer.classList.add('hidden');
    bgVideo.pause();
    bgAudio.pause();
  }
});
