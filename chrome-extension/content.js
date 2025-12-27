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

// Fill form fields in the modal
async function fillFormFields(modal) {
  // Text inputs
  const textInputs = modal.querySelectorAll('input[type="text"]');
  for (const input of textInputs) {
    if (input.value) continue; // Already filled
    
    const label = input.closest('.form-group, .fb-form-element')?.querySelector('label')?.textContent?.toLowerCase() || '';
    
    if (label.includes('phone') || label.includes('mobile')) {
      input.value = settings.phoneNumber || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (label.includes('linkedin') || label.includes('profile')) {
      input.value = settings.linkedinUrl || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (label.includes('experience') || label.includes('years')) {
      input.value = settings.yearsExperience || '5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  
  // Number inputs
  const numberInputs = modal.querySelectorAll('input[type="number"]');
  for (const input of numberInputs) {
    if (input.value) continue;
    
    const label = input.closest('.form-group, .fb-form-element')?.querySelector('label')?.textContent?.toLowerCase() || '';
    
    if (label.includes('experience') || label.includes('years')) {
      input.value = settings.yearsExperience || '5';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  
  // Select dropdowns
  const selects = modal.querySelectorAll('select');
  for (const select of selects) {
    if (select.value && select.value !== 'Select an option') continue;
    
    // Try to select first valid option
    const options = select.querySelectorAll('option');
    for (const option of options) {
      if (option.value && option.value !== '' && !option.textContent.includes('Select')) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }
  
  // Radio buttons - select first option if none selected
  const radioGroups = modal.querySelectorAll('fieldset[data-test-form-builder-radio-button-form-component]');
  for (const group of radioGroups) {
    const selected = group.querySelector('input[type="radio"]:checked');
    if (!selected) {
      const firstRadio = group.querySelector('input[type="radio"]');
      if (firstRadio) {
        firstRadio.click();
      }
    }
  }
  
  // Checkboxes - check required ones
  const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
  for (const checkbox of checkboxes) {
    if (!checkbox.checked) {
      // Check if it seems required (terms, agreements)
      const label = checkbox.closest('label, .form-group')?.textContent?.toLowerCase() || '';
      if (label.includes('agree') || label.includes('terms') || label.includes('acknowledge')) {
        checkbox.click();
      }
    }
  }
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
