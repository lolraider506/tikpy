// Cooldown Manager
class CooldownManager {
    constructor(duration = 5 * 60 * 1000) { // 5 minutes in milliseconds
        this.duration = duration;
        this.storageKey = 'tikpy_cooldown';
    }

    isOnCooldown() {
        const cooldownEnd = localStorage.getItem(this.storageKey);
        if (!cooldownEnd) return false;

        const now = Date.now();
        const endTime = parseInt(cooldownEnd);

        return now < endTime;
    }

    getRemainingTime() {
        const cooldownEnd = localStorage.getItem(this.storageKey);
        if (!cooldownEnd) return 0;

        const now = Date.now();
        const endTime = parseInt(cooldownEnd);
        const remaining = endTime - now;

        return remaining > 0 ? remaining : 0;
    }

    startCooldown() {
        const endTime = Date.now() + this.duration;
        localStorage.setItem(this.storageKey, endTime.toString());
    }

    clearCooldown() {
        localStorage.removeItem(this.storageKey);
    }

    formatTime(ms) {
        const totalSeconds = Math.ceil(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// UI Manager
class UIManager {
    constructor() {
        this.form = document.getElementById('viewForm');
        this.submitBtn = document.getElementById('submitBtn');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.statusContainer = document.getElementById('statusContainer');
        this.cooldownDisplay = document.getElementById('cooldownDisplay');
        this.cooldownTimer = document.getElementById('cooldownTimer');
        this.loadingCount = document.querySelector('.loading-count');
        this.countInterval = null;
    }

    showLoading(targetViews) {
        this.loadingOverlay.classList.add('active');
        this.submitBtn.disabled = true;

        // Ensure we have a valid number
        const target = parseInt(targetViews) || 100;

        // Start counting animation
        let current = 0;
        const duration = 15000; // 15 seconds
        const intervalTime = 50; // Update every 50ms for smoothness
        const totalSteps = duration / intervalTime;
        const increment = target / totalSteps;

        this.loadingCount.textContent = '0';

        if (this.countInterval) clearInterval(this.countInterval);

        this.countInterval = setInterval(() => {
            current += increment;

            // Add slight randomness to speed
            const noise = (Math.random() * increment * 0.5);
            let displayValue = Math.floor(current + noise);

            if (displayValue >= target) {
                displayValue = target;
                clearInterval(this.countInterval);
            }

            this.loadingCount.textContent = displayValue.toLocaleString();
        }, intervalTime);
    }

    hideLoading() {
        this.loadingOverlay.classList.remove('active');
        this.submitBtn.disabled = false;
        if (this.countInterval) {
            clearInterval(this.countInterval);
            this.countInterval = null;
        }
    }

    showMessage(message, type = 'info') {
        const messageEl = document.createElement('div');
        messageEl.className = `status-message status-${type}`;

        const icon = type === 'success' ? '✓' :
            type === 'error' ? '✗' : 'ℹ';

        messageEl.innerHTML = `
            <span style="font-size: 1.25rem;">${icon}</span>
            <span>${message}</span>
        `;

        this.statusContainer.innerHTML = '';
        this.statusContainer.appendChild(messageEl);

        // Auto-remove success messages after 10 seconds
        if (type === 'success') {
            setTimeout(() => {
                messageEl.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => messageEl.remove(), 300);
            }, 10000);
        }
    }

    showCooldown(remainingMs) {
        this.cooldownDisplay.style.display = 'flex';
        this.cooldownTimer.textContent = cooldownManager.formatTime(remainingMs);
        this.submitBtn.disabled = true;
    }

    hideCooldown() {
        this.cooldownDisplay.style.display = 'none';
        this.submitBtn.disabled = false;
    }

    updateCooldownTimer(remainingMs) {
        this.cooldownTimer.textContent = cooldownManager.formatTime(remainingMs);
    }
}

// API Client
class APIClient {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
    }

    async sendViews(url, views, turnstileToken) {
        const response = await fetch(`${this.baseURL}/api/send-views`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, views, turnstile: turnstileToken })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to send views');
        }

        return data;
    }
}

// Main Application
class TikPyApp {
    constructor() {
        this.cooldownManager = new CooldownManager();
        this.ui = new UIManager();
        this.api = new APIClient();

        this.cooldownInterval = null;

        this.init();
    }

    init() {
        // Check for existing cooldown
        this.checkCooldown();

        // Initialize online counter
        this.updateOnlineCount();
        setInterval(() => this.updateOnlineCount(), 30000); // Update every 30 seconds

        // Form submission
        this.ui.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
    }

    updateOnlineCount() {
        // Fetch real online count from backend
        fetch('/api/online')
            .then(response => response.json())
            .then(data => {
                const countElement = document.getElementById('onlineCount');
                if (countElement && data.online !== undefined) {
                    countElement.textContent = data.online;
                }
            })
            .catch(error => {
                console.error('Error fetching online count:', error);
                // Fallback to a default value on error
                const countElement = document.getElementById('onlineCount');
                if (countElement) {
                    countElement.textContent = '0';
                }
            });
    }

    checkCooldown() {
        if (this.cooldownManager.isOnCooldown()) {
            const remaining = this.cooldownManager.getRemainingTime();
            this.ui.showCooldown(remaining);
            this.startCooldownTimer();
        } else {
            this.ui.hideCooldown();
            this.stopCooldownTimer();
        }
    }

    startCooldownTimer() {
        // Clear any existing interval
        this.stopCooldownTimer();

        this.cooldownInterval = setInterval(() => {
            const remaining = this.cooldownManager.getRemainingTime();

            if (remaining <= 0) {
                this.cooldownManager.clearCooldown();
                this.ui.hideCooldown();
                this.stopCooldownTimer();
                this.ui.showMessage('Cooldown complete! You can now send views again.', 'success');
            } else {
                this.ui.updateCooldownTimer(remaining);
            }
        }, 1000);
    }

    stopCooldownTimer() {
        if (this.cooldownInterval) {
            clearInterval(this.cooldownInterval);
            this.cooldownInterval = null;
        }
    }

    async handleSubmit() {
        // Check cooldown first
        if (this.cooldownManager.isOnCooldown()) {
            const remaining = this.cooldownManager.getRemainingTime();
            this.ui.showMessage(
                `Please wait ${this.cooldownManager.formatTime(remaining)} before sending more views.`,
                'error'
            );
            return;
        }

        const urlInput = document.getElementById('tiktokUrl');
        const viewsInput = document.getElementById('viewCount');

        const url = urlInput.value.trim();
        const views = parseInt(viewsInput.value);

        // Validation
        if (!url) {
            this.ui.showMessage('Please enter a TikTok URL', 'error');
            return;
        }

        if (isNaN(views) || views < 50 || views > 1500) {
            this.ui.showMessage('Views must be between 50 and 1500', 'error');
            return;
        }

        // Check Turnstile verification
        const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');
        if (!turnstileResponse || !turnstileResponse.value) {
            this.ui.showMessage('Please complete the security verification', 'error');
            return;
        }

        const token = turnstileResponse.value;

        try {
            this.ui.showLoading(views);
            this.ui.showMessage('Processing your request...', 'info');

            const result = await this.api.sendViews(url, views, token);

            this.ui.hideLoading();

            // Reset Turnstile widget
            if (window.turnstile) {
                window.turnstile.reset();
            }

            if (result.success) {
                // Start cooldown
                this.cooldownManager.startCooldown();
                this.checkCooldown();

                this.ui.showMessage(
                    `🎉 ${result.message} (${result.sent.toLocaleString()} views delivered)`,
                    'success'
                );

                // Clear form
                urlInput.value = '';
                viewsInput.value = '';
            }
        } catch (error) {
            this.ui.hideLoading();

            // Parse error message
            let errorMessage = error.message;

            // Check if it's a cooldown error from server
            if (errorMessage.includes('wait') && errorMessage.includes('seconds')) {
                // Server enforced cooldown, sync with local
                this.cooldownManager.startCooldown();
                this.checkCooldown();
            }

            this.ui.showMessage(errorMessage, 'error');
        }
    }
}

// Initialize app when DOM is loaded
let cooldownManager;
let app;

document.addEventListener('DOMContentLoaded', () => {
    cooldownManager = new CooldownManager();
    app = new TikPyApp();
});
