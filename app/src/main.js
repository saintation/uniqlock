const widgetContainer = document.getElementById('widget-container');
const bgVideo = document.getElementById('bg-video');
const bgAudio = document.getElementById('bg-audio');
const clockDisplay = document.getElementById('clock-display');
const muteBtn = document.getElementById('mute-btn');
const iconMuted = document.getElementById('icon-muted');
const iconUnmuted = document.getElementById('icon-unmuted');

let isIdle = false;
let isPlayingVideo = false;

const RAW_URL_BASE = "https://raw.githubusercontent.com/saintation/uniqlock/0b6d31c3ac8baaeb800df17418cd0c37909a9698/reference/assets/";

// Grouped by Day (06:00 - 20:59) and Night (21:00 - 05:59)
const mediaAssets = {
  day: {
    videos: [
      "videos/Season 2/Season 2 - Day - 21.webm",
      "videos/Season 4/Season 4 - Day - 22.webm"
    ],
    audio: [
      "music/00 - Season 1.ogg",
      "music/01 - Season 1.ogg",
      "music/04 - Season 2.ogg",
      "music/05 - Season 3.ogg",
      "music/09 - Season 5.ogg"
    ]
  },
  night: {
    videos: [
      "videos/Season 4/Season 4 - Night - 32.webm",
      "videos/Season 2/Season 2 - Night - 15.webm",
      "videos/Season 4/Season 4 - Night - 05.webm"
    ],
    audio: [
      "music/Night - 01 - Season 2.ogg",
      "music/Night - 02 - Season 4.ogg"
    ]
  }
};

function getTimeOfDay(hour) {
  if (hour >= 6 && hour < 21) {
    return 'day';
  }
  return 'night';
}

function updateThemeAndBackground(timeOfDay) {
  if (timeOfDay === 'day') {
    widgetContainer.classList.add('day-bg');
    widgetContainer.classList.remove('night-bg');
  } else {
    widgetContainer.classList.add('night-bg');
    widgetContainer.classList.remove('day-bg');
  }
}

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function triggerVideo(timeOfDay) {
  const randomVideo = getRandomItem(mediaAssets[timeOfDay].videos);
  bgVideo.src = RAW_URL_BASE + randomVideo;
  
  bgVideo.classList.remove('hidden');
  isPlayingVideo = true;
  
  bgVideo.play().catch(e => console.error("Video play error:", e));
}

function hideVideo() {
  bgVideo.classList.add('hidden');
  isPlayingVideo = false;
  bgVideo.pause();
}

bgVideo.addEventListener('ended', () => {
  hideVideo();
});

function ensureAudioPlaying(timeOfDay) {
  if (bgAudio.paused && isIdle) {
    const randomAudio = getRandomItem(mediaAssets[timeOfDay].audio);
    bgAudio.src = RAW_URL_BASE + randomAudio;
    bgAudio.play().catch(e => console.error("Audio play error:", e));
  }
}

bgAudio.addEventListener('ended', () => {
  if (isIdle) {
    const now = new Date();
    ensureAudioPlaying(getTimeOfDay(now.getHours()));
  }
});

// Clock Logic
function updateClock() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  
  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  clockDisplay.textContent = `${hStr}:${mStr}:${sStr}`;
  
  if (!isIdle) return;
  
  const timeOfDay = getTimeOfDay(h);
  updateThemeAndBackground(timeOfDay);
  
  // 10-second sync interval check
  if (s % 10 === 0 && !isPlayingVideo) {
    triggerVideo(timeOfDay);
  }
  
  ensureAudioPlaying(timeOfDay);
}

// Check the clock every 250ms for precise syncing
setInterval(updateClock, 250);
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
  isIdle = event.payload;

  if (isIdle) {
    // Go Idle! 
    widgetContainer.classList.remove('hidden');
    
    // We do NOT trigger video immediately unless it's a 10s mark.
    // updateClock will handle it.
    
    // Start audio right away
    const timeOfDay = getTimeOfDay(new Date().getHours());
    updateThemeAndBackground(timeOfDay);
    ensureAudioPlaying(timeOfDay);
  } else {
    // Wake up! 
    widgetContainer.classList.add('hidden');
    hideVideo();
    bgAudio.pause();
  }
});
