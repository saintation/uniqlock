const widgetContainer = document.getElementById('widget-container');
const bgVideo = document.getElementById('bg-video');
const bgAudio = document.getElementById('bg-audio');
const viewContainer = document.getElementById('viewContainer');
const time1El = document.querySelector('#time1 .time');
const time2El = document.querySelector('#time2 .time');

let isIdle = false;
let isPlayingVideo = false;
let lastTriggeredSecond = -1;
let lastPlayedVideo = "";
let fadeInterval = null;
let clockTickCount = 0;
let lastTickSecond = -1;

const { appDataDir, join } = window.__TAURI__.path;
const { convertFileSrc, invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

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

async function getLocalAssetPath(relativePath) {
  const dataDir = await appDataDir();
  return await join(dataDir, "external_assets", relativePath);
}

function getTimeOfDay(hour) {
  if (hour >= 6 && hour < 21) {
    return 'day';
  }
  return 'night';
}

function updateThemeAndBackground(timeOfDay) {
  // We no longer change background color on widgetContainer, as viewContainer and video handles it
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
  
  if (bgAudio.muted) return;
  
  bgAudio.volume = 0;
  bgAudio.play().catch(e => console.error("Audio play error:", e));
  
  let currentVolume = 0;
  // Read target volume (might have been changed by tray)
  const targetVolume = parseFloat(bgAudio.dataset.targetVolume || "1.0");
  
  const fadeSteps = 20; 
  const fadeDuration = 1500; 
  const stepTime = fadeDuration / fadeSteps;
  const volumeStep = targetVolume / fadeSteps;

  fadeInterval = setInterval(() => {
    currentVolume += volumeStep;
    if (currentVolume >= targetVolume) {
      bgAudio.volume = targetVolume;
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
    const resourcePath = await getLocalAssetPath(randomVideo);
    bgVideo.src = convertFileSrc(resourcePath);
    
    bgVideo.classList.remove('hidden');
    viewContainer.classList.add('hidden'); // Hide clock when video plays
    isPlayingVideo = true;
    
    bgVideo.play().catch(e => console.error("Video play error:", e));
  } catch (error) {
    console.error("Failed to load video resource:", error);
  }
}

function hideVideo() {
  bgVideo.classList.add('hidden');
  viewContainer.classList.remove('hidden'); // Show clock when video stops
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
      const resourcePath = await getLocalAssetPath(randomAudio);
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

function toggleColors() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const pColor = style.getPropertyValue('--primary-color').trim();
  const sColor = style.getPropertyValue('--secondary-color').trim();
  
  // Swap them
  root.style.setProperty('--primary-color', sColor);
  root.style.setProperty('--secondary-color', pColor);
}

// Clock Logic
function updateClock() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  
  if (s !== lastTickSecond) {
    lastTickSecond = s;
    
    // Animate every second
    if (clockTickCount === 0) {
      viewContainer.className = "overlay top-to-bottom";
    } else if (clockTickCount === 1) {
      viewContainer.className = "overlay right-to-left";
    } else if (clockTickCount === 2) {
      viewContainer.className = "overlay bottom-to-top";
    } else if (clockTickCount === 3) {
      viewContainer.className = "overlay left-to-right";
    }
    
    clockTickCount = (clockTickCount + 1) % 4;
    toggleColors();
  }
  
  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  const timeString = `${hStr}:${mStr}:${sStr}`;
  time1El.textContent = timeString;
  time2El.textContent = timeString;
  
  if (!isIdle) return;
  
  const timeOfDay = getTimeOfDay(h);
  
  // 10-second sync interval check
  if (s % 10 === 0) {
    if (!isPlayingVideo && lastTriggeredSecond !== s) {
      lastTriggeredSecond = s; // Ensure it only fires exactly once for this second
      triggerVideo(timeOfDay);
    }
  }
  
  ensureAudioPlaying(timeOfDay);
}

// Check the clock every 50ms for precise syncing and visual accuracy
setInterval(updateClock, 50);
updateClock();

listen('volume-change', (event) => {
  const targetVolume = event.payload;
  bgAudio.dataset.targetVolume = targetVolume;
  if (targetVolume === 0) {
    bgAudio.muted = true;
  } else {
    bgAudio.muted = false;
    bgAudio.volume = targetVolume;
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

// Initialization and Download Logic
async function initApp() {
  const hasAssets = await invoke("check_assets_exist");
  if (!hasAssets) {
    // Show download prompt
    downloadPrompt.classList.remove('hidden');
  } else {
    // Assets ready
    console.log("Assets are ready locally.");
  }
}

btnNo.addEventListener('click', async () => {
  await invoke("exit_app");
});

btnYes.addEventListener('click', async () => {
  btnYes.disabled = true;
  btnNo.disabled = true;
  downloadStatus.textContent = "Connecting to GitHub...";
  
  const unlisten = await listen('download-progress', (e) => {
    downloadStatus.textContent = e.payload;
  });

  try {
    await invoke("download_and_extract_assets");
    downloadStatus.textContent = "Download complete!";
    setTimeout(() => {
      downloadPrompt.classList.add('hidden');
      unlisten();
    }, 1500);
  } catch (error) {
    downloadStatus.textContent = "Error: " + error;
    downloadStatus.style.color = "#f44336";
    btnYes.disabled = false;
    btnNo.disabled = false;
  }
});

initApp();
