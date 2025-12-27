// LinkedIn Auto Apply - Background Service Worker

// Bot state
let state = {
  isRunning: false,
  isPaused: false,
  currentTabId: null
};

// Stats
let stats = {
  applied: 0,
  skipped: 0,
  failed: 0
};

// Settings (loaded from storage)
let settings = {};

// Load settings on startup
chrome.storage.local.get(['settings', 'stats'], (result) => {
  if (result.settings) settings = result.settings;
  if (result.stats) stats = result.stats;
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'start':
      startBot();
      sendResponse({ success: true });
      break;
      
    case 'stop':
      stopBot();
      sendResponse({ success: true });
      break;
      
    case 'pause':
      state.isPaused = true;
      broadcastState();
      sendResponse({ success: true });
      break;
      
    case 'resume':
      state.isPaused = false;
      broadcastState();
      sendResponse({ success: true });
      break;
      
    case 'getState':
      sendResponse(state);
      break;
      
    case 'getSettings':
      sendResponse(settings);
      break;
      
    case 'settingsUpdated':
      settings = message.settings;
      sendResponse({ success: true });
      break;
      
    case 'jobApplied':
      stats.applied++;
      saveStats();
      broadcastStats();
      log(`✅ Applied to: ${message.jobTitle} at ${message.company}`);
      sendResponse({ success: true });
      break;
      
    case 'jobSkipped':
      stats.skipped++;
      saveStats();
      broadcastStats();
      log(`⏭️ Skipped: ${message.jobTitle} - ${message.reason}`);
      sendResponse({ success: true });
      break;
      
    case 'jobFailed':
      stats.failed++;
      saveStats();
      broadcastStats();
      log(`❌ Failed: ${message.jobTitle} - ${message.reason}`);
      sendResponse({ success: true });
      break;
      
    case 'log':
      log(message.text);
      sendResponse({ success: true });
      break;
      
    case 'contentScriptReady':
      // Content script loaded, send settings
      chrome.tabs.sendMessage(sender.tab.id, { 
        action: 'init', 
        settings: settings,
        state: state
      });
      sendResponse({ success: true });
      break;
  }
  
  return true; // Keep message channel open for async response
});

// Start the bot
async function startBot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url.includes('linkedin.com/jobs')) {
    log('⚠️ Please navigate to LinkedIn Jobs first');
    return;
  }
  
  state.isRunning = true;
  state.isPaused = false;
  state.currentTabId = tab.id;
  
  // Load latest settings
  const result = await chrome.storage.local.get('settings');
  settings = result.settings || {};
  
  broadcastState();
  log('🚀 Bot started');
  
  // Send start command to content script
  chrome.tabs.sendMessage(tab.id, { 
    action: 'startApplying',
    settings: settings
  });
}

// Stop the bot
function stopBot() {
  state.isRunning = false;
  state.isPaused = false;
  
  if (state.currentTabId) {
    chrome.tabs.sendMessage(state.currentTabId, { action: 'stopApplying' });
  }
  
  broadcastState();
  log('🛑 Bot stopped');
}

// Save stats to storage
function saveStats() {
  chrome.storage.local.set({ stats });
}

// Broadcast state to popup
function broadcastState() {
  chrome.runtime.sendMessage({ action: 'stateUpdate', state }).catch(() => {});
}

// Broadcast stats to popup
function broadcastStats() {
  chrome.runtime.sendMessage({ action: 'statsUpdate', stats }).catch(() => {});
}

// Log message
function log(text) {
  chrome.runtime.sendMessage({ action: 'log', text }).catch(() => {});
  console.log(`[LinkedIn Auto Apply] ${text}`);
}

// Listen for tab updates (to detect navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (state.isRunning && tabId === state.currentTabId) {
    if (changeInfo.status === 'complete' && tab.url.includes('linkedin.com/jobs')) {
      // Page loaded, re-inject content script behavior
      chrome.tabs.sendMessage(tabId, { 
        action: 'pageLoaded',
        settings: settings,
        state: state
      }).catch(() => {});
    }
  }
});

// Create notification
function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message
  });
}

// Listen for keyboard shortcuts
chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'toggle-bot') {
    if (state.isRunning) {
      stopBot();
    } else {
      startBot();
    }
  }
});

console.log('LinkedIn Auto Apply background script loaded');
