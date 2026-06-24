let overlay = null;
let timerEl = null;
let liveTimerEl = null;

function createOverlay(text, showTimer, duration) {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.id = 'focen-overlay';

  const heading = document.createElement('h1');
  heading.textContent = text;
  overlay.appendChild(heading);

  if (showTimer) {
    timerEl = document.createElement('div');
    timerEl.id = 'focen-timer';
    timerEl.textContent = duration;
    overlay.appendChild(timerEl);

    let left = duration;
    const interval = setInterval(() => {
      left--;
      if (left <= 0) {
        clearInterval(interval);
        if (overlay) overlay.remove();
        overlay = null;
        chrome.runtime.sendMessage({ type: 'START_TRACKING' });
      } else {
        timerEl.textContent = left;
      }
    }, 1000);
  } else {
    const sub = document.createElement('p');
    sub.textContent = "This website is currently blocked by Focen.";
    overlay.appendChild(sub);
  }

  if (document.body) {
    document.body.appendChild(overlay);
  } else {
    document.documentElement.appendChild(overlay);
  }
}

function enforceBlock(text, showTimer, duration) {
  if (document.body || document.documentElement) {
    createOverlay(text, showTimer, duration);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      createOverlay(text, showTimer, duration);
    });
  }
}

function updateLiveTimer(text) {
  if (!liveTimerEl) {
    liveTimerEl = document.createElement('div');
    liveTimerEl.id = 'focen-live-timer';
    if (document.body) {
      document.body.appendChild(liveTimerEl);
    } else {
      document.documentElement.appendChild(liveTimerEl);
    }
  }
  liveTimerEl.textContent = text;
}

function removeLiveTimer() {
  if (liveTimerEl) {
    liveTimerEl.remove();
    liveTimerEl = null;
  }
}

chrome.runtime.sendMessage({ type: 'CHECK_URL' }, (response) => {
  if (!response) return;

  if (response.shouldBlock) {
    enforceBlock("Website Blocked", false);
  } else if (response.preBlock) {
    enforceBlock(response.preBlockText || "Breathe in...", true, response.preBlockDuration || 10);
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        chrome.runtime.sendMessage({ type: 'START_TRACKING' });
      });
    } else {
      chrome.runtime.sendMessage({ type: 'START_TRACKING' });
    }
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'BLOCK') {
    removeLiveTimer();
    enforceBlock("Time Limit Reached", false);
  } else if (message.type === 'TICK') {
    updateLiveTimer(message.timeText);
  } else if (message.type === 'HIDE_TICK') {
    removeLiveTimer();
  }
});
