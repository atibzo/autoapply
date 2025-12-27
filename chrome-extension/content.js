// LinkedIn Auto Apply - Content Script
// This script runs on LinkedIn job pages and handles the actual automation

console.log('LinkedIn Auto Apply content script loaded');

// State
let isRunning = false;
let settings = {};
let currentJobIndex = 0;
let appliedCount = 0;

// Notify background script that we're ready
chrome.runtime.sendMessage({ action: 'contentScriptReady' });

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'init':
      settings = message.settings || {};
      sendResponse({ success: true });
      break;
      
    case 'startApplying':
      settings = message.settings || {};
      startApplying();
      sendResponse({ success: true });
      break;
      
    case 'stopApplying':
      stopApplying();
      sendResponse({ success: true });
      break;
      
    case 'pageLoaded':
      settings = message.settings || {};
      if (message.state?.isRunning) {
        // Resume after page navigation
        setTimeout(() => startApplying(), 2000);
      }
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Start the application process
async function startApplying() {
  if (isRunning) return;
  
  isRunning = true;
  currentJobIndex = 0;
  log('Starting job application process...');
  
  try {
    // Apply filters first
    await applyFilters();
    
    // Wait for jobs to load
    await sleep(2000);
    
    // Start processing jobs
    await processJobs();
    
  } catch (error) {
    log(`Error: ${error.message}`);
    console.error(error);
  }
  
  isRunning = false;
  log('Application process completed');
}

// Stop the application process
function stopApplying() {
  isRunning = false;
  log('Stopping...');
}

// Apply search filters
async function applyFilters() {
  log('Applying filters...');
  
  // Click Easy Apply filter if enabled
  if (settings.easyApplyOnly !== false) {
    const easyApplyBtn = document.getElementById('searchFilter_applyWithLinkedin');
    if (easyApplyBtn && easyApplyBtn.getAttribute('aria-checked') === 'false') {
      easyApplyBtn.click();
      log('✓ Easy Apply filter enabled');
      await sleep(1500);
    }
  }
  
  // Apply date filter
  if (settings.datePosted && settings.datePosted !== 'any') {
    await applyDateFilter(settings.datePosted);
  }
  
  await sleep(1000);
}

// Apply date posted filter
async function applyDateFilter(dateOption) {
  const dateBtn = document.getElementById('searchFilter_timePostedRange');
  if (!dateBtn) return;
  
  dateBtn.click();
  await sleep(500);
  
  const dateMap = {
    'day': 'Past 24 hours',
    'week': 'Past week',
    'month': 'Past month'
  };
  
  const targetText = dateMap[dateOption];
  if (!targetText) return;
  
  // Find and click the option
  const labels = document.querySelectorAll('label.search-reusables__value-label');
  for (const label of labels) {
    if (label.textContent.includes(targetText)) {
      label.click();
      await sleep(300);
      
      // Click Show results
      const showBtn = document.querySelector('button[data-test-reusables-filters-modal-show-results-button]') ||
                      [...document.querySelectorAll('button')].find(b => b.textContent.includes('Show'));
      if (showBtn) showBtn.click();
      
      log(`✓ Date filter set to: ${targetText}`);
      break;
    }
  }
  
  await sleep(1000);
}

// Process all jobs on the page
async function processJobs() {
  const maxApps = settings.maxApplications || 50;
  
  while (isRunning && appliedCount < maxApps) {
    // Get all job listings
    const jobCards = document.querySelectorAll('li[data-occludable-job-id]');
    
    if (jobCards.length === 0) {
      log('No jobs found on this page');
      break;
    }
    
    log(`Found ${jobCards.length} jobs on this page`);
    
    // Process each job
    for (let i = currentJobIndex; i < jobCards.length && isRunning; i++) {
      if (appliedCount >= maxApps) {
        log(`Reached max applications limit (${maxApps})`);
        break;
      }
      
      currentJobIndex = i;
      const jobCard = jobCards[i];
      
      try {
        await processJob(jobCard);
      } catch (error) {
        log(`Error processing job: ${error.message}`);
        console.error(error);
      }
      
      // Delay between jobs
      const delay = (settings.delayBetween || 3) * 1000;
      await sleep(delay);
    }
    
    // Try to go to next page
    if (isRunning && appliedCount < maxApps) {
      const hasNextPage = await goToNextPage();
      if (!hasNextPage) {
        log('No more pages');
        break;
      }
      currentJobIndex = 0;
      await sleep(2000);
    }
  }
}

// Process a single job
async function processJob(jobCard) {
  // Get job info
  const jobId = jobCard.getAttribute('data-occludable-job-id');
  const titleElement = jobCard.querySelector('a.job-card-container__link');
  const companyElement = jobCard.querySelector('.artdeco-entity-lockup__subtitle');
  
  const jobTitle = titleElement?.textContent?.trim()?.split('\n')[0] || 'Unknown';
  const company = companyElement?.textContent?.trim()?.split(' · ')[0] || 'Unknown';
  
  log(`Processing: ${jobTitle} at ${company}`);
  
  // Check if already applied
  const appliedBadge = jobCard.querySelector('.job-card-container__footer-job-state');
  if (appliedBadge?.textContent?.includes('Applied')) {
    chrome.runtime.sendMessage({
      action: 'jobSkipped',
      jobTitle,
      company,
      reason: 'Already applied'
    });
    return;
  }
  
  // Check for bad words
  if (shouldSkipJob(jobTitle, company)) {
    chrome.runtime.sendMessage({
      action: 'jobSkipped',
      jobTitle,
      company,
      reason: 'Contains excluded words'
    });
    return;
  }
  
  // Click on job to view details
  titleElement?.click();
  await sleep(1500);
  
  // Get job description
  const description = document.querySelector('.jobs-description')?.textContent || '';
  
  // Set context for AI
  currentJobContext = {
    title: jobTitle,
    company: company,
    description: description,
    previousAnswers: {}
  };
  
  // Analyze job with AI if enabled
  if (settings.useAI && description && settings.showAIThinking) {
    try {
      const analysis = await chrome.runtime.sendMessage({
        action: 'analyzeJob',
        jobDescription: description
      });
      if (analysis.success && analysis.analysis) {
        log(`📊 Match score: ${analysis.analysis.matchScore}%`);
      }
    } catch (error) {
      // Non-critical, continue anyway
    }
  }
  
  // Check experience requirements
  if (!checkExperienceRequirements(description)) {
    chrome.runtime.sendMessage({
      action: 'jobSkipped',
      jobTitle,
      company,
      reason: 'Experience requirements too high'
    });
    return;
  }
  
  // Find Easy Apply button
  const easyApplyBtn = document.querySelector('button.jobs-apply-button');
  
  if (!easyApplyBtn || !easyApplyBtn.textContent.includes('Easy Apply')) {
    chrome.runtime.sendMessage({
      action: 'jobSkipped',
      jobTitle,
      company,
      reason: 'No Easy Apply button'
    });
    return;
  }
  
  // Click Easy Apply
  easyApplyBtn.click();
  await sleep(1500);
  
  // Fill out application
  const success = await fillApplication();
  
  if (success) {
    appliedCount++;
    chrome.runtime.sendMessage({
      action: 'jobApplied',
      jobTitle,
      company,
      jobId
    });
  } else {
    // Close modal if open
    closeModal();
    chrome.runtime.sendMessage({
      action: 'jobFailed',
      jobTitle,
      company,
      reason: 'Could not complete application'
    });
  }
}

// Check if job should be skipped based on settings
function shouldSkipJob(title, company) {
  const badWords = (settings.badWords || '').split(',').map(w => w.trim().toLowerCase()).filter(w => w);
  const badCompanies = (settings.badCompanies || '').split(',').map(w => w.trim().toLowerCase()).filter(w => w);
  
  const titleLower = title.toLowerCase();
  const companyLower = company.toLowerCase();
  
  // Check bad words in title
  for (const word of badWords) {
    if (titleLower.includes(word)) {
      return true;
    }
  }
  
  // Check bad companies
  for (const badCompany of badCompanies) {
    if (companyLower.includes(badCompany)) {
      return true;
    }
  }
  
  return false;
}

// Check experience requirements
function checkExperienceRequirements(description) {
  const maxExp = settings.maxExperience || 10;
  const expMatch = description.match(/(\d+)\+?\s*(?:years?|yrs?)/i);
  
  if (expMatch) {
    const required = parseInt(expMatch[1]);
    if (required > maxExp) {
      return false;
    }
  }
  
  return true;
}

// Fill out application form
async function fillApplication() {
  const maxSteps = 10;
  let step = 0;
  
  while (step < maxSteps && isRunning) {
    step++;
    
    // Check for modal
    const modal = document.querySelector('.jobs-easy-apply-modal');
    if (!modal) {
      await sleep(500);
      continue;
    }
    
    // Fill form fields
    await fillFormFields(modal);
    
    // Check for submit button
    const submitBtn = modal.querySelector('button[aria-label*="Submit"]') ||
                      [...modal.querySelectorAll('button')].find(b => b.textContent.includes('Submit'));
    
    if (submitBtn) {
      // Check for pause before submit
      if (settings.pauseBeforeSubmit) {
        log('⏸️ Pausing before submit - please review and submit manually');
        return false;
      }
      
      submitBtn.click();
      await sleep(1000);
      
      // Check for success (Done button or confirmation)
      const doneBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Done'));
      if (doneBtn) {
        doneBtn.click();
        return true;
      }
      
      // Check if modal closed (success)
      if (!document.querySelector('.jobs-easy-apply-modal')) {
        return true;
      }
    }
    
    // Check for Next/Review button
    const nextBtn = modal.querySelector('button[aria-label*="Continue"]') ||
                    modal.querySelector('button[aria-label*="Next"]') ||
                    modal.querySelector('button[aria-label*="Review"]') ||
                    [...modal.querySelectorAll('button')].find(b => 
                      b.textContent.includes('Next') || 
                      b.textContent.includes('Continue') ||
                      b.textContent.includes('Review')
                    );
    
    if (nextBtn) {
      nextBtn.click();
      await sleep(1000);
    } else {
      // No button found, might be stuck
      await sleep(500);
    }
  }
  
  return false;
}

// Current job context for AI
let currentJobContext = {
  title: '',
  company: '',
  description: '',
  previousAnswers: {}
};

// Fill form fields in the modal using AI when needed
async function fillFormFields(modal) {
  // Get all form elements
  const formElements = modal.querySelectorAll('input, textarea, select, fieldset');
  
  for (const element of formElements) {
    try {
      await fillFormElement(element, modal);
    } catch (error) {
      log(`Error filling field: ${error.message}`);
    }
  }
}

// Fill a single form element
async function fillFormElement(element, modal) {
  const tagName = element.tagName.toLowerCase();
  
  // Get the label/question for this element
  const label = getElementLabel(element);
  if (!label) return;
  
  const labelLower = label.toLowerCase();
  
  // Skip if already filled
  if (tagName === 'input' || tagName === 'textarea') {
    if (element.value && element.value.trim()) return;
  }
  
  // Try to answer using predefined values first
  let answer = getPredefinedAnswer(labelLower);
  
  // If no predefined answer and AI is enabled, ask AI
  if (!answer && settings.useAI) {
    answer = await getAIAnswer(label, element, modal);
  }
  
  // Apply the answer
  if (answer) {
    await applyAnswer(element, answer, tagName);
    currentJobContext.previousAnswers[label] = answer;
  }
}

// Get the label/question text for an element
function getElementLabel(element) {
  // Try various methods to find the label
  const container = element.closest('.fb-form-element, .form-group, .jobs-easy-apply-form-element, div[data-test-form-element]');
  
  if (container) {
    const labelEl = container.querySelector('label, .fb-form-element-label, span.visually-hidden');
    if (labelEl) return labelEl.textContent.trim();
  }
  
  // Try aria-label
  if (element.getAttribute('aria-label')) {
    return element.getAttribute('aria-label');
  }
  
  // Try placeholder
  if (element.placeholder) {
    return element.placeholder;
  }
  
  // For fieldsets (radio groups)
  if (element.tagName === 'FIELDSET') {
    const legend = element.querySelector('legend, span[data-test-form-builder-radio-button-form-component__title]');
    if (legend) return legend.textContent.trim();
  }
  
  return null;
}

// Get predefined answer from settings
function getPredefinedAnswer(labelLower) {
  // Phone number
  if (labelLower.includes('phone') || labelLower.includes('mobile')) {
    return settings.phoneNumber || null;
  }
  
  // LinkedIn
  if (labelLower.includes('linkedin') || labelLower.includes('profile url')) {
    return settings.linkedinUrl || null;
  }
  
  // Website / Portfolio
  if (labelLower.includes('website') || labelLower.includes('portfolio') || labelLower.includes('personal site') || labelLower.includes('github')) {
    return settings.websiteUrl || null;
  }
  
  // Years of experience
  if (labelLower.includes('experience') && labelLower.includes('year')) {
    return settings.yearsExperience?.toString() || '5';
  }
  
  // Name (from resume - first line often)
  if (labelLower.includes('first name') || labelLower.includes('last name') || labelLower.includes('full name')) {
    // This should come from resume or AI
    return null;
  }
  
  return null;
}

// Get answer from AI
async function getAIAnswer(question, element, modal) {
  const tagName = element.tagName.toLowerCase();
  let questionType = 'text';
  let options = [];
  
  // Determine question type
  if (tagName === 'textarea') {
    questionType = 'textarea';
  } else if (tagName === 'select') {
    questionType = 'select';
    options = [...element.querySelectorAll('option')].map(o => o.textContent.trim()).filter(o => o && !o.includes('Select'));
  } else if (tagName === 'fieldset') {
    questionType = 'radio';
    options = [...element.querySelectorAll('label')].map(l => l.textContent.trim());
  } else if (element.type === 'checkbox') {
    questionType = 'checkbox';
  }
  
  // Check if this is a cover letter field
  if (question.toLowerCase().includes('cover letter') || question.toLowerCase().includes('why') && question.toLowerCase().includes('company')) {
    if (settings.generateCoverLetter) {
      return await getCoverLetter();
    }
  }
  
  // Ask AI
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'answerQuestion',
      question: question,
      questionType: questionType,
      options: options,
      jobDescription: currentJobContext.description
    });
    
    if (response.success) {
      return response.answer;
    }
    
    // AI couldn't answer - need user input
    if (response.needInput && settings.pauseForUnknown) {
      return await askUserForInput(question, questionType, options);
    }
    
    return null;
  } catch (error) {
    log(`AI error for "${question}": ${error.message}`);
    return null;
  }
}

// Get cover letter from AI
async function getCoverLetter() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateCoverLetter',
      jobTitle: currentJobContext.title,
      company: currentJobContext.company,
      jobDescription: currentJobContext.description
    });
    
    if (response.success) {
      if (settings.pauseForCoverLetter) {
        // Show cover letter for review
        return await reviewCoverLetter(response.coverLetter);
      }
      return response.coverLetter;
    }
    
    return null;
  } catch (error) {
    log(`Cover letter error: ${error.message}`);
    return null;
  }
}

// Show input dialog for user
async function askUserForInput(question, type, options) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'linkedin-auto-apply-input-dialog';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100000;
  `;
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  `;
  
  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px; color: #0a66c2;">🤖 AI needs your help</h3>
    <p style="margin: 0 0 16px; color: #333;">${question}</p>
    ${type === 'select' || type === 'radio' 
      ? `<select id="user-input-select" style="width: 100%; padding: 10px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px;">
          ${options.map(o => `<option value="${o}">${o}</option>`).join('')}
         </select>`
      : type === 'textarea'
        ? `<textarea id="user-input-text" style="width: 100%; height: 150px; padding: 10px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Enter your answer..."></textarea>`
        : `<input type="text" id="user-input-text" style="width: 100%; padding: 10px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Enter your answer...">`
    }
    <div style="display: flex; gap: 10px;">
      <button id="user-input-submit" style="flex: 1; padding: 12px; background: #0a66c2; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Submit</button>
      <button id="user-input-skip" style="padding: 12px 20px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer;">Skip</button>
    </div>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // Notify that we're waiting
  chrome.runtime.sendMessage({ action: 'needUserInput', question });
  
  return new Promise((resolve) => {
    const inputEl = dialog.querySelector('#user-input-text') || dialog.querySelector('#user-input-select');
    
    dialog.querySelector('#user-input-submit').addEventListener('click', () => {
      const answer = inputEl.value;
      overlay.remove();
      chrome.runtime.sendMessage({ action: 'provideUserInput', answer });
      resolve(answer);
    });
    
    dialog.querySelector('#user-input-skip').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
    
    // Focus input
    inputEl.focus();
  });
}

// Review cover letter before submitting
async function reviewCoverLetter(coverLetter) {
  const overlay = document.createElement('div');
  overlay.id = 'linkedin-auto-apply-cover-letter-review';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100000;
  `;
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
  `;
  
  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px; color: #0a66c2;">✍️ Review Cover Letter</h3>
    <p style="margin: 0 0 8px; color: #666; font-size: 14px;">For: ${currentJobContext.title} at ${currentJobContext.company}</p>
    <textarea id="cover-letter-text" style="width: 100%; height: 300px; padding: 12px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 4px; font-family: inherit;">${coverLetter}</textarea>
    <div style="display: flex; gap: 10px;">
      <button id="cover-letter-use" style="flex: 1; padding: 12px; background: #0a66c2; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Use This</button>
      <button id="cover-letter-regenerate" style="padding: 12px 20px; background: #057642; color: white; border: none; border-radius: 6px; cursor: pointer;">🔄 Regenerate</button>
      <button id="cover-letter-skip" style="padding: 12px 20px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer;">Skip</button>
    </div>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  return new Promise((resolve) => {
    const textarea = dialog.querySelector('#cover-letter-text');
    
    dialog.querySelector('#cover-letter-use').addEventListener('click', () => {
      overlay.remove();
      resolve(textarea.value);
    });
    
    dialog.querySelector('#cover-letter-regenerate').addEventListener('click', async () => {
      textarea.value = 'Generating new cover letter...';
      const newLetter = await getCoverLetter();
      textarea.value = newLetter || coverLetter;
    });
    
    dialog.querySelector('#cover-letter-skip').addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
  });
}

// Apply answer to form element
async function applyAnswer(element, answer, tagName) {
  if (tagName === 'input' || tagName === 'textarea') {
    element.value = answer;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (tagName === 'select') {
    // Find matching option
    const options = [...element.querySelectorAll('option')];
    const matchingOption = options.find(o => 
      o.textContent.toLowerCase().includes(answer.toLowerCase()) ||
      answer.toLowerCase().includes(o.textContent.toLowerCase())
    );
    if (matchingOption) {
      element.value = matchingOption.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else if (tagName === 'fieldset') {
    // Radio buttons
    const labels = [...element.querySelectorAll('label')];
    for (const label of labels) {
      if (label.textContent.toLowerCase().includes(answer.toLowerCase())) {
        const input = element.querySelector(`input[id="${label.getAttribute('for')}"]`) || label.querySelector('input');
        if (input) {
          input.click();
          break;
        }
      }
    }
  }
  
  await sleep(200); // Small delay after filling
}

// Close the application modal
function closeModal() {
  const closeBtn = document.querySelector('.jobs-easy-apply-modal button[aria-label="Dismiss"]') ||
                   document.querySelector('.artdeco-modal__dismiss');
  if (closeBtn) {
    closeBtn.click();
  }
  
  // Also try clicking discard if prompted
  setTimeout(() => {
    const discardBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Discard'));
    if (discardBtn) discardBtn.click();
  }, 500);
}

// Go to next page
async function goToNextPage() {
  const paginationContainer = document.querySelector('.jobs-search-pagination, .artdeco-pagination');
  if (!paginationContainer) return false;
  
  const currentPage = paginationContainer.querySelector('button[aria-current="true"], button.active');
  const currentPageNum = parseInt(currentPage?.textContent) || 1;
  
  const nextPageBtn = paginationContainer.querySelector(`button[aria-label="Page ${currentPageNum + 1}"]`);
  if (nextPageBtn) {
    nextPageBtn.click();
    log(`Going to page ${currentPageNum + 1}`);
    return true;
  }
  
  return false;
}

// Utility: Sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Utility: Log
function log(text) {
  chrome.runtime.sendMessage({ action: 'log', text });
  console.log(`[LinkedIn Auto Apply] ${text}`);
}

// Add visual indicator that extension is active
function addIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'linkedin-auto-apply-indicator';
  indicator.innerHTML = '🤖';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    background: #0a66c2;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    z-index: 10000;
    cursor: pointer;
  `;
  indicator.title = 'LinkedIn Auto Apply is active';
  indicator.onclick = () => {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  };
  document.body.appendChild(indicator);
}

// Initialize
addIndicator();
