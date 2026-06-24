import { storage } from './storage.js';

let activeTabId = null;
let activeTabHostname = null;

const tabReadyStates = {};

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return null;
  }
}

async function updateTime() {
  if (!activeTabHostname) return;
  
  if (!tabReadyStates[activeTabId]) return;
  
  const stats = await storage.getStats();
  const today = new Date().toDateString();
  
  if (stats.date !== today) {
    stats.date = today;
    stats.timeSpent = {};
    stats.refractoryEnds = {};
    
    const groups = await storage.getGroups();
    let updatedGroups = false;
    groups.forEach(g => {
      if (g.settings.disabledUntilTomorrow) {
        g.settings.disabledUntilTomorrow = false;
        g.isActive = true;
        updatedGroups = true;
      }
    });
    if (updatedGroups) await storage.saveGroups(groups);
  }

  if (!stats.timeSpent[activeTabHostname]) {
    stats.timeSpent[activeTabHostname] = 0;
  }
  stats.timeSpent[activeTabHostname] += 1; 
  
  await storage.saveStats(stats);
  
  const action = await evaluateUrl(activeTabHostname, stats);
  if (action.shouldBlock) {
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { type: 'BLOCK', action }).catch(()=>{});
    }
  } else if (action.timeLeft !== undefined) {
    if (activeTabId) {
      const mins = Math.floor(action.timeLeft / 60);
      const secs = action.timeLeft % 60;
      const text = `${mins}:${secs.toString().padStart(2, '0')}`;
      chrome.tabs.sendMessage(activeTabId, { type: 'TICK', timeText: text }).catch(()=>{});
    }
  } else {
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { type: 'HIDE_TICK' }).catch(()=>{});
    }
  }
}

setInterval(updateTime, 1000);

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  activeTabId = activeInfo.tabId;
  const tab = await chrome.tabs.get(activeTabId);
  activeTabHostname = getHostname(tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    activeTabHostname = getHostname(changeInfo.url);
  }
  if (changeInfo.status === 'loading') {
    tabReadyStates[tabId] = false;
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    activeTabHostname = null;
  } else {
    const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
    if (tabs.length > 0) {
      activeTabId = tabs[0].id;
      activeTabHostname = getHostname(tabs[0].url);
    }
  }
});

async function evaluateUrl(hostname, stats) {
  if (!hostname) return { shouldBlock: false };
  const groups = await storage.getGroups();
  
  let strictestAction = { shouldBlock: false };
  let priority = 0; 

  for (const group of groups) {
    if (!group.isActive || group.settings.disabledUntilTomorrow) continue;
    
    const matches = group.websites.some(w => hostname.includes(w));
    if (!matches) continue;

    const set = group.settings;
    const timeSpent = stats.timeSpent[hostname] || 0;
    const refractoryEnd = stats.refractoryEnds[hostname] || 0;

    let action = { shouldBlock: false };
    let currentPriority = 0;

    if (set.mode === 'always_block') {
      action = { shouldBlock: true, reason: 'always_block' };
      currentPriority = 3;
    } else if (set.mode === 'allow_time') {
      const allowedSecs = (set.dailyAllowance || 0) * 60;
      if (timeSpent >= allowedSecs) {
        action = { shouldBlock: true, reason: 'time_limit_reached' };
        currentPriority = 2;
      } else {
        action = { shouldBlock: false, timeLeft: allowedSecs - timeSpent };
        currentPriority = 1;
      }
    } else if (set.mode === 'allow_periods') {
      const allowedSecs = (set.dailyAllowance || 0) * 60;
      const periodSecs = (set.periodLength || 0) * 60;
      const refractorySecs = (set.refractoryPeriod || 0) * 60;
      
      if (timeSpent >= allowedSecs) {
        action = { shouldBlock: true, reason: 'time_limit_reached' };
        currentPriority = 2;
      } else {
        if (Date.now() < refractoryEnd) {
          action = { shouldBlock: true, reason: 'refractory_period' };
          currentPriority = 3;
        } else if ((timeSpent > 0) && (timeSpent % periodSecs === 0)) {
          stats.refractoryEnds[hostname] = Date.now() + (refractorySecs * 1000);
          action = { shouldBlock: true, reason: 'refractory_started' };
          currentPriority = 3;
          storage.saveStats(stats); 
        } else {
          const sessionTimeLeft = periodSecs - (timeSpent % periodSecs);
          const globalTimeLeft = allowedSecs - timeSpent;
          action = { shouldBlock: false, timeLeft: Math.min(sessionTimeLeft, globalTimeLeft) };
          currentPriority = 1;
        }
      }
    }

    if (currentPriority > priority) {
      priority = currentPriority;
      strictestAction = action;
      
      if (!action.shouldBlock && set.preBlockScreen) {
        strictestAction.preBlock = true;
        strictestAction.preBlockText = set.preBlockText;
        strictestAction.preBlockDuration = set.preBlockDuration;
      }
    }
  }

  return strictestAction;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHECK_URL') {
    const hostname = getHostname(sender.tab.url);
    storage.getStats().then(stats => {
      evaluateUrl(hostname, stats).then(action => {
        sendResponse(action);
      });
    });
    return true; 
  } else if (message.type === 'START_TRACKING') {
    tabReadyStates[sender.tab.id] = true;
  }
});
