// LinkedIn Auto Apply - Popup Script

// Default settings
const defaultSettings = {
  searchKeywords: 'Product Manager, Software Engineer',
  searchLocation: 'Worldwide',
  datePosted: 'week',
  easyApplyOnly: true,
  pauseBeforeSubmit: false,
  maxApplications: 50,
  delayBetween: 3,
  badWords: 'senior, lead, principal, director, clearance, polygraph',
  badCompanies: '',
  maxExperience: 10,
  yearsExperience: 5,
  phoneNumber: '',
  linkedinUrl: ''
};

// Stats
let stats = {
  applied: 0,
  skipped: 0,
  failed: 0
};

// Bot state
let botState = {
  isRunning: false,
  isPaused: false
};

// DOM Elements
const elements = {
  startBtn: null,
  stopBtn: null,
  statusIndicator: null,
  statusText: null,
  appliedCount: null,
  skippedCount: null,
  failedCount: null,
  logArea: null
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Cache DOM elements
  elements.startBtn = document.getElementById('startBtn');
  elements.stopBtn = document.getElementById('stopBtn');
  elements.statusIndicator = document.getElementById('statusIndicator');
  elements.statusText = document.getElementById('statusText');
  elements.appliedCount = document.getElementById('appliedCount');
  elements.skippedCount = document.getElementById('skippedCount');
  elements.failedCount = document.getElementById('failedCount');
  elements.logArea = document.getElementById('logArea');
  
  // Load saved settings
  await loadSettings();
  
  // Load stats
  await loadStats();
  
  // Get current bot state
  await getBotState();
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up tabs
  setupTabs();
});

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get('settings');
  const settings = result.settings || defaultSettings;
  
  // Populate form fields
  document.getElementById('searchKeywords').value = settings.searchKeywords || '';
  document.getElementById('searchLocation').value = settings.searchLocation || '';
  document.getElementById('datePosted').value = settings.datePosted || 'week';
  document.getElementById('easyApplyOnly').checked = settings.easyApplyOnly !== false;
  document.getElementById('pauseBeforeSubmit').checked = settings.pauseBeforeSubmit === true;
  document.getElementById('maxApplications').value = settings.maxApplications || 50;
  document.getElementById('delayBetween').value = settings.delayBetween || 3;
  document.getElementById('badWords').value = settings.badWords || '';
  document.getElementById('badCompanies').value = settings.badCompanies || '';
  document.getElementById('maxExperience').value = settings.maxExperience || 10;
  document.getElementById('yearsExperience').value = settings.yearsExperience || 5;
  document.getElementById('phoneNumber').value = settings.phoneNumber || '';
  document.getElementById('linkedinUrl').value = settings.linkedinUrl || '';
}

// Save settings to storage
async function saveSettings() {
  const settings = {
    searchKeywords: document.getElementById('searchKeywords').value,
    searchLocation: document.getElementById('searchLocation').value,
    datePosted: document.getElementById('datePosted').value,
    easyApplyOnly: document.getElementById('easyApplyOnly').checked,
    pauseBeforeSubmit: document.getElementById('pauseBeforeSubmit').checked,
    maxApplications: parseInt(document.getElementById('maxApplications').value) || 50,
    delayBetween: parseInt(document.getElementById('delayBetween').value) || 3,
    badWords: document.getElementById('badWords').value,
    badCompanies: document.getElementById('badCompanies').value,
    maxExperience: parseInt(document.getElementById('maxExperience').value) || 10,
    yearsExperience: parseInt(document.getElementById('yearsExperience').value) || 5,
    phoneNumber: document.getElementById('phoneNumber').value,
    linkedinUrl: document.getElementById('linkedinUrl').value
  };
  
  await chrome.storage.local.set({ settings });
  addLog('✓ Settings saved');
  
  // Notify background script
  chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });
}

// Load stats from storage
async function loadStats() {
  const result = await chrome.storage.local.get('stats');
  stats = result.stats || { applied: 0, skipped: 0, failed: 0 };
  updateStatsDisplay();
}

// Update stats display
function updateStatsDisplay() {
  elements.appliedCount.textContent = stats.applied;
  elements.skippedCount.textContent = stats.skipped;
  elements.failedCount.textContent = stats.failed;
}

// Get bot state from background script
async function getBotState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getState' });
    if (response) {
      botState = response;
      updateUI();
    }
  } catch (e) {
    console.log('Could not get bot state:', e);
  }
}

// Update UI based on bot state
function updateUI() {
  if (botState.isRunning) {
    elements.statusIndicator.className = 'status-indicator running';
    elements.statusText.textContent = botState.isPaused ? 'Paused' : 'Running...';
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
  } else {
    elements.statusIndicator.className = 'status-indicator stopped';
    elements.statusText.textContent = 'Stopped';
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
  }
}

// Set up event listeners
function setupEventListeners() {
  // Start button
  elements.startBtn.addEventListener('click', async () => {
    // Check if on LinkedIn jobs page
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('linkedin.com/jobs')) {
      addLog('⚠️ Please navigate to LinkedIn Jobs first');
      addLog('Opening LinkedIn Jobs...');
      
      // Get search keywords
      const keywords = document.getElementById('searchKeywords').value || 'Product Manager';
      const location = document.getElementById('searchLocation').value || '';
      const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}`;
      
      chrome.tabs.update(tab.id, { url: searchUrl });
      return;
    }
    
    // Save settings first
    await saveSettings();
    
    // Start the bot
    chrome.runtime.sendMessage({ action: 'start' });
    botState.isRunning = true;
    updateUI();
    addLog('▶ Bot started');
  });
  
  // Stop button
  elements.stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stop' });
    botState.isRunning = false;
    updateUI();
    addLog('⏹ Bot stopped');
  });
  
  // Save settings button
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  
  // Clear logs button
  document.getElementById('clearLogs').addEventListener('click', () => {
    elements.logArea.textContent = 'Logs cleared\n';
    chrome.storage.local.set({ logs: [] });
  });
}

// Set up tabs
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active content
      contents.forEach(c => c.classList.remove('active'));
      document.getElementById(targetId).classList.add('active');
    });
  });
}

// Add log entry
function addLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${message}\n`;
  elements.logArea.textContent += logEntry;
  elements.logArea.scrollTop = elements.logArea.scrollHeight;
  
  // Save to storage
  chrome.storage.local.get('logs', (result) => {
    const logs = result.logs || [];
    logs.push({ timestamp, message });
    // Keep only last 100 logs
    if (logs.length > 100) logs.shift();
    chrome.storage.local.set({ logs });
  });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'log') {
    addLog(message.text);
  } else if (message.action === 'statsUpdate') {
    stats = message.stats;
    updateStatsDisplay();
  } else if (message.action === 'stateUpdate') {
    botState = message.state;
    updateUI();
  }
});

// Load logs from storage
async function loadLogs() {
  const result = await chrome.storage.local.get('logs');
  const logs = result.logs || [];
  elements.logArea.textContent = logs.map(l => `[${l.timestamp}] ${l.message}`).join('\n') || 'Waiting to start...';
}

// Load logs on init
loadLogs();
