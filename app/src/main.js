const widgetContainer = document.getElementById('widget-container');
const bgVideo = document.getElementById('bg-video');
const bgAudio = document.getElementById('bg-audio');
const viewContainer = document.getElementById('viewContainer');
const time1El = document.querySelector('#time1 .time');
const time2El = document.querySelector('#time2 .time');
const missingWarning = document.getElementById('missing-warning');


let isIdle = false;
let isPlayingVideo = false;
let lastTriggeredSecond = -1;
let lastPlayedVideo = "";
let fadeInterval = null;
let clockTickCount = 0;
let lastTickSecond = -1;

const { convertFileSrc, invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

const colorPalette = [
  "#ED1D24", "#FFA801", "#F1BB3F", "#4FB335", "#3386C8",
  "#4499BE", "#A6A6FE", "#6BD7D7", "#FF8CC7", "#88BF01",
  "#B3D6FE", "#EFD000", "#FBBC4A", "#F2914A", "#01B1ED"
];

let currentBgColor = '#FFFFFF';
let currentTextColor = '#ED1D24';

let mediaAssets = {
  day_videos: [],
  day_audio: [],
  night_videos: [],
  night_audio: [],
  hour_videos: []
};

async function checkAndLoadMedia() {
  mediaAssets = await invoke("get_media_list");
  if (mediaAssets.day_videos.length === 0 && mediaAssets.night_videos.length === 0) {
    missingWarning.classList.remove('hidden');
  } else {
    missingWarning.classList.add('hidden');
  }
}
checkAndLoadMedia();

async function getLocalAssetPath(relativePath) {
  return await invoke("get_asset_path", { filename: relativePath });
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
  let vids = timeOfDay === 'day' ? mediaAssets.day_videos : mediaAssets.night_videos;
  if (timeOfDay === 'hour') {
    vids = mediaAssets.hour_videos;
    if (!vids || vids.length === 0) {
      vids = getTimeOfDay(new Date().getHours()) === 'day' ? mediaAssets.day_videos : mediaAssets.night_videos;
    }
  }
  if (!vids || vids.length === 0) return;
  const randomVideo = getRandomItem(vids, lastPlayedVideo);
  lastPlayedVideo = randomVideo;
  
  try {
    const resourcePath = await getLocalAssetPath(randomVideo);
    bgVideo.src = convertFileSrc(resourcePath);
    
    bgVideo.classList.remove('hidden');
    isPlayingVideo = true;
    
    bgVideo.play().catch(e => {
      console.error("Video play error:", e);
      isPlayingVideo = false;
      bgVideo.classList.add('hidden');
    });
  } catch (error) {
    console.error("Failed to load video resource:", error);
    isPlayingVideo = false;
    bgVideo.classList.add('hidden');
  }
}

function hideVideo() {
  bgVideo.classList.add('hidden');
  isPlayingVideo = false;
  bgVideo.pause();
}

bgVideo.addEventListener('ended', () => {
  hideVideo();
});

async function ensureAudioPlaying(timeOfDay) {
  if (bgAudio.paused && isIdle) {
    const auds = timeOfDay === 'day' ? mediaAssets.day_audio : mediaAssets.night_audio;
    if (!auds || auds.length === 0) return;
    const randomAudio = getRandomItem(auds);
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

let currentState = { bg: '#FFFFFF', text: '#ED1D24' };
let oldState = { bg: '#FFFFFF', text: '#ED1D24' };

// Initialize styles
time1El.parentElement.style.backgroundColor = currentState.bg;
time1El.parentElement.style.color = currentState.text;
time2El.parentElement.style.backgroundColor = currentState.bg;
time2El.parentElement.style.color = currentState.text;

function toggleColors(wipeDirection) {
  const t1 = time1El.parentElement;
  const t2 = time2El.parentElement;
  
  // Decide next state
  if (currentState.bg === '#FFFFFF') {
    oldState = { ...currentState };
    currentState = { bg: currentState.text, text: '#FFFFFF' };
  } else {
    oldState = { ...currentState };
    currentState = { bg: '#FFFFFF', text: getRandomItem(colorPalette, oldState.bg) };
  }
  
  // Apply depending on wipe direction
  if (wipeDirection === 'out') {
    // t2 is disappearing, t1 is being revealed.
    // t2 MUST keep old state. t1 gets NEW state.
    t2.style.backgroundColor = oldState.bg;
    t2.style.color = oldState.text;
    t1.style.backgroundColor = currentState.bg;
    t1.style.color = currentState.text;
  } else {
    // t2 is appearing, t1 is being covered.
    // t2 gets NEW state. t1 MUST keep old state.
    t2.style.backgroundColor = currentState.bg;
    t2.style.color = currentState.text;
    t1.style.backgroundColor = oldState.bg;
    t1.style.color = oldState.text;
  }
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
      toggleColors('out');
    } else if (clockTickCount === 1) {
      viewContainer.className = "overlay right-to-left";
      toggleColors('in');
    } else if (clockTickCount === 2) {
      viewContainer.className = "overlay bottom-to-top";
      toggleColors('out');
    } else if (clockTickCount === 3) {
      viewContainer.className = "overlay left-to-right";
      toggleColors('in');
    }
    clockTickCount = (clockTickCount + 1) % 4;
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
      if (m === 0 && s === 0) {
        triggerVideo('hour');
      } else {
        triggerVideo(timeOfDay);
      }
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
    checkAndLoadMedia().then(() => {
      widgetContainer.classList.remove('hidden');
      const timeOfDay = getTimeOfDay(new Date().getHours());
      updateThemeAndBackground(timeOfDay);
      ensureAudioPlaying(timeOfDay);
    });
  } else {
    // Wake up! 
    widgetContainer.classList.add('hidden');
    hideVideo();
    bgAudio.pause();
    lastTriggeredSecond = -1;
  }
});

function hideWindowIfNotIdle() {
  if (!isIdle) {
    invoke("hide_window");
  }
}


