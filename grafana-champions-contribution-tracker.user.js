// ==UserScript==
// @name         Grafana Champions Contribution Tracker
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Add a persistent status button to GitHub PR pages that opens and auto-fills a Google Form for Grafana Champions contribution tracking
// @author       jkroepke
// @match        https://github.com/*/pull/*
// @match        https://docs.google.com/forms/d/1jXzr-*/*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @downloadURL  https://github.com/jkroepke/grafana-champions-contribution-tracker/raw/refs/heads/main/grafana-champions-contribution-tracker.user.js
// @updateURL    https://github.com/jkroepke/grafana-champions-contribution-tracker/raw/refs/heads/main/grafana-champions-contribution-tracker.user.js
// @supportURL   https://github.com/jkroepke/grafana-champions-contribution-tracker
// @homepageURL  https://github.com/jkroepke/grafana-champions-contribution-tracker
// ==/UserScript==

(function() {
    'use strict';

    // Google Form URL base
    const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/1jXzr-B7FxUQ-5l674C4cYY6_Zhueq9ytZk40QakkqFo/viewform?edit_requested=true';
    
    // Storage key prefix for localStorage
    const STORAGE_PREFIX = 'github-pr-status-';
    
    // Personal Information
    const PERSONAL_INFO = {
        name: 'Jan-Otto Kröpke',
        email: 'mail@jkroepke.de',
        login: 'jkroepke'
    };

    // Button states
    const BUTTON_STATES = {
        DEFAULT: {
            color: '#d1242f',
            hoverColor: '#b91c1c',
            text: '✗',
            title: 'Mark as reviewed and open form'
        },
        MARKED: {
            color: '#2ea043',
            hoverColor: '#2c974b',
            text: '✓',
            title: 'Mark as not reviewed'
        }
    };

    // Function to get current UTC date in YYYY-MM-DD format
    function getCurrentUTCDate() {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Function to get current UTC date and time in YYYY-MM-DD HH:MM:SS format
    function getCurrentUTCDateTime() {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        const hours = String(now.getUTCHours()).padStart(2, '0');
        const minutes = String(now.getUTCMinutes()).padStart(2, '0');
        const seconds = String(now.getUTCSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // Function to clean PR URL (remove everything after #)
    function cleanPRUrl(url) {
        return url.split('#')[0];
    }

    // Function to get PR number from URL hash
    function getPRNumberFromHash() {
        const hash = window.location.hash;
        const match = hash.match(/#pr-(\d+)/);
        return match ? match[1] : null;
    }

    // Function to check if we're on the Google Form
    function isGoogleForm() {
        return window.location.href.includes('docs.google.com/forms/d/1jXzr-B7FxUQ-5l674C4cYY6_Zhueq9ytZk40QakkqFo');
    }

    // Function to get current PR identifier
    function getCurrentPRId() {
        const match = window.location.pathname.match(/^\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
        if (match) {
            const [, owner, repo, prNumber] = match;
            return `${owner}/${repo}/pull/${prNumber}`;
        }
        return null;
    }

    // Function to extract PR information with better title detection
    function getPRInfo() {
        const prId = getCurrentPRId();
        if (!prId) return null;

        // Try multiple selectors to get PR title
        let prTitle = '';
        
        // Try different selectors for PR title
        const titleSelectors = [
            'h1.gh-header-title .js-issue-title',
            'h1.gh-header-title span',
            '.gh-header-title .js-issue-title',
            '.gh-header-title span',
            'h1 .js-issue-title',
            'h1 span',
            '[data-hovercard-type="pull_request"] .js-issue-title'
        ];
        
        for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                prTitle = element.textContent.trim();
                console.log(`Found PR title using selector "${selector}": "${prTitle}"`);
                break;
            }
        }
        
        // Fallback: try to get title from page title
        if (!prTitle) {
            const pageTitle = document.title;
            const match = pageTitle.match(/^(.+?) · Pull Request #\d+/);
            if (match) {
                prTitle = match[1].trim();
                console.log(`Found PR title from page title: "${prTitle}"`);
            }
        }
        
        // Final fallback
        if (!prTitle) {
            prTitle = `PR #${prId.split('/').pop()}`;
            console.log(`Using fallback PR title: "${prTitle}"`);
        }

        const prAuthor = document.querySelector('.gh-header-meta .author')?.textContent?.trim() || '';
        const rawPrUrl = window.location.href;
        const cleanUrl = cleanPRUrl(rawPrUrl);
        const [owner, repo, , prNumber] = prId.split(/[\/]/);
        const currentDate = getCurrentUTCDate();
        const currentDateTime = getCurrentUTCDateTime();
        
        const prInfo = {
            id: prId,
            title: prTitle,  // This should now be the actual PR title
            author: prAuthor,
            url: cleanUrl,
            owner: owner,
            repo: repo,
            number: prNumber,
            repository: `${owner}/${repo}`,
            reviewer: PERSONAL_INFO.login,
            name: PERSONAL_INFO.name,
            email: PERSONAL_INFO.email,
            date: currentDate,
            dateTime: currentDateTime,
            contributionType: 'Code Review',
            description: prTitle,  // Use the actual PR title
            link: cleanUrl
        };
        
        console.log('=== EXTRACTED PR INFO ===');
        console.log('PR ID:', prInfo.id);
        console.log('PR Title:', prInfo.title);
        console.log('PR Number:', prInfo.number);
        console.log('Description (should be title):', prInfo.description);
        console.log('Date/Time:', prInfo.dateTime);
        
        return prInfo;
    }

    // Function to get stored state for current PR
    function getPRState(prId) {
        if (!prId) return false;
        const stored = localStorage.getItem(STORAGE_PREFIX + prId);
        return stored === 'true';
    }

    // Function to set stored state for current PR
    function setPRState(prId, state) {
        if (!prId) return;
        localStorage.setItem(STORAGE_PREFIX + prId, state.toString());
    }

    // Function to store PR info for form auto-fill with PR association
    function storePRInfoForForm(prInfo) {
        const storageKey = `github_pr_form_data_${prInfo.number}`;
        
        if (typeof GM_setValue !== 'undefined') {
            GM_setValue(storageKey, JSON.stringify(prInfo));
        } else {
            localStorage.setItem(storageKey, JSON.stringify(prInfo));
        }
        
        console.log(`Stored PR info for form with key: ${storageKey}`);
        console.log('Stored title:', prInfo.title);
        console.log('Stored description:', prInfo.description);
    }

    // Function to get PR info for form auto-fill based on PR number
    function getPRInfoForForm(prNumber) {
        if (!prNumber) return null;
        
        const storageKey = `github_pr_form_data_${prNumber}`;
        
        try {
            let prInfo;
            if (typeof GM_getValue !== 'undefined') {
                const stored = GM_getValue(storageKey);
                prInfo = stored ? JSON.parse(stored) : null;
            } else {
                const stored = localStorage.getItem(storageKey);
                prInfo = stored ? JSON.parse(stored) : null;
            }
            
            if (prInfo) {
                console.log(`Retrieved PR info for PR ${prNumber}`);
                console.log('Retrieved title:', prInfo.title);
                console.log('Retrieved description:', prInfo.description);
            }
            
            return prInfo;
        } catch (e) {
            console.error('Error retrieving PR info:', e);
            return null;
        }
    }

    // Function to open Google Form with PR-specific URL
    function openGoogleForm(prInfo) {
        storePRInfoForForm(prInfo);
        const formUrlWithPR = `${GOOGLE_FORM_URL}#pr-${prInfo.number}`;
        
        console.log('Opening Google Form with PR-specific URL:', formUrlWithPR);
        
        if (typeof GM_openInTab !== 'undefined') {
            GM_openInTab(formUrlWithPR, { active: true });
        } else {
            window.open(formUrlWithPR, '_blank');
        }
    }

    // Function to find form field by question text in data-params
    function findFieldByQuestion(questionText) {
        const listItems = document.querySelectorAll('div[role="listitem"]');
        
        for (const listItem of listItems) {
            try {
                const dataParamsDiv = listItem.querySelector('div[data-params]');
                if (dataParamsDiv) {
                    const dataParams = dataParamsDiv.getAttribute('data-params');
                    if (dataParams && dataParams.includes(questionText)) {
                        // Found the correct list item - now find the input field
                        const textInput = listItem.querySelector('input[type="text"]');
                        const dateInput = listItem.querySelector('input[type="date"]');
                        const textArea = listItem.querySelector('textarea');
                        
                        const input = textInput || dateInput || textArea;
                        if (input) {
                            console.log(`✓ Found field for question: "${questionText}"`);
                            return input;
                        }
                    }
                }
            } catch (e) {
                console.error('Error checking list item:', e);
            }
        }
        
        console.log(`✗ No field found for question: "${questionText}"`);
        return null;
    }

    // Function to find and check "Code Review" checkbox
    function checkCodeReviewOption() {
        console.log('Looking for "Code Review" checkbox...');
        
        // Find the contribution type question section
        const listItems = document.querySelectorAll('div[role="listitem"]');
        
        for (const listItem of listItems) {
            try {
                const dataParamsDiv = listItem.querySelector('div[data-params]');
                if (dataParamsDiv) {
                    const dataParams = dataParamsDiv.getAttribute('data-params');
                    if (dataParams && dataParams.includes('What type of contribution did you make?')) {
                        console.log('✓ Found contribution type section');
                        
                        // Look for the "Code Review" checkbox using aria-label
                        const codeReviewCheckbox = listItem.querySelector('[aria-label="Code Review"][role="checkbox"]');
                        if (codeReviewCheckbox) {
                            const isChecked = codeReviewCheckbox.getAttribute('aria-checked') === 'true';
                            if (!isChecked) {
                                console.log('Found "Code Review" checkbox, clicking it...');
                                codeReviewCheckbox.click();
                                console.log('✅ Successfully checked "Code Review" option');
                                return true;
                            } else {
                                console.log('✅ "Code Review" option is already checked');
                                return true;
                            }
                        }
                        
                        // Fallback: look for span containing "Code Review" text
                        const spans = listItem.querySelectorAll('span');
                        for (const span of spans) {
                            if (span.textContent.trim() === 'Code Review') {
                                console.log('Found "Code Review" span, trying to click...');
                                // Try to find the associated checkbox
                                const checkbox = span.closest('label')?.querySelector('[role="checkbox"]');
                                if (checkbox) {
                                    checkbox.click();
                                    console.log('✅ Successfully checked "Code Review" via span');
                                    return true;
                                }
                            }
                        }
                        break; // Found the section, stop looking
                    }
                }
            } catch (e) {
                console.error('Error checking contribution type section:', e);
            }
        }
        
        console.log('❌ Could not find or check "Code Review" option');
        return false;
    }

    // Function to wait for form elements to be ready
    function waitForFormReady() {
        return new Promise((resolve) => {
            // Check if form elements are already present
            const checkElements = () => {
                const listItems = document.querySelectorAll('div[role="listitem"]');
                const hasFormFields = listItems.length > 0;
                
                if (hasFormFields) {
                    console.log('✓ Form elements detected, ready to auto-fill');
                    resolve();
                } else {
                    console.log('⏳ Waiting for form elements to load...');
                    setTimeout(checkElements, 100);
                }
            };
            
            checkElements();
        });
    }

    // Function to auto-fill Google Form (using proper onload detection)
    function autoFillGoogleForm() {
        console.log('=== STARTING GOOGLE FORM AUTO-FILL ===');
        
        const prNumber = getPRNumberFromHash();
        if (!prNumber) {
            console.log('No PR number found in URL hash, skipping auto-fill');
            return;
        }
        
        console.log(`Detected PR number from hash: ${prNumber}`);
        
        const prInfo = getPRInfoForForm(prNumber);
        if (!prInfo) {
            console.log(`No PR info found for PR ${prNumber}`);
            return;
        }

        console.log(`Auto-filling form for PR ${prNumber}`);
        console.log('Will use PR title:', prInfo.title);
        console.log('Will use description:', prInfo.description);

        // Wait for form to be ready, then auto-fill
        waitForFormReady().then(() => {
            console.log('=== EXECUTING AUTO-FILL (FORM IS READY) ===');
            autoFillFormFields(prInfo);
        });
    }

    // Function to auto-fill form fields using precise targeting
    function autoFillFormFields(prInfo) {
        console.log(`Starting auto-fill for PR ${prInfo.number}...`);
        console.log(`Using PR Title: "${prInfo.title}"`);
        console.log(`Using Description: "${prInfo.description}"`);
        
        // Define question mappings based on exact form text
        const fieldMappings = [
            {
                question: "What's your name and surname?",
                value: prInfo.name,
                type: 'text'
            },
            {
                question: "What's your email?",
                value: prInfo.email,
                type: 'text'
            },
            {
                question: "Date of Contribution:",
                value: prInfo.date,
                type: 'date'
            },
            {
                question: "Briefly describe your contribution",
                value: prInfo.description,  // This should be the PR title
                type: 'textarea'
            },
            {
                question: "Share the link to your contribution:",
                value: prInfo.link,
                type: 'textarea'
            }
        ];

        // Fill each field
        fieldMappings.forEach(mapping => {
            try {
                console.log(`Looking for field: "${mapping.question}"`);
                console.log(`Will fill with: "${mapping.value}"`);
                const field = findFieldByQuestion(mapping.question);
                if (field) {
                    fillInput(field, mapping.value, mapping.type);
                    console.log(`✅ Filled "${mapping.question}" with: "${mapping.value}"`);
                } else {
                    console.log(`❌ Could not find field for: "${mapping.question}"`);
                }
            } catch (e) {
                console.error(`Error filling field for "${mapping.question}":`, e);
            }
        });

        // Handle checkbox for contribution type (with small delay to ensure other fields are processed)
        setTimeout(() => {
            checkCodeReviewOption();
        }, 500);
        
        console.log(`Auto-fill completed for PR ${prInfo.number}`);
    }

    // Function to fill an input field with improved compatibility
    function fillInput(input, value, type) {
        if (!input || !value) return;

        try {
            console.log(`Filling ${type} field with value: "${value}"`);
            
            // Clear any existing value
            input.value = '';
            
            // Focus the input first
            input.focus();
            
            // Set the value
            input.value = value;

            // For date inputs, also set the attribute
            if (type === 'date' || input.type === 'date') {
                input.setAttribute('value', value);
            }

            // Trigger comprehensive events in sequence
            const eventSequence = [
                () => input.dispatchEvent(new Event('focus', { bubbles: true })),
                () => input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true })),
                () => input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true })),
                () => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })),
                () => input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' })),
                () => input.dispatchEvent(new Event('blur', { bubbles: true }))
            ];

            // Execute events with small delays
            eventSequence.forEach((eventFn, index) => {
                setTimeout(() => {
                    try {
                        eventFn();
                    } catch (e) {
                        console.error(`Error triggering event ${index}:`, e);
                    }
                }, index * 50);
            });

            // Additional validation after events
            setTimeout(() => {
                if (input.value !== value) {
                    console.log('Value not set correctly, trying again...');
                    input.value = value;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, 500);

            console.log(`Successfully processed ${type} field`);
        } catch (e) {
            console.error(`Error in fillInput for ${type}:`, e);
        }
    }

    // Function to apply button state
    function applyButtonState(button, isMarked) {
        const state = isMarked ? BUTTON_STATES.MARKED : BUTTON_STATES.DEFAULT;
        
        button.textContent = state.text;
        button.title = state.title;
        button.style.backgroundColor = state.color;
        button.dataset.state = isMarked ? 'marked' : 'default';
        button.dataset.hoverColor = state.hoverColor;
    }

    // Function to create and add the button
    function createButton() {
        if (document.getElementById('github-pr-status-button')) {
            return;
        }

        const prId = getCurrentPRId();
        if (!prId) return;

        const isMarked = getPRState(prId);
        const button = document.createElement('button');
        button.id = 'github-pr-status-button';
        
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 20px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3);
            transition: all 0.3s cubic-bezier(.25,.8,.25,1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        applyButtonState(button, isMarked);

        // Hover effects
        button.addEventListener('mouseenter', function() {
            this.style.backgroundColor = this.dataset.hoverColor;
            this.style.boxShadow = '0 4px 15px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.22)';
            this.style.transform = 'translateY(-2px) scale(1.05)';
        });

        button.addEventListener('mouseleave', function() {
            const currentState = this.dataset.state === 'marked' ? BUTTON_STATES.MARKED : BUTTON_STATES.DEFAULT;
            this.style.backgroundColor = currentState.color;
            this.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3)';
            this.style.transform = 'translateY(0) scale(1)';
        });

        // Click event
        button.addEventListener('click', function() {
            const currentPrId = getCurrentPRId();
            if (!currentPrId) return;

            const currentlyMarked = getPRState(currentPrId);
            
            if (!currentlyMarked) {
                setPRState(currentPrId, true);
                applyButtonState(this, true);
                
                const prInfo = getPRInfo();
                if (prInfo) {
                    console.log('=== BUTTON CLICKED - OPENING FORM ===');
                    console.log('Current Date/Time (UTC):', getCurrentUTCDateTime());
                    console.log('Current User Login:', PERSONAL_INFO.login);
                    console.log('PR Title:', prInfo.title);
                    console.log('PR Number:', prInfo.number);
                    openGoogleForm(prInfo);
                }
            } else {
                setPRState(currentPrId, false);
                applyButtonState(this, false);
                console.log('Button clicked - marked as not reviewed');
            }
            
            // Animation feedback
            this.style.transform = 'scale(0.9)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 100);
        });

        // Accessibility
        button.setAttribute('tabindex', '0');
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'Toggle PR review status and open form');

        document.body.appendChild(button);
    }

    // Main logic based on current page
    if (isGoogleForm()) {
        const prNumber = getPRNumberFromHash();
        console.log('=== GOOGLE FORM DETECTED ===');
        console.log('Grafana Champions Contribution Tracker v2.3');
        console.log('Source: https://github.com/jkroepke/grafana-champions-contribution-tracker');
        console.log('Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted):', getCurrentUTCDateTime());
        console.log('Current User\'s Login:', PERSONAL_INFO.login);
        console.log(`PR number from URL hash: ${prNumber}`);
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', autoFillGoogleForm);
        } else {
            autoFillGoogleForm();
        }
    } else {
        console.log('=== GITHUB PAGE DETECTED ===');
        console.log('Grafana Champions Contribution Tracker v2.3');
        console.log('Source: https://github.com/jkroepke/grafana-champions-contribution-tracker');
        console.log('Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted):', getCurrentUTCDateTime());
        console.log('Current User\'s Login:', PERSONAL_INFO.login);
        
        // GitHub page logic
        function updateButton() {
            const button = document.getElementById('github-pr-status-button');
            const prId = getCurrentPRId();
            
            if (button && prId) {
                const isMarked = getPRState(prId);
                applyButtonState(button, isMarked);
            }
        }

        function isPRPage() {
            return window.location.pathname.includes('/pull/') && 
                   window.location.pathname.match(/\/pull\/\d+/);
        }

        function init() {
            if (isPRPage()) {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', createButton);
                } else {
                    createButton();
                }
            }
        }

        let currentUrl = window.location.href;
        const observer = new MutationObserver(function() {
            if (currentUrl !== window.location.href) {
                currentUrl = window.location.href;
                
                const existingButton = document.getElementById('github-pr-status-button');
                if (existingButton && !isPRPage()) {
                    existingButton.remove();
                }
                
                if (isPRPage()) {
                    setTimeout(() => {
                        if (document.getElementById('github-pr-status-button')) {
                            updateButton();
                        } else {
                            createButton();
                        }
                    }, 100);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        init();
    }

    // Add CSS for better visual feedback
    const style = document.createElement('style');
    style.textContent = `
        #github-pr-status-button:focus {
            outline: 3px solid #0969da;
            outline-offset: 2px;
        }
        
        #github-pr-status-button:active {
            transform: scale(0.95) !important;
        }
    `;
    document.head.appendChild(style);

})();
