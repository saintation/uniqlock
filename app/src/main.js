const widgetContainer = document.getElementById('widget-container');
const bgVideo = document.getElementById('bg-video');
const bgAudio = document.getElementById('bg-audio');
const clockDisplay = document.getElementById('clock-display');
const muteBtn = document.getElementById('mute-btn');
const iconMuted = document.getElementById('icon-muted');
const iconUnmuted = document.getElementById('icon-unmuted');

let isIdle = false;
let isPlayingVideo = false;
let lastTriggeredSecond = -1;
let lastPlayedVideo = "";
let fadeInterval = null;

const { resolveResource } = window.__TAURI__.path;
const { convertFileSrc } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// Grouped by Day (06:00 - 20:59) and Night (21:00 - 05:59)
const mediaAssets = {
  day: {
    videos: [
      "external_assets/videos/Season 2/Season 2 - Day - 21.webm",
      "external_assets/videos/Season 4/Season 4 - Day - 22.webm"
    ],
    audio: [
      "external_assets/music/00 - Season 1.ogg",
      "external_assets/music/01 - Season 1.ogg",
      "external_assets/music/04 - Season 2.ogg",
      "external_assets/music/05 - Season 3.ogg",
      "external_assets/music/09 - Season 5.ogg"
    ]
  },
  night: {
    videos: [
      "external_assets/videos/Season 4/Season 4 - Night - 32.webm",
      "external_assets/videos/Season 2/Season 2 - Night - 15.webm",
      "external_assets/videos/Season 4/Season 4 - Night - 05.webm"
    ],
    audio: [
      "external_assets/music/Night - 01 - Season 2.ogg",
      "external_assets/music/Night - 02 - Season 4.ogg"
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

function getRandomItem(arr, ignoreItem) {
  if (arr.length <= 1) return arr[0];
  let picked = arr[Math.floor(Math.random() * arr.length)];
  while (picked === ignoreItem) {
    picked = arr[Math.floor(Math.random() * arr.length)];
  }
  return picked;
}

function fadeInAudio() {
  if (fadeInterval) clearInterval(fadeInterval);
  
  // Only fade if not muted
  if (bgAudio.muted) return;
  
  bgAudio.volume = 0;
  bgAudio.play().catch(e => console.error("Audio play error:", e));
  
  let currentVolume = 0;
  const fadeSteps = 20; // 20 steps
  const fadeDuration = 1500; // 1.5 seconds
  const stepTime = fadeDuration / fadeSteps;
  const volumeStep = 1.0 / fadeSteps;

  fadeInterval = setInterval(() => {
    currentVolume += volumeStep;
    if (currentVolume >= 1) {
      bgAudio.volume = 1;
      clearInterval(fadeInterval);
      fadeInterval = null;
    } else {
      bgAudio.volume = currentVolume;
    }
  }, stepTime);
}

async function triggerVideo(timeOfDay) {
  const randomVideo = getRandomItem(mediaAssets[timeOfDay].videos, lastPlayedVideo);
  lastPlayedVideo = randomVideo;
  
  try {
    const resourcePath = await resolveResource(randomVideo);
    bgVideo.src = convertFileSrc(resourcePath);
    
    bgVideo.classList.remove('hidden');
    clockDisplay.classList.add('hidden'); // Hide clock when video plays
    isPlayingVideo = true;
    
    bgVideo.play().catch(e => console.error("Video play error:", e));
  } catch (error) {
    console.error("Failed to load video resource:", error);
  }
}

function hideVideo() {
  bgVideo.classList.add('hidden');
  clockDisplay.classList.remove('hidden'); // Show clock when video stops
  isPlayingVideo = false;
  bgVideo.pause();
}

bgVideo.addEventListener('ended', () => {
  hideVideo();
});

async function ensureAudioPlaying(timeOfDay) {
  if (bgAudio.paused && isIdle) {
    const randomAudio = getRandomItem(mediaAssets[timeOfDay].audio);
    try {
      const resourcePath = await resolveResource(randomAudio);
      bgAudio.src = convertFileSrc(resourcePath);
      fadeInAudio();
    } catch (error) {
      console.error("Failed to load audio resource:", error);
    }
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
  if (s % 10 === 0) {
    if (!isPlayingVideo && lastTriggeredSecond !== s) {
      lastTriggeredSecond = s; // Ensure it only fires exactly once for this second
      triggerVideo(timeOfDay);
    }
  }
  
  ensureAudioPlaying(timeOfDay);
}

// Check the clock every 250ms for precise syncing
setInterval(updateClock, 250);
updateClock();

// Mute Button Logic
muteBtn.addEventListener('click', () => {
  isMuted = !bgAudio.muted;
  bgAudio.muted = isMuted;
  
  if (isMuted) {
    iconUnmuted.classList.add('hidden');
    iconMuted.classList.remove('hidden');
    if (fadeInterval) clearInterval(fadeInterval);
  } else {
    iconMuted.classList.add('hidden');
    iconUnmuted.classList.remove('hidden');
    bgAudio.volume = 1; // restore volume immediately on unmute
  }
});

listen('idle-state-changed', (event) => {
  isIdle = event.payload;

  if (isIdle) {
    // Go Idle! 
    widgetContainer.classList.remove('hidden');
    
    const timeOfDay = getTimeOfDay(new Date().getHours());
    updateThemeAndBackground(timeOfDay);
    ensureAudioPlaying(timeOfDay);
  } else {
    // Wake up! 
    widgetContainer.classList.add('hidden');
    hideVideo();
    bgAudio.pause();
    lastTriggeredSecond = -1;
  }
});
