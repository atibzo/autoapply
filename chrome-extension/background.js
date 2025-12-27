// LinkedIn Auto Apply - Background Service Worker

// Import AI Service
importScripts('ai-service.js');

// Bot state
let state = {
  isRunning: false,
  isPaused: false,
  currentTabId: null,
  waitingForInput: false,
  pendingQuestion: null
};

// Stats
let stats = {
  applied: 0,
  skipped: 0,
  failed: 0
};

// Settings (loaded from storage)
let settings = {};

// AI Service instance
let aiService = null;

// Initialize AI service
function initAIService() {
  if (settings.openaiApiKey) {
    aiService = new AIService(settings.openaiApiKey, settings.aiModel || 'gpt-4o-mini');
    log('🤖 AI Service initialized');
  }
}

// Load settings on startup
chrome.storage.local.get(['settings', 'stats'], (result) => {
  if (result.settings) {
    settings = result.settings;
    initAIService();
  }
  if (result.stats) stats = result.stats;
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async operations
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep message channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'start':
      startBot();
      return { success: true };
      
    case 'stop':
      stopBot();
      return { success: true };
      
    case 'pause':
      state.isPaused = true;
      broadcastState();
      return { success: true };
      
    case 'resume':
      state.isPaused = false;
      state.waitingForInput = false;
      broadcastState();
      return { success: true };
      
    case 'getState':
      return state;
      
    case 'getSettings':
      return settings;
      
    case 'settingsUpdated':
      settings = message.settings;
      initAIService();
      return { success: true };
      
    case 'jobApplied':
      stats.applied++;
      saveStats();
      broadcastStats();
      log(`✅ Applied to: ${message.jobTitle} at ${message.company}`);
      return { success: true };
      
    case 'jobSkipped':
      stats.skipped++;
      saveStats();
      broadcastStats();
      log(`⏭️ Skipped: ${message.jobTitle} - ${message.reason}`);
      return { success: true };
      
    case 'jobFailed':
      stats.failed++;
      saveStats();
      broadcastStats();
      log(`❌ Failed: ${message.jobTitle} - ${message.reason}`);
      return { success: true };
      
    case 'log':
      log(message.text);
      return { success: true };
      
    case 'contentScriptReady':
      chrome.tabs.sendMessage(sender.tab.id, { 
        action: 'init', 
        settings: settings,
        state: state
      });
      return { success: true };
    
    // AI-related actions
    case 'testOpenAI':
      return await testOpenAIConnection(message.apiKey);
      
    case 'answerQuestion':
      return await answerQuestionWithAI(message);
      
    case 'generateCoverLetter':
      return await generateCoverLetterWithAI(message);
      
    case 'analyzeJob':
      return await analyzeJobWithAI(message);
      
    case 'provideUserInput':
      // User provided input for a question AI couldn't answer
      state.waitingForInput = false;
      state.pendingQuestion = null;
      broadcastState();
      return { success: true, answer: message.answer };
      
    case 'needUserInput':
      // Content script needs user input
      state.waitingForInput = true;
      state.pendingQuestion = message.question;
      broadcastState();
      log(`⏸️ Need input: ${message.question}`);
      // Show notification
      notify('Input Needed', message.question);
      return { success: true };
      
    default:
      return { success: false, error: 'Unknown action' };
  }
}

// Test OpenAI connection
async function testOpenAIConnection(apiKey) {
  try {
    const testService = new AIService(apiKey);
    const success = await testService.testConnection();
    return { success, error: success ? null : 'Connection failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Answer question using AI
async function answerQuestionWithAI(message) {
  if (!settings.useAI || !aiService) {
    return { success: false, error: 'AI not enabled', needInput: true };
  }
  
  try {
    const answer = await aiService.answerQuestion(message.question, {
      jobDescription: message.jobDescription || '',
      resumeText: settings.resumeText || '',
      questionType: message.questionType || 'text',
      selectOptions: message.options || [],
      additionalInstructions: settings.aiInstructions || ''
    });
    
    // Check if AI couldn't answer
    if (answer.startsWith('NEED_INPUT:')) {
      const reason = answer.replace('NEED_INPUT:', '').trim();
      log(`🤔 AI needs help: ${reason}`);
      return { success: false, needInput: true, reason };
    }
    
    if (settings.showAIThinking) {
      log(`🤖 AI answered "${message.question.substring(0, 50)}..." → "${answer.substring(0, 50)}..."`);
    }
    
    return { success: true, answer };
  } catch (error) {
    log(`❌ AI error: ${error.message}`);
    return { success: false, error: error.message, needInput: true };
  }
}

// Generate cover letter using AI
async function generateCoverLetterWithAI(message) {
  if (!settings.useAI || !aiService) {
    return { success: false, error: 'AI not enabled' };
  }
  
  if (!settings.generateCoverLetter) {
    return { success: false, error: 'Cover letter generation disabled' };
  }
  
  try {
    log(`✍️ Generating cover letter for ${message.jobTitle} at ${message.company}...`);
    
    const coverLetter = await aiService.generateCoverLetter({
      jobTitle: message.jobTitle,
      company: message.company,
      jobDescription: message.jobDescription,
      resumeText: settings.resumeText || '',
      style: settings.coverLetterStyle || 'professional',
      additionalInstructions: settings.aiInstructions || ''
    });
    
    log(`✓ Cover letter generated (${coverLetter.length} chars)`);
    
    return { success: true, coverLetter };
  } catch (error) {
    log(`❌ Cover letter error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Analyze job description using AI
async function analyzeJobWithAI(message) {
  if (!settings.useAI || !aiService) {
    return { success: false, error: 'AI not enabled' };
  }
  
  try {
    const analysis = await aiService.analyzeJobDescription(
      message.jobDescription,
      settings.resumeText || ''
    );
    
    if (analysis && settings.showAIThinking) {
      log(`📊 Job match score: ${analysis.matchScore}%`);
    }
    
    return { success: true, analysis };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

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
