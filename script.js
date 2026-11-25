// Linux Arsenal - Interactive Linux Learning Platform
// Modified by Ashwin Vadakkeel (aka Hermit)
class LinuxArsenal {
    constructor() {
        this.currentSection = 'dashboard';
        this.activeUsername = localStorage.getItem('linuxArsenal_activeUser') || 'Guest';
        this.profiles = this.loadAllProfiles();

        this.user = this.createDefaultUser();
        this.commandHistory = [];
        this.historyIndex = -1;
        this.commandCounts = {};
        this.achievements = [];
        this.settings = {
            theme: 'dark',
            fontSize: 14,
            autoHints: true,
            soundEffects: true
        };

        this.currentChallenge = null;
        this.challengeTimerInterval = null;
        this.challengeSeconds = 0;
        this.challengeAttempts = 0;

        this.filesystem = this.initializeFilesystem();
        this.currentDirectory = '/home/user';
        this.challenges = [];
        this.filteredChallenges = [];
        this.visibleChallengesCount = 24;
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.leaderboardPeriod = 'all';
        this.aiAssistantOpen = true;
        this.typingStartTime = null;
        this.matrixInterval = null;
        this.matrixActive = false;
        this.konamiSequence = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
        this.konamiIndex = 0;
        this.logoClicks = 0;
        this.logoClickTimer = null;
        this.discoveredEggs = new Set();

        this.setupErrorBoundary();
        this.initializeAchievements();
        this.generateChallenges();
        this.loadProfile(this.activeUsername);
        this.setupEventListeners();
        this.applySettings();
        this.initializeApp();
    }

    createDefaultUser() {
        return {
            xp: 0,
            level: 1,
            streak: 1,
            lastActiveDate: new Date().toDateString(),
            commandsLearned: 0,
            learnedCommands: [],
            timeSpent: 0,
            accuracy: 100,
            totalCommands: 0,
            successfulCommands: 0,
            skills: {
                'file-ops': 0,
                'text-proc': 0,
                'sys-admin': 0,
                'networking': 0,
                'security': 0,
                'scripting': 0
            }
        };
    }

    setupErrorBoundary() {
        window.addEventListener('error', (event) => {
            console.error('Unhandled error:', event.error);
            const boundary = document.getElementById('error-boundary');
            const msg = document.getElementById('error-message');
            if (boundary && msg) {
                msg.textContent = event.message || 'An unexpected error occurred.';
                boundary.classList.remove('hidden');
            }
        });

        document.getElementById('retry-button')?.addEventListener('click', () => {
            window.location.reload();
        });
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
        return div.innerHTML;
    }

    initializeApp() {
        setTimeout(() => {
            document.getElementById('loading-screen')?.classList.add('hidden');
            document.getElementById('main-app')?.classList.remove('hidden');
            this.refreshAllViews();
        }, 800);
    }

    // ==================== MULTI-USER PROFILE STORAGE ====================
    loadAllProfiles() {
        try {
            const raw = localStorage.getItem('linuxArsenal_profiles');
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            console.warn('Failed to parse profiles:', e);
            return {};
        }
    }

    saveAllProfiles() {
        localStorage.setItem('linuxArsenal_profiles', JSON.stringify(this.profiles));
        localStorage.setItem('linuxArsenal_activeUser', this.activeUsername);
    }

    saveProgress() {
        const completedChallengeIds = this.challenges
            .filter(c => c.completed)
            .map(c => c.id);

        this.profiles[this.activeUsername] = {
            user: this.user,
            achievements: this.achievements,
            commandHistory: this.commandHistory.slice(-100),
            commandCounts: this.commandCounts,
            completedChallengeIds,
            discoveredEggs: Array.from(this.discoveredEggs),
            settings: this.settings
        };
        this.saveAllProfiles();
    }

    loadProfile(username) {
        const cleanName = (username || 'Guest').trim() || 'Guest';
        this.activeUsername = cleanName;

        // Reset challenge completion state before applying user's completed IDs
        this.challenges.forEach(c => { c.completed = false; });

        const saved = this.profiles[cleanName];
        if (saved) {
            this.user = { ...this.createDefaultUser(), ...(saved.user || {}) };
            this.user.skills = { ...this.createDefaultUser().skills, ...(saved.user?.skills || {}) };
            this.achievements = Array.isArray(saved.achievements) ? saved.achievements : [];
            this.commandHistory = Array.isArray(saved.commandHistory) ? saved.commandHistory : [];
            this.commandCounts = saved.commandCounts || {};
            this.discoveredEggs = new Set(saved.discoveredEggs || []);
            this.settings = { ...this.settings, ...(saved.settings || {}) };

            const completedSet = new Set(saved.completedChallengeIds || []);
            this.challenges.forEach(c => {
                if (completedSet.has(c.id)) {
                    c.completed = true;
                }
            });
        } else {
            this.user = this.createDefaultUser();
            this.achievements = [];
            this.commandHistory = [];
            this.commandCounts = {};
            this.discoveredEggs = new Set();
            this.saveProgress();
        }

        // Update daily streak
        const today = new Date().toDateString();
        if (this.user.lastActiveDate !== today) {
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            this.user.streak = (this.user.lastActiveDate === yesterday) ? (this.user.streak + 1) : 1;
            this.user.lastActiveDate = today;
            this.saveProgress();
        }

        this.historyIndex = this.commandHistory.length;
        this.filesystem = this.initializeFilesystem();
        this.currentDirectory = '/home/user';

        this.updateUserLabels();
        this.applySettings();
        this.refreshAllViews();
    }

    switchUser(username) {
        this.saveProgress();
        this.loadProfile(username);
        this.closeUserModal();
        this.showNotification(`Switched to profile: ${this.activeUsername}`, 'success');
    }

    createUser(username) {
        const clean = username.trim();
        if (!clean) {
            this.showNotification('Please enter a valid username.', 'error');
            return;
        }
        if (this.profiles[clean]) {
            this.switchUser(clean);
            return;
        }
        this.saveProgress();
        this.loadProfile(clean);
        this.closeUserModal();
        this.showNotification(`Created & switched to profile: ${clean}`, 'success');
    }

    deleteUser(username) {
        if (username === this.activeUsername) {
            this.showNotification('Cannot delete the currently active profile.', 'error');
            return;
        }
        delete this.profiles[username];
        this.saveAllProfiles();
        this.renderProfilesList();
        this.updateLeaderboard();
        this.showNotification(`Deleted profile: ${username}`, 'info');
    }

    updateUserLabels() {
        const headerUser = document.getElementById('current-username');
        const welcomeUser = document.getElementById('welcome-username');
        const promptUser = document.getElementById('prompt-user');
        const termTitle = document.getElementById('terminal-window-title');
        const dirEl = document.getElementById('current-dir');

        if (headerUser) headerUser.textContent = this.activeUsername;
        if (welcomeUser) welcomeUser.textContent = this.activeUsername;
        if (promptUser) promptUser.textContent = this.activeUsername.toLowerCase().replace(/\s+/g, '');
        if (dirEl) dirEl.textContent = this.getDisplayPath();
        if (termTitle) termTitle.textContent = `${this.activeUsername.toLowerCase().replace(/\s+/g, '')}@linux-arsenal:${this.getDisplayPath()}`;
    }

    openUserModal() {
        this.renderProfilesList();
        document.getElementById('user-modal')?.classList.remove('hidden');
        document.getElementById('new-username-input')?.focus();
    }

    closeUserModal() {
        document.getElementById('user-modal')?.classList.add('hidden');
    }

    renderProfilesList() {
        const container = document.getElementById('profiles-list');
        if (!container) return;

        const names = Object.keys(this.profiles);
        if (!names.includes(this.activeUsername)) names.unshift(this.activeUsername);

        container.innerHTML = names.map(name => {
            const p = this.profiles[name];
            const lvl = p?.user?.level || 1;
            const xp = p?.user?.xp || 0;
            const completed = p?.completedChallengeIds?.length || 0;
            const isActive = name === this.activeUsername;

            return `
                <div class="profile-item ${isActive ? 'active-profile' : ''}">
                    <div class="profile-item-info">
                        <strong>${this.escapeHtml(name)} ${isActive ? '(Active)' : ''}</strong>
                        <span>Level ${lvl} • ${xp} XP • ${completed} Challenges Completed</span>
                    </div>
                    <div class="profile-item-actions">
                        ${!isActive ? `<button class="profile-switch-btn" data-switch-user="${this.escapeHtml(name)}">Switch</button>` : ''}
                        ${!isActive ? `<button class="profile-delete-btn" data-delete-user="${this.escapeHtml(name)}" title="Delete Profile"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-switch-user]').forEach(btn => {
            btn.addEventListener('click', () => this.switchUser(btn.dataset.switchUser));
        });
        container.querySelectorAll('[data-delete-user]').forEach(btn => {
            btn.addEventListener('click', () => this.deleteUser(btn.dataset.deleteUser));
        });
    }

    refreshAllViews() {
        this.updateUserDisplay();
        this.updateDashboard();
        this.updateHistoryDisplay();
        this.loadChallenges();
        this.loadAchievements();
        this.updateLeaderboard();
        this.updateAnalytics();
    }

    // ==================== DISPLAY & SETTINGS ====================
    updateUserDisplay() {
        const xpEl = document.getElementById('user-xp');
        const levelEl = document.getElementById('user-level');
        const streakEl = document.getElementById('header-streak');

        if (xpEl) xpEl.textContent = this.user.xp;
        if (levelEl) levelEl.textContent = this.user.level;
        if (streakEl) streakEl.textContent = this.user.streak;

        this.updateSkillBars();
    }

    updateSkillBars() {
        Object.keys(this.user.skills).forEach(skill => {
            const totalXp = this.user.skills[skill] || 0;
            const level = Math.floor(totalXp / 100) + 1;
            const progress = totalXp % 100;

            const progressFill = document.querySelector(`.progress-fill[data-skill="${skill}"]`);
            const levelText = document.querySelector(`.skill-level[data-skill="${skill}"]`);
            const percentageText = progressFill?.closest('.progress-bar-container')?.querySelector('.progress-percentage');

            if (progressFill) progressFill.style.width = `${progress}%`;
            if (levelText) levelText.textContent = `Level ${level}`;
            if (percentageText) percentageText.textContent = `${progress}%`;
        });
    }

    applySettings() {
        const theme = this.settings.theme || 'dark';
        if (theme === 'light') {
            document.body.classList.add('light-theme');
        } else if (theme === 'auto') {
            const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
            document.body.classList.toggle('light-theme', prefersLight);
        } else {
            document.body.classList.remove('light-theme');
        }

        const fontSize = this.settings.fontSize || 14;
        document.querySelectorAll('.terminal-output, .terminal-input').forEach(el => {
            el.style.fontSize = `${fontSize}px`;
        });

        const themeSelect = document.getElementById('theme-select');
        const fontSlider = document.getElementById('terminal-font-size');
        const fontVal = document.getElementById('font-size-value');
        const autoHints = document.getElementById('auto-hints');
        const soundEffects = document.getElementById('sound-effects');

        if (themeSelect) themeSelect.value = theme;
        if (fontSlider) fontSlider.value = fontSize;
        if (fontVal) fontVal.textContent = `${fontSize}px`;
        if (autoHints) autoHints.checked = !!this.settings.autoHints;
        if (soundEffects) soundEffects.checked = !!this.settings.soundEffects;
    }

    // ==================== EVENT LISTENERS ====================
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchSection(e.currentTarget.dataset.section);
            });
        });

        // User Profile Modal
        document.getElementById('open-user-modal')?.addEventListener('click', () => this.openUserModal());
        document.getElementById('close-user-modal')?.addEventListener('click', () => this.closeUserModal());
        document.getElementById('create-user-btn')?.addEventListener('click', () => {
            const input = document.getElementById('new-username-input');
            this.createUser(input.value);
            input.value = '';
        });
        document.getElementById('new-username-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createUser(e.target.value);
                e.target.value = '';
            }
        });

        // Settings Modal
        document.getElementById('open-settings')?.addEventListener('click', () => {
            document.getElementById('settings-modal')?.classList.remove('hidden');
        });
        document.getElementById('close-settings')?.addEventListener('click', () => {
            document.getElementById('settings-modal')?.classList.add('hidden');
        });
        document.getElementById('theme-select')?.addEventListener('change', (e) => {
            this.settings.theme = e.target.value;
            this.applySettings();
            this.saveProgress();
        });
        document.getElementById('terminal-font-size')?.addEventListener('input', (e) => {
            this.settings.fontSize = Number(e.target.value);
            this.applySettings();
            this.saveProgress();
        });
        document.getElementById('auto-hints')?.addEventListener('change', (e) => {
            this.settings.autoHints = e.target.checked;
            this.saveProgress();
        });
        document.getElementById('sound-effects')?.addEventListener('change', (e) => {
            this.settings.soundEffects = e.target.checked;
            this.saveProgress();
        });

        // Dashboard Quick Actions
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                if (action === 'start-challenge') this.switchSection('challenges');
                if (action === 'practice-mode') {
                    this.switchSection('terminal');
                    document.getElementById('terminal-input')?.focus();
                }
                if (action === 'daily-goal') {
                    const completed = this.challenges.filter(c => c.completed).length;
                    this.showNotification(`Daily Goal: Complete 3 challenges! (${completed} completed total)`, 'info');
                }
                if (action === 'random-tip') {
                    this.showNotification(this.generateAIResponse('tip'), 'info');
                }
            });
        });

        // Terminal Input
        const terminalInput = document.getElementById('terminal-input');
        terminalInput?.addEventListener('input', () => {
            if (!this.typingStartTime) this.typingStartTime = Date.now();
        });

        terminalInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const cmd = e.target.value.trim();
                if (cmd && this.typingStartTime) {
                    const elapsedMin = Math.max((Date.now() - this.typingStartTime) / 60000, 0.01);
                    const cpm = Math.min(Math.round(cmd.length / elapsedMin), 999);
                    const speedEl = document.getElementById('typing-speed');
                    if (speedEl) speedEl.textContent = `${cpm} CPM`;
                }
                this.typingStartTime = null;
        this.matrixInterval = null;
        this.matrixActive = false;
        this.konamiSequence = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
        this.konamiIndex = 0;
        this.logoClicks = 0;
        this.logoClickTimer = null;
        this.discoveredEggs = new Set();
                this.processCommand(cmd);
                e.target.value = '';
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.handleTabCompletion(e.target);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    e.target.value = this.commandHistory[this.historyIndex];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.historyIndex < this.commandHistory.length - 1) {
                    this.historyIndex++;
                    e.target.value = this.commandHistory[this.historyIndex];
                } else {
                    this.historyIndex = this.commandHistory.length;
                    e.target.value = '';
                }
            }
        });

        // Terminal Actions
        document.getElementById('clear-terminal')?.addEventListener('click', () => this.clearTerminal());
        document.getElementById('terminal-help')?.addEventListener('click', () => this.showTerminalHelp());
        document.getElementById('fullscreen-terminal')?.addEventListener('click', () => {
            const term = document.querySelector('.terminal-main');
            if (!document.fullscreenElement) {
                term?.requestFullscreen?.();
            } else {
                document.exitFullscreen?.();
            }
        });

        // AI Assistant
        document.getElementById('toggle-assistant')?.addEventListener('click', () => this.toggleAIAssistant());
        document.getElementById('minimize-assistant')?.addEventListener('click', () => {
            document.getElementById('ai-assistant')?.classList.toggle('minimized');
        });
        document.getElementById('send-message')?.addEventListener('click', () => this.sendAIMessage());
        document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendAIMessage();
        });
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const input = document.getElementById('chat-input');
                if (input) {
                    input.value = e.currentTarget.dataset.suggestion;
                    this.sendAIMessage();
                }
            });
        });

        // Challenges controls
        document.getElementById('close-challenge')?.addEventListener('click', () => this.closeChallenge());
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterChallenges(e.currentTarget.dataset.filter));
        });
        document.getElementById('challenge-search')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.visibleChallengesCount = 24;
            this.loadChallenges();
        });
        document.getElementById('load-more-challenges')?.addEventListener('click', () => {
            this.visibleChallengesCount += 24;
            this.loadChallenges();
        });
        document.getElementById('generate-challenge')?.addEventListener('click', () => {
            const incomplete = this.challenges.filter(c => !c.completed);
            const pool = incomplete.length > 0 ? incomplete : this.challenges;
            const random = pool[Math.floor(Math.random() * pool.length)];
            if (random) this.openChallenge(random.id);
        });
        document.getElementById('show-hint')?.addEventListener('click', () => this.showChallengeHint());

        // Leaderboard Period Buttons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.leaderboardPeriod = e.currentTarget.dataset.period;
                this.updateLeaderboard();
            });
        });


        // Easter Egg: Konami Code (↑ ↑ ↓ ↓ ← → ← → B A)
        document.addEventListener('keydown', (e) => {
            const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            const expected = this.konamiSequence[this.konamiIndex];
            if (key === expected || e.key === expected) {
                this.konamiIndex++;
                if (this.konamiIndex === this.konamiSequence.length) {
                    this.konamiIndex = 0;
                    this.activateHermitMode();
                }
            } else {
                this.konamiIndex = 0;
            }
        });

        // Easter Egg: Click Logo 5 times
        document.getElementById('easter-logo')?.addEventListener('click', () => {
            this.logoClicks++;
            clearTimeout(this.logoClickTimer);
            this.logoClickTimer = setTimeout(() => { this.logoClicks = 0; }, 1500);
            if (this.logoClicks >= 5) {
                this.logoClicks = 0;
                this.unlockEasterEgg('logo_secret', 'You found Hermit\'s secret logo pulse! — Ashwin Vadakkeel', 35);
                document.body.classList.toggle('hermit-mode');
            }
        });

        // Auto-save every 30s
        setInterval(() => this.saveProgress(), 30000);
    }

    switchSection(section) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.nav-btn[data-section="${section}"]`)?.classList.add('active');

        document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(`${section}-section`)?.classList.add('active');

        this.currentSection = section;

        if (section === 'dashboard') this.updateDashboard();
        if (section === 'challenges') this.loadChallenges();
        if (section === 'achievements') this.loadAchievements();
        if (section === 'leaderboard') this.updateLeaderboard();
        if (section === 'analytics') this.updateAnalytics();
    }

    updateDashboard() {
        document.getElementById('streak-count').textContent = this.user.streak;
        document.getElementById('commands-learned').textContent = this.user.commandsLearned;
        const hrs = Math.floor(this.user.timeSpent / 60);
        const mins = this.user.timeSpent % 60;
        document.getElementById('time-spent').textContent = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        document.getElementById('accuracy-rate').textContent = `${this.user.accuracy}%`;

        this.updateSkillBars();
        this.updateActivityFeed();
        this.updateChallengeStats();
    }

    updateChallengeStats() {
        const totalChallenges = this.challenges.length;
        const completedChallenges = this.challenges.filter(c => c.completed).length;
        const successRate = totalChallenges > 0 ? Math.round((completedChallenges / totalChallenges) * 100) : 0;

        document.getElementById('total-challenges').textContent = totalChallenges;
        document.getElementById('completed-challenges').textContent = completedChallenges;
        document.getElementById('success-rate').textContent = `${successRate}%`;
    }

    updateActivityFeed() {
        const activityList = document.getElementById('activity-list');
        if (!activityList) return;
        const activities = [];
        const completedCount = this.challenges.filter(c => c.completed).length;

        if (completedCount > 0) {
            activities.push({ icon: 'fas fa-trophy', text: `Completed ${completedCount} Linux challenge${completedCount > 1 ? 's' : ''}` });
        }
        if (this.user.commandsLearned > 0) {
            activities.push({ icon: 'fas fa-terminal', text: `Mastered ${this.user.commandsLearned} unique Linux commands` });
        }
        if (this.achievements.length > 0) {
            activities.push({ icon: 'fas fa-medal', text: `Unlocked ${this.achievements.length} achievements` });
        }
        if (this.user.streak > 0) {
            activities.push({ icon: 'fas fa-fire', text: `Active ${this.user.streak}-day learning streak` });
        }

        if (activities.length === 0) {
            activities.push({ icon: 'fas fa-play-circle', text: 'Welcome to Linux Arsenal! Start your journey.' });
        }

        activityList.innerHTML = activities.map(a => `
            <div class="activity-item">
                <i class="${a.icon}"></i>
                <div class="activity-content">
                    <span class="activity-text">${this.escapeHtml(a.text)}</span>
                    <span class="activity-time">Profile: ${this.escapeHtml(this.activeUsername)}</span>
                </div>
            </div>
        `).join('');
    }

    // ==================== VIRTUAL FILESYSTEM & TERMINAL ====================
    initializeFilesystem() {
        return {
            '/': {
                type: 'directory',
                children: {
                    'home': {
                        type: 'directory',
                        children: {
                            'user': {
                                type: 'directory',
                                children: {
                                    'documents': {
                                        type: 'directory',
                                        children: {
                                            'readme.txt': {
                                                type: 'file',
                                                content: 'Welcome to Linux Arsenal!\nThis is your home directory.\nPractice commands safely here.'
                                            }
                                        }
                                    },
                                    'projects': { type: 'directory', children: {} },
                                    '.bashrc': {
                                        type: 'file',
                                        content: '# Bash configuration file\nexport PS1="user@linux-arsenal:~$ "'
                                    }
                                }
                            }
                        }
                    },
                    'etc': {
                        type: 'directory',
                        children: {
                            'passwd': {
                                type: 'file',
                                content: 'root:x:0:0:root:/root:/bin/bash\nuser:x:1000:1000:user:/home/user:/bin/bash'
                            }
                        }
                    },
                    'var': {
                        type: 'directory',
                        children: {
                            'log': {
                                type: 'directory',
                                children: {
                                    'system.log': { type: 'file', content: 'System log entries...\nINFO: Boot complete\nERROR: Sample error entry' }
                                }
                            }
                        }
                    }
                }
            }
        };
    }

    processCommand(command) {
        if (!command) return;

        this.addToHistory(command);
        this.addCommandToOutput(command);

        const parts = command.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        let output = '';
        let isError = false;
        let isEaster = false;

        // Special full-command Easter egg: sudo rm -rf /
        if (/^sudo\s+rm\s+-rf\s+\/\*?$/i.test(command.trim())) {
            output = this.easterSudoRmRf();
            isEaster = true;
            this.addOutputToTerminal(output, false, true);
            this.unlockEasterEgg('daredevil', 'Daredevil! Nice try wiping the root filesystem.', 40);
            this.trackCommandUsage('rm', true);
            this.saveProgress();
            return;
        }

        try {
            switch (cmd) {
                case 'help': output = this.getHelpText(); break;
                case 'tutorial': output = this.startTutorial(); break;
                case 'ls': output = this.listFiles(args); break;
                case 'cd': output = this.changeDirectory(args[0] || '~'); break;
                case 'pwd': output = this.currentDirectory; break;
                case 'cat': output = this.readFile(args[0]); break;
                case 'mkdir': output = this.makeDirectory(args[0]); break;
                case 'rmdir': output = this.removeDirectory(args[0]); break;
                case 'touch': output = this.createFile(args[0]); break;
                case 'rm': output = this.removeFile(args); break;
                case 'cp': output = this.copyFile(args[0], args[1]); break;
                case 'mv': output = this.moveFile(args[0], args[1]); break;
                case 'grep': output = this.grepCommand(args); break;
                case 'find': output = this.findCommand(args); break;
                case 'echo': output = args.join(' '); break;
                case 'date': output = new Date().toString(); break;
                case 'uname': output = 'Linux linux-arsenal 5.15.0-generic x86_64 GNU/Linux'; break;
                case 'clear': this.clearTerminal(); return;
                case 'history': output = this.showHistory(); break;
                case 'man': output = this.showManual(args[0]); break;
                case 'hermit':
                case 'ashwin':
                    output = this.easterHermit();
                    isEaster = true;
                    this.unlockEasterEgg('hermit_tribute', 'Found Ashwin Vadakkeel (aka Hermit)\'s secret!', 50);
                    break;
                case 'matrix':
                    output = this.toggleMatrixRain();
                    isEaster = true;
                    this.unlockEasterEgg('matrix_rain', 'Entered the Matrix!', 35);
                    break;
                case 'cowsay':
                    output = this.easterCowsay(args.join(' '));
                    isEaster = true;
                    this.unlockEasterEgg('cowsay_moo', 'Moo! Classic Linux cowsay unlocked.', 20);
                    break;
                case 'sl':
                    output = this.easterSteamLocomotive();
                    isEaster = true;
                    this.unlockEasterEgg('sl_train', 'Choo choo! Classic ls typo caught!', 25);
                    break;
                case 'neofetch':
                    output = this.easterNeofetch();
                    isEaster = true;
                    this.unlockEasterEgg('neofetch_flex', 'Checked Linux Arsenal specs with neofetch!', 20);
                    break;
                case 'fortune':
                    output = this.easterFortune();
                    isEaster = true;
                    break;
                case 'hack':
                    output = this.easterHack();
                    isEaster = true;
                    this.unlockEasterEgg('elite_hacker', 'Mainframe bypassed (in Hollywood style).', 30);
                    break;
                case 'neo':
                case 'rabbit':
                    output = `Wake up, ${this.activeUsername}...\nThe Matrix has you.\nFollow the white rabbit. 🐇\n\nKnock, knock, ${this.activeUsername}.`;
                    isEaster = true;
                    this.unlockEasterEgg('white_rabbit', 'Followed the white rabbit!', 25);
                    break;
                case 'whoami': output = this.activeUsername; break;
                default:
                    output = `Command '${cmd}' not found. Type 'help' for available commands.`;
                    isError = true;
            }
        } catch (error) {
            output = `Error: ${error.message}`;
            isError = true;
        }

        if (output) this.addOutputToTerminal(output, isError, isEaster);
        this.updateCommandHints();
        this.trackCommandUsage(cmd, !isError);
        this.saveProgress();
    }

    addCommandToOutput(command) {
        const output = document.getElementById('terminal-output');
        const commandDiv = document.createElement('div');
        commandDiv.className = 'command-line';
        const userLabel = this.activeUsername.toLowerCase().replace(/\s+/g, '');
        commandDiv.innerHTML = `
            <span class="command-prompt">${this.escapeHtml(userLabel)}@linux-arsenal:${this.escapeHtml(this.getDisplayPath())}$</span>
            <span class="command-text">${this.escapeHtml(command)}</span>
        `;
        output.appendChild(commandDiv);
        output.scrollTop = output.scrollHeight;
    }

    addOutputToTerminal(output, isError = false, isEaster = false) {
        const outputDiv = document.getElementById('terminal-output');
        const resultDiv = document.createElement('div');
        resultDiv.className = isError ? 'command-error' : (isEaster ? 'command-easter' : 'command-result');
        resultDiv.textContent = output;
        outputDiv.appendChild(resultDiv);
        outputDiv.scrollTop = outputDiv.scrollHeight;
    }

    getDisplayPath() {
        return this.currentDirectory.replace('/home/user', '~');
    }

    addToHistory(command) {
        this.commandHistory.push(command);
        if (this.commandHistory.length > 100) {
            this.commandHistory = this.commandHistory.slice(-100);
        }
        this.historyIndex = this.commandHistory.length;
        this.updateHistoryDisplay();
    }

    updateHistoryDisplay() {
        const historyContent = document.getElementById('history-content');
        if (!historyContent) return;
        const recentCommands = this.commandHistory.slice(-10).reverse();
        historyContent.innerHTML = recentCommands.map(cmd =>
            `<div class="history-item">${this.escapeHtml(cmd)}</div>`
        ).join('') || '<div class="history-item">No commands yet</div>';

        historyContent.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                if (item.textContent !== 'No commands yet') {
                    const input = document.getElementById('terminal-input');
                    if (input) {
                        input.value = item.textContent;
                        input.focus();
                    }
                }
            });
        });
    }

    listFiles(args) {
        const flags = args.filter(a => a.startsWith('-')).join('');
        const showHidden = flags.includes('a');
        const longFormat = flags.includes('l');
        const path = args.find(arg => !arg.startsWith('-')) || this.currentDirectory;

        const resolvedPath = this.resolvePath(path);
        const node = this.getNode(resolvedPath);
        if (!node) throw new Error(`ls: cannot access '${path}': No such file or directory`);
        if (node.type !== 'directory') return path;

        const items = Object.keys(node.children)
            .filter(name => showHidden || !name.startsWith('.'))
            .sort();

        if (longFormat) {
            return items.map(name => {
                const child = node.children[name];
                const type = child.type === 'directory' ? 'd' : '-';
                const size = child.content ? child.content.length : 4096;
                return `${type}rwxr-xr-x 1 user user ${String(size).padStart(6)} Jan 1 12:00 ${name}`;
            }).join('\n');
        }
        return items.join('  ');
    }

    changeDirectory(path) {
        if (path === '~' || path === '') {
            this.currentDirectory = '/home/user';
        } else {
            const resolvedPath = this.resolvePath(path);
            const node = this.getNode(resolvedPath);
            if (!node) throw new Error(`cd: ${path}: No such file or directory`);
            if (node.type !== 'directory') throw new Error(`cd: ${path}: Not a directory`);
            this.currentDirectory = resolvedPath;
        }
        this.updateUserLabels();
        return '';
    }

    readFile(filename) {
        if (!filename) throw new Error('cat: missing file operand');
        const node = this.getNode(this.resolvePath(filename));
        if (!node) throw new Error(`cat: ${filename}: No such file or directory`);
        if (node.type !== 'file') throw new Error(`cat: ${filename}: Is a directory`);
        return node.content || '';
    }

    makeDirectory(dirname) {
        if (!dirname) throw new Error('mkdir: missing operand');
        const path = this.resolvePath(dirname);
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const dirName = path.substring(path.lastIndexOf('/') + 1);
        const parentNode = this.getNode(parentPath);
        if (!parentNode || parentNode.type !== 'directory') throw new Error(`mkdir: cannot create directory '${dirname}': No such file or directory`);
        if (parentNode.children[dirName]) throw new Error(`mkdir: cannot create directory '${dirname}': File exists`);
        parentNode.children[dirName] = { type: 'directory', children: {} };
        return '';
    }

    createFile(filename) {
        if (!filename) throw new Error('touch: missing file operand');
        const path = this.resolvePath(filename);
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const fileName = path.substring(path.lastIndexOf('/') + 1);
        const parentNode = this.getNode(parentPath);
        if (!parentNode || parentNode.type !== 'directory') throw new Error(`touch: cannot touch '${filename}': No such file or directory`);
        if (!parentNode.children[fileName]) {
            parentNode.children[fileName] = { type: 'file', content: '' };
        }
        return '';
    }

    removeFile(args) {
        if (!args || args.length === 0) throw new Error('rm: missing operand');
        const recursive = args.includes('-r') || args.includes('-rf');
        const filename = args.find(a => !a.startsWith('-'));
        if (!filename) throw new Error('rm: missing operand');

        const path = this.resolvePath(filename);
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const fileName = path.substring(path.lastIndexOf('/') + 1);
        const parentNode = this.getNode(parentPath);
        if (!parentNode || !parentNode.children[fileName]) throw new Error(`rm: cannot remove '${filename}': No such file or directory`);
        if (parentNode.children[fileName].type === 'directory' && !recursive) throw new Error(`rm: cannot remove '${filename}': Is a directory`);
        delete parentNode.children[fileName];
        return '';
    }

    copyFile(source, destination) {
        if (!source || !destination) throw new Error('cp: missing file operand');
        const srcNode = this.getNode(this.resolvePath(source));
        if (!srcNode) throw new Error(`cp: cannot stat '${source}': No such file or directory`);
        if (srcNode.type !== 'file') throw new Error(`cp: '${source}': Is a directory`);

        const dstPath = this.resolvePath(destination);
        const dstNode = this.getNode(dstPath);
        if (dstNode && dstNode.type === 'directory') {
            const baseName = source.split('/').pop();
            dstNode.children[baseName] = { type: 'file', content: srcNode.content };
            return '';
        }

        const dstParentPath = dstPath.substring(0, dstPath.lastIndexOf('/')) || '/';
        const dstFileName = dstPath.substring(dstPath.lastIndexOf('/') + 1);
        const dstParentNode = this.getNode(dstParentPath);
        if (!dstParentNode || dstParentNode.type !== 'directory') throw new Error(`cp: cannot create regular file '${destination}': No such file or directory`);
        dstParentNode.children[dstFileName] = { type: 'file', content: srcNode.content };
        return '';
    }

    moveFile(source, destination) {
        if (!source || !destination) throw new Error('mv: missing file operand');
        this.copyFile(source, destination);
        this.removeFile([source]);
        return '';
    }

    removeDirectory(dirname) {
        if (!dirname) throw new Error('rmdir: missing operand');
        const path = this.resolvePath(dirname);
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const dirName = path.substring(path.lastIndexOf('/') + 1);
        const parentNode = this.getNode(parentPath);
        const targetNode = parentNode?.children?.[dirName];
        if (!targetNode) throw new Error(`rmdir: failed to remove '${dirname}': No such file or directory`);
        if (targetNode.type !== 'directory') throw new Error(`rmdir: failed to remove '${dirname}': Not a directory`);
        if (Object.keys(targetNode.children).length > 0) throw new Error(`rmdir: failed to remove '${dirname}': Directory not empty`);
        delete parentNode.children[dirName];
        return '';
    }

    grepCommand(args) {
        if (args.length < 2) throw new Error('grep: missing pattern or file');
        const pattern = args[0];
        const filename = args[1];
        const node = this.getNode(this.resolvePath(filename));
        if (!node) throw new Error(`grep: ${filename}: No such file or directory`);
        if (node.type !== 'file') throw new Error(`grep: ${filename}: Is a directory`);
        return (node.content || '').split('\n').filter(line => line.includes(pattern)).join('\n');
    }

    findCommand(args) {
        const path = args[0] || this.currentDirectory;
        const namePattern = args.includes('-name') ? args[args.indexOf('-name') + 1] : '*';
        const results = [];
        const search = (currentPath, node) => {
            if (node.type === 'file') {
                if (namePattern === '*' || currentPath.includes(namePattern.replace(/\*/g, ''))) results.push(currentPath);
            } else if (node.type === 'directory') {
                Object.keys(node.children).forEach(childName => {
                    const childPath = currentPath + (currentPath.endsWith('/') ? '' : '/') + childName;
                    search(childPath, node.children[childName]);
                });
            }
        };
        const startNode = this.getNode(this.resolvePath(path));
        if (startNode) search(path, startNode);
        return results.join('\n');
    }

    resolvePath(path) {
        if (path === '.' || !path) return this.currentDirectory;
        if (path.startsWith('/')) return path;
        if (path === '~') return '/home/user';
        if (path.startsWith('~/')) return '/home/user' + path.substring(1);
        if (path === '..') {
            const parts = this.currentDirectory.split('/');
            parts.pop();
            return parts.join('/') || '/';
        }
        if (path.startsWith('../')) {
            const parts = this.currentDirectory.split('/');
            parts.pop();
            return (parts.join('/') || '/') + path.substring(2);
        }
        return this.currentDirectory + (this.currentDirectory.endsWith('/') ? '' : '/') + path;
    }

    getNode(path) {
        if (!path || path === '/') return this.filesystem['/'];
        const parts = path.split('/').filter(Boolean);
        let node = this.filesystem['/'];
        for (const part of parts) {
            if (!node || !node.children || !node.children[part]) return null;
            node = node.children[part];
        }
        return node;
    }

    getHelpText() {
        return `Available Commands:
  Navigation: ls, cd, pwd
  Files:      cat, touch, mkdir, rmdir, rm, cp, mv
  Text:       grep, find, echo
  System:     whoami, date, uname, history, man, clear, help, tutorial`;
    }

    startTutorial() {
        return `Welcome to the Linux Arsenal Tutorial!
1. Type 'pwd' to see your current directory
2. Type 'ls -la' to list all files including hidden ones
3. Type 'cd documents' then 'cat readme.txt'
4. Type 'cd ..' to return home`;
    }

    showHistory() {
        return this.commandHistory.map((cmd, i) => `${i + 1}  ${cmd}`).join('\n');
    }

    showManual(command) {
        const manuals = {
            ls: 'ls [OPTION]... [FILE]... - List directory contents (-a hidden, -l long format)',
            cd: 'cd [DIRECTORY] - Change the working directory',
            cat: 'cat [FILE] - Print file contents to standard output',
            pwd: 'pwd - Print full name of current working directory',
            grep: 'grep [PATTERN] [FILE] - Search for PATTERN in FILE'
        };
        return manuals[command] || `No manual entry for ${command || ''}`;
    }

    clearTerminal() {
        document.getElementById('terminal-output').innerHTML = '';
    }

    showTerminalHelp() {
        this.addOutputToTerminal(this.getHelpText());
    }

    updateCommandHints() {
        const hints = [
            "Try 'ls -la' to see hidden files and detailed information",
            "Use 'cd ..' to go up one directory level",
            "Press Tab to autocomplete commands and filenames",
            "Use Up/Down arrows to cycle through your command history",
            "Try 'grep user /etc/passwd' to search inside a file"
        ];
        document.getElementById('hint-content').textContent = hints[Math.floor(Math.random() * hints.length)];
    }

    handleTabCompletion(input) {
        const parts = input.value.split(' ');
        const lastPart = parts[parts.length - 1];
        if (parts.length === 1) {
            const commands = ['ls', 'cd', 'pwd', 'cat', 'mkdir', 'rmdir', 'touch', 'rm', 'cp', 'mv', 'grep', 'find', 'echo', 'help', 'history', 'man', 'clear', 'tutorial', 'whoami', 'date', 'uname'];
            const matches = commands.filter(cmd => cmd.startsWith(lastPart));
            if (matches.length === 1) input.value = matches[0] + ' ';
            else if (matches.length > 1) this.addOutputToTerminal(matches.join('  '));
        } else {
            const node = this.getNode(this.currentDirectory);
            if (node?.children) {
                const matches = Object.keys(node.children).filter(name => name.startsWith(lastPart));
                if (matches.length === 1) {
                    parts[parts.length - 1] = matches[0];
                    input.value = parts.join(' ') + ' ';
                } else if (matches.length > 1) {
                    this.addOutputToTerminal(matches.join('  '));
                }
            }
        }
    }

    trackCommandUsage(command, success) {
        this.user.totalCommands = (this.user.totalCommands || 0) + 1;
        this.commandCounts[command] = (this.commandCounts[command] || 0) + 1;

        if (success) {
            this.user.successfulCommands = (this.user.successfulCommands || 0) + 1;
            this.user.timeSpent = (this.user.timeSpent || 0) + 1;

            if (!Array.isArray(this.user.learnedCommands)) this.user.learnedCommands = [];
            if (!this.user.learnedCommands.includes(command)) {
                this.user.learnedCommands.push(command);
            }
            this.user.commandsLearned = this.user.learnedCommands.length;

            this.user.xp += 10 + Math.min((this.user.streak || 0) * 2, 20);
            this.updateSkillXP(command, 15);
        }

        this.user.accuracy = Math.round((this.user.successfulCommands / this.user.totalCommands) * 100);
        const accEl = document.getElementById('command-accuracy');
        if (accEl) accEl.textContent = `${this.user.accuracy}%`;

        this.checkLevelUp();
        this.updateUserDisplay();
        this.checkAchievements();
    }

    checkLevelUp() {
        const newLevel = Math.floor(this.user.xp / 150) + 1;
        if (newLevel > this.user.level) {
            this.user.level = newLevel;
            this.user.xp += 25;
            this.showNotification(`Level Up! You are now level ${newLevel}!`, 'success');
        }
    }

    updateSkillXP(command, xp) {
        const map = {
            ls: 'file-ops', cd: 'file-ops', pwd: 'file-ops', cat: 'file-ops',
            mkdir: 'file-ops', rmdir: 'file-ops', touch: 'file-ops', rm: 'file-ops', cp: 'file-ops', mv: 'file-ops',
            grep: 'text-proc', find: 'text-proc', echo: 'text-proc',
            whoami: 'sys-admin', uname: 'sys-admin', date: 'sys-admin'
        };
        const skill = map[command];
        if (skill) this.user.skills[skill] = (this.user.skills[skill] || 0) + xp;
    }

    // ==================== CHALLENGES ====================
    generateChallenges() {
        const templates = {
            beginner: {
                "File Operations": [
                    { title: "List Directory Contents", description: "Use the 'ls' command to list all files in the current directory.", xp: 25, solution: "ls", hints: ["Type 'ls' and press Enter"] },
                    { title: "Navigate to Home Directory", description: "Change to your home directory using the 'cd' command.", xp: 25, solution: "cd ~", hints: ["Use 'cd ~'"] },
                    { title: "Create a New Directory", description: "Create a directory named 'test' in your current location.", xp: 30, solution: "mkdir test", hints: ["Use 'mkdir test'"] },
                    { title: "Find Your Current Location", description: "Display the full path of your current working directory.", xp: 20, solution: "pwd", hints: ["PWD stands for Print Working Directory"] },
                    { title: "Display File Contents", description: "Use 'cat' to display the contents of documents/readme.txt.", xp: 35, solution: "cat documents/readme.txt", hints: ["Syntax: cat documents/readme.txt"] },
                    { title: "Create Empty File", description: "Create an empty file named 'newfile.txt' using touch.", xp: 25, solution: "touch newfile.txt", hints: ["Use 'touch newfile.txt'"] },
                    { title: "Copy a File", description: "Copy 'documents/readme.txt' to your current directory.", xp: 40, solution: "cp documents/readme.txt .", hints: ["Use '.' for current directory"] },
                    { title: "Remove a File", description: "Remove the file 'newfile.txt'.", xp: 30, solution: "rm newfile.txt", hints: ["Use 'rm newfile.txt'"] },
                    { title: "List with Details", description: "List files in long format.", xp: 35, solution: "ls -l", hints: ["Use ls with the -l flag"] },
                    { title: "Show Hidden Files", description: "List all files including hidden ones.", xp: 30, solution: "ls -a", hints: ["Use ls with the -a flag"] }
                ],
                "Text Processing": [
                    { title: "Echo Text", description: "Display 'Hello World' using echo.", xp: 15, solution: "echo Hello World", hints: ["Type: echo Hello World"] },
                    { title: "Count Lines in File", description: "Count lines in documents/readme.txt using wc.", xp: 35, solution: "wc -l documents/readme.txt", hints: ["Use wc -l"] },
                    { title: "Display First 5 Lines", description: "Show the first 5 lines of documents/readme.txt.", xp: 30, solution: "head -n 5 documents/readme.txt", hints: ["Use head -n 5"] },
                    { title: "Display Last 3 Lines", description: "Show the last 3 lines of documents/readme.txt.", xp: 30, solution: "tail -n 3 documents/readme.txt", hints: ["Use tail -n 3"] }
                ],
                "System Administration": [
                    { title: "Check Current User", description: "Display the current username.", xp: 20, solution: "whoami", hints: ["Use whoami"] },
                    { title: "Display Current Date", description: "Show the current system date and time.", xp: 20, solution: "date", hints: ["Use date"] },
                    { title: "System Information", description: "Display basic system information using uname.", xp: 25, solution: "uname", hints: ["Use uname"] },
                    { title: "Detailed System Info", description: "Display all system information with uname.", xp: 40, solution: "uname -a", hints: ["Use uname -a"] }
                ]
            },
            intermediate: {
                "File Operations": [
                    { title: "Recursive Directory Listing", description: "List all files recursively in the home directory.", xp: 50, solution: "ls -R ~", hints: ["Use ls -R ~"] },
                    { title: "Copy Directory Recursively", description: "Copy documents to backup recursively.", xp: 60, solution: "cp -r documents backup", hints: ["Use cp -r"] },
                    { title: "Move and Rename", description: "Move documents/readme.txt to projects/info.txt.", xp: 55, solution: "mv documents/readme.txt projects/info.txt", hints: ["Use mv"] },
                    { title: "Create Nested Directories", description: "Create project/src/main in one command.", xp: 45, solution: "mkdir -p project/src/main", hints: ["Use mkdir -p"] },
                    { title: "File Permissions Check", description: "List all files with detailed permissions.", xp: 50, solution: "ls -la", hints: ["Use ls -la"] }
                ],
                "Text Processing": [
                    { title: "Search Text Patterns", description: "Find lines containing 'user' in /etc/passwd.", xp: 50, solution: "grep user /etc/passwd", hints: ["Use grep user /etc/passwd"] },
                    { title: "Case Insensitive Search", description: "Search for 'user' in /etc/passwd ignoring case.", xp: 55, solution: "grep -i user /etc/passwd", hints: ["Use grep -i"] },
                    { title: "Count Pattern Matches", description: "Count lines containing 'bash' in /etc/passwd.", xp: 60, solution: "grep -c bash /etc/passwd", hints: ["Use grep -c"] },
                    { title: "Sort File Contents", description: "Sort /etc/passwd alphabetically.", xp: 45, solution: "sort /etc/passwd", hints: ["Use sort /etc/passwd"] }
                ],
                "System Administration": [
                    { title: "Process List", description: "Display all running processes.", xp: 55, solution: "ps aux", hints: ["Use ps aux"] },
                    { title: "Disk Usage", description: "Check disk usage in human-readable format.", xp: 50, solution: "du -h", hints: ["Use du -h"] },
                    { title: "Free Memory", description: "Display available memory in human-readable format.", xp: 45, solution: "free -h", hints: ["Use free -h"] },
                    { title: "System Uptime", description: "Display system uptime.", xp: 35, solution: "uptime", hints: ["Use uptime"] }
                ],
                "Networking": [
                    { title: "Network Interfaces", description: "Display network interface configuration.", xp: 60, solution: "ifconfig", hints: ["Use ifconfig"] },
                    { title: "Ping Test", description: "Send 3 ping packets to google.com.", xp: 50, solution: "ping -c 3 google.com", hints: ["Use ping -c 3 google.com"] },
                    { title: "DNS Lookup", description: "Perform a DNS lookup for google.com.", xp: 55, solution: "nslookup google.com", hints: ["Use nslookup google.com"] }
                ]
            },
            advanced: {
                "File Operations": [
                    { title: "Find Recent Text Files", description: "Find all .txt files modified in the last 7 days in home.", xp: 80, solution: "find ~ -name '*.txt' -mtime -7", hints: ["Use find with -name and -mtime -7"] },
                    { title: "Symbolic Links", description: "Create a symlink 'shortcut' pointing to documents.", xp: 70, solution: "ln -s documents shortcut", hints: ["Use ln -s documents shortcut"] },
                    { title: "Archive Creation", description: "Create compressed archive docs.tar.gz of documents.", xp: 90, solution: "tar -czf docs.tar.gz documents", hints: ["Use tar -czf"] }
                ],
                "Text Processing": [
                    { title: "Text Replacement", description: "Replace all 'old' with 'new' in filename using sed.", xp: 95, solution: "sed 's/old/new/g' filename", hints: ["Use sed 's/old/new/g' filename"] },
                    { title: "Extract Columns", description: "Extract 1st and 3rd columns from /etc/passwd using awk.", xp: 100, solution: "awk -F: '{print $1, $3}' /etc/passwd", hints: ["Use awk -F:"] }
                ],
                "Security": [
                    { title: "File Permissions 644", description: "Set permissions of filename to 644.", xp: 80, solution: "chmod 644 filename", hints: ["Use chmod 644 filename"] },
                    { title: "Directory Permissions 755", description: "Set permissions of dirname to 755.", xp: 85, solution: "chmod 755 dirname", hints: ["Use chmod 755 dirname"] },
                    { title: "Change Ownership", description: "Change owner of filename to newowner.", xp: 75, solution: "chown newowner filename", hints: ["Use chown newowner filename"] }
                ]
            },
            expert: {
                "Network Security": [
                    { title: "Listening Ports", description: "List listening TCP/UDP ports using netstat.", xp: 100, solution: "netstat -tuln", hints: ["Use netstat -tuln"] },
                    { title: "Active Connections with PIDs", description: "Show listening ports with process info.", xp: 110, solution: "netstat -tulnp", hints: ["Add -p flag"] }
                ],
                "System Forensics": [
                    { title: "Failed Login Audit", description: "Find failed password attempts in /var/log/auth.log.", xp: 140, solution: "grep 'Failed password' /var/log/auth.log", hints: ["Use grep on /var/log/auth.log"] },
                    { title: "SUID File Audit", description: "Find all SUID files on the system.", xp: 120, solution: "find / -perm -4000", hints: ["Use find / -perm -4000"] }
                ],
                "DevOps": [
                    { title: "List Docker Containers", description: "Show all running Docker containers.", xp: 100, solution: "docker ps", hints: ["Use docker ps"] },
                    { title: "List Kubernetes Pods", description: "List pods with kubectl.", xp: 110, solution: "kubectl get pods", hints: ["Use kubectl get pods"] }
                ]
            }
        };

        this.challenges = [];
        Object.keys(templates).forEach(difficulty => {
            Object.keys(templates[difficulty]).forEach(category => {
                templates[difficulty][category].forEach((tpl, idx) => {
                    this.challenges.push({
                        ...tpl,
                        id: `${difficulty}_${category.toLowerCase().replace(/\s+/g, '_')}_${idx}`,
                        difficulty,
                        category,
                        completed: false
                    });
                });
            });
        });
    }

    loadChallenges() {
        const challengesGrid = document.getElementById('challenges-grid');
        if (!challengesGrid) return;

        this.filteredChallenges = this.challenges.filter(c => {
            let matchesFilter = true;
            if (this.currentFilter === 'completed') matchesFilter = c.completed;
            else if (this.currentFilter !== 'all') matchesFilter = c.difficulty === this.currentFilter;

            const matchesSearch = !this.searchQuery ||
                c.title.toLowerCase().includes(this.searchQuery) ||
                c.description.toLowerCase().includes(this.searchQuery) ||
                c.category.toLowerCase().includes(this.searchQuery);

            return matchesFilter && matchesSearch;
        });

        const visible = this.filteredChallenges.slice(0, this.visibleChallengesCount);

        if (visible.length === 0) {
            challengesGrid.innerHTML = `<div class="chart-placeholder" style="grid-column: 1 / -1; padding: 40px;">No challenges match your current filter.</div>`;
        } else {
            challengesGrid.innerHTML = visible.map(challenge => `
                <div class="challenge-card ${challenge.completed ? 'completed' : ''}" data-challenge-id="${challenge.id}">
                    ${challenge.completed ? `<div class="completed-badge"><i class="fas fa-check-circle"></i> Completed</div>` : ''}
                    <div class="challenge-header">
                        <div class="challenge-title">${this.escapeHtml(challenge.title)}</div>
                        <div class="challenge-difficulty difficulty-${challenge.difficulty}">${challenge.difficulty}</div>
                    </div>
                    <div class="challenge-description">${this.escapeHtml(challenge.description)}</div>
                    <div class="challenge-meta">
                        <div class="challenge-category">${this.escapeHtml(challenge.category)}</div>
                        <div class="challenge-xp">+${challenge.xp} XP</div>
                    </div>
                </div>
            `).join('');
        }

        const loadMoreBtn = document.getElementById('load-more-challenges');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = this.visibleChallengesCount < this.filteredChallenges.length ? 'inline-flex' : 'none';
        }

        challengesGrid.querySelectorAll('.challenge-card').forEach(card => {
            card.addEventListener('click', () => this.openChallenge(card.dataset.challengeId));
        });

        this.updateChallengeStats();
    }

    filterChallenges(filter) {
        this.currentFilter = filter;
        this.visibleChallengesCount = 24;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.filter-btn[data-filter="${filter}"]`)?.classList.add('active');
        this.loadChallenges();
    }

    openChallenge(challengeId) {
        const challenge = this.challenges.find(c => c.id === challengeId);
        if (!challenge) return;

        this.currentChallenge = challenge;
        this.challengeAttempts = 0;
        this.challengeSeconds = 0;

        document.getElementById('challenge-title').textContent = challenge.title;
        document.getElementById('challenge-attempts').textContent = 'Attempts: 0';
        document.getElementById('challenge-time').textContent = '00:00';

        const statusBadge = document.getElementById('challenge-status-badge');
        if (statusBadge) {
            statusBadge.classList.toggle('hidden', !challenge.completed);
        }

        const hintDisplay = document.getElementById('hint-display');
        if (hintDisplay) {
            hintDisplay.classList.add('hidden');
            hintDisplay.textContent = '';
        }

        document.getElementById('challenge-description').innerHTML = `
            <p><strong>Task:</strong> ${this.escapeHtml(challenge.description)}</p>
            <p><strong>Category:</strong> ${this.escapeHtml(challenge.category)} &nbsp;|&nbsp; <strong>Difficulty:</strong> ${this.escapeHtml(challenge.difficulty)} &nbsp;|&nbsp; <strong>Reward:</strong> +${challenge.xp} XP</p>
        `;

        document.getElementById('challenge-output').innerHTML = '<div class="welcome-message">Challenge Terminal - Enter your solution below:</div>';
        document.getElementById('challenge-modal').classList.remove('hidden');

        clearInterval(this.challengeTimerInterval);
        this.challengeTimerInterval = setInterval(() => {
            this.challengeSeconds++;
            const mins = String(Math.floor(this.challengeSeconds / 60)).padStart(2, '0');
            const secs = String(this.challengeSeconds % 60).padStart(2, '0');
            const timeEl = document.getElementById('challenge-time');
            if (timeEl) timeEl.textContent = `${mins}:${secs}`;
        }, 1000);

        const challengeInput = document.getElementById('challenge-input');
        challengeInput.value = '';
        setTimeout(() => challengeInput.focus(), 100);

        challengeInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                this.processChallengeCommand(e.target.value.trim());
                e.target.value = '';
            }
        };
    }

    showChallengeHint() {
        const hintDisplay = document.getElementById('hint-display');
        if (hintDisplay && this.currentChallenge?.hints?.length) {
            hintDisplay.textContent = `Hint: ${this.currentChallenge.hints.join(' • ')}`;
            hintDisplay.classList.remove('hidden');
        }
    }

    processChallengeCommand(command) {
        if (!this.currentChallenge || !command) return;

        this.challengeAttempts++;
        document.getElementById('challenge-attempts').textContent = `Attempts: ${this.challengeAttempts}`;

        const output = document.getElementById('challenge-output');
        const commandDiv = document.createElement('div');
        commandDiv.innerHTML = `<span class="command-prompt">user@challenge:~$</span> <span class="command-text">${this.escapeHtml(command)}</span>`;
        output.appendChild(commandDiv);

        const solution = this.currentChallenge.solution;
        const normalized = command.replace(/\s+/g, ' ').trim().toLowerCase();
        const isCorrect = Array.isArray(solution)
            ? solution.some(s => s.toLowerCase() === normalized)
            : normalized === solution.toLowerCase();

        if (isCorrect) {
            const successDiv = document.createElement('div');
            successDiv.className = 'command-success';
            const alreadyDone = this.currentChallenge.completed;
            successDiv.textContent = alreadyDone
                ? 'Correct! (Already completed previously)'
                : `Correct! Well done! You earned +${this.currentChallenge.xp} XP.`;
            output.appendChild(successDiv);

            this.completeChallenge(this.currentChallenge.id);
            document.getElementById('challenge-status-badge')?.classList.remove('hidden');

            setTimeout(() => this.closeChallenge(), 1500);
        } else {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'command-error';
            errorDiv.textContent = 'Not quite right. Try again or click Show Hint!';
            output.appendChild(errorDiv);

            if (this.settings.autoHints && this.challengeAttempts >= 3) {
                this.showChallengeHint();
            }
        }

        output.scrollTop = output.scrollHeight;
    }

    completeChallenge(challengeId) {
        const challenge = this.challenges.find(c => c.id === challengeId);
        if (!challenge) return;

        if (!challenge.completed) {
            challenge.completed = true;
            this.user.xp += challenge.xp;
            this.checkLevelUp();
            this.showNotification(`Challenge completed! +${challenge.xp} XP`, 'success');
        }

        this.saveProgress();
        this.updateUserDisplay();
        this.checkAchievements();
        this.loadChallenges();
        this.updateDashboard();
        this.updateLeaderboard();
    }

    closeChallenge() {
        clearInterval(this.challengeTimerInterval);
        document.getElementById('challenge-modal')?.classList.add('hidden');
        this.currentChallenge = null;
    }

    // ==================== ACHIEVEMENTS ====================
    initializeAchievements() {
        this.achievementDefinitions = [
            { id: 'first_command', name: 'First Steps', description: 'Execute your first command', icon: 'fas fa-baby', condition: () => this.commandHistory.length >= 1 },
            { id: 'explorer', name: 'Directory Explorer', description: 'Use the cd command 5 times', icon: 'fas fa-compass', condition: () => this.commandHistory.filter(cmd => cmd.startsWith('cd')).length >= 5 },
            { id: 'file_reader', name: 'File Reader', description: 'Read 3 files with cat', icon: 'fas fa-book-open', condition: () => this.commandHistory.filter(cmd => cmd.startsWith('cat')).length >= 3 },
            { id: 'command_master', name: 'Command Master', description: 'Learn 10 different commands', icon: 'fas fa-graduation-cap', condition: () => this.user.commandsLearned >= 10 },
            { id: 'file_manipulator', name: 'File Manipulator', description: 'Reach 100 XP in File Operations', icon: 'fas fa-folder-open', condition: () => this.user.skills['file-ops'] >= 100 },
            { id: 'text_wizard', name: 'Text Wizard', description: 'Reach 100 XP in Text Processing', icon: 'fas fa-magic', condition: () => this.user.skills['text-proc'] >= 100 },
            { id: 'challenge_starter', name: 'Challenge Starter', description: 'Complete 3 beginner challenges', icon: 'fas fa-play', condition: () => this.challenges.filter(c => c.completed && c.difficulty === 'beginner').length >= 3 },
            { id: 'challenge_apprentice', name: 'Challenge Apprentice', description: 'Complete 10 challenges', icon: 'fas fa-star', condition: () => this.challenges.filter(c => c.completed).length >= 10 },
            { id: 'challenge_intermediate', name: 'Intermediate Warrior', description: 'Complete 5 intermediate challenges', icon: 'fas fa-star-half-alt', condition: () => this.challenges.filter(c => c.completed && c.difficulty === 'intermediate').length >= 5 },
            { id: 'challenge_advanced', name: 'Advanced Conqueror', description: 'Complete 3 advanced challenges', icon: 'fas fa-crown', condition: () => this.challenges.filter(c => c.completed && c.difficulty === 'advanced').length >= 3 },
            { id: 'challenge_expert', name: 'Expert Destroyer', description: 'Complete 1 expert challenge', icon: 'fas fa-dragon', condition: () => this.challenges.filter(c => c.completed && c.difficulty === 'expert').length >= 1 },
            { id: 'xp_hunter', name: 'XP Hunter', description: 'Earn 500 XP', icon: 'fas fa-coins', condition: () => this.user.xp >= 500 },
            { id: 'xp_collector', name: 'XP Collector', description: 'Earn 1000 XP', icon: 'fas fa-gem', condition: () => this.user.xp >= 1000 },
            { id: 'level_three', name: 'Level 3 Achiever', description: 'Reach level 3', icon: 'fas fa-medal', condition: () => this.user.level >= 3 },
            { id: 'level_five', name: 'Level 5 Hero', description: 'Reach level 5', icon: 'fas fa-trophy', condition: () => this.user.level >= 5 },
            { id: 'streak_three', name: 'Three Day Streak', description: 'Maintain a 3-day streak', icon: 'fas fa-fire', condition: () => this.user.streak >= 3 },
            { id: 'terminal_master', name: 'Terminal Master', description: 'Execute 50 commands', icon: 'fas fa-terminal', condition: () => this.commandHistory.length >= 50 },
            { id: 'egg_hermit', name: 'Disciple of Hermit', description: 'Discover Ashwin Vadakkeel (aka Hermit)\'s secret command', icon: 'fas fa-user-secret', condition: () => this.discoveredEggs.has('hermit_tribute') },
            { id: 'egg_matrix', name: 'The One', description: 'Activate Matrix Digital Rain in the terminal', icon: 'fas fa-glasses', condition: () => this.discoveredEggs.has('matrix_rain') },
            { id: 'egg_konami', name: 'Konami Legend', description: 'Unlock Hermit Developer Mode via Konami Code', icon: 'fas fa-gamepad', condition: () => this.discoveredEggs.has('konami_mode') },
            { id: 'egg_hunter', name: 'Easter Egg Hunter', description: 'Discover 3 different hidden Easter eggs', icon: 'fas fa-egg', condition: () => this.discoveredEggs.size >= 3 }
        ];
    }

    checkAchievements() {
        let unlockedAny = false;
        this.achievementDefinitions.forEach(a => {
            if (!this.achievements.includes(a.id) && a.condition()) {
                this.achievements.push(a.id);
                this.user.xp += 50;
                unlockedAny = true;
                this.showNotification(`Achievement Unlocked: ${a.name}! (+50 XP)`, 'success');
            }
        });
        if (unlockedAny) {
            this.checkLevelUp();
            this.saveProgress();
            this.updateUserDisplay();
            this.loadAchievements();
        }
    }

    loadAchievements() {
        const unlockedEl = document.getElementById('unlocked-count');
        const totalEl = document.getElementById('total-achievements');
        if (unlockedEl) unlockedEl.textContent = this.achievements.length;
        if (totalEl) totalEl.textContent = this.achievementDefinitions.length;

        const grid = document.getElementById('achievements-grid');
        if (!grid) return;
        grid.innerHTML = this.achievementDefinitions.map(a => {
            const unlocked = this.achievements.includes(a.id);
            return `
                <div class="achievement-card ${unlocked ? 'unlocked' : ''}">
                    <div class="achievement-icon"><i class="${a.icon}"></i></div>
                    <div class="achievement-name">${this.escapeHtml(a.name)}</div>
                    <div class="achievement-description">${this.escapeHtml(a.description)}</div>
                </div>
            `;
        }).join('');
    }

    // ==================== LEADERBOARD (MULTI-USER) ====================
    updateLeaderboard() {
        const multiplier = this.leaderboardPeriod === 'weekly' ? 0.3 : this.leaderboardPeriod === 'monthly' ? 0.65 : 1;

        const mockUsers = [
            { name: 'LinuxNinja', level: 15, xp: Math.round(2450 * multiplier), streak: 21, challenges: 42, isLocal: false },
            { name: 'TerminalMaster', level: 12, xp: Math.round(1890 * multiplier), streak: 15, challenges: 34, isLocal: false },
            { name: 'CommandGuru', level: 11, xp: Math.round(1654 * multiplier), streak: 8, challenges: 28, isLocal: false },
            { name: 'BashExpert', level: 10, xp: Math.round(1543 * multiplier), streak: 12, challenges: 24, isLocal: false }
        ];

        // Include ALL local user profiles so multiple users can compete
        const localUsers = Object.keys(this.profiles).map(name => {
            const p = this.profiles[name];
            const isCurrent = name === this.activeUsername;
            return {
                name,
                level: isCurrent ? this.user.level : (p.user?.level || 1),
                xp: isCurrent ? this.user.xp : (p.user?.xp || 0),
                streak: isCurrent ? this.user.streak : (p.user?.streak || 0),
                challenges: isCurrent
                    ? this.challenges.filter(c => c.completed).length
                    : (p.completedChallengeIds?.length || 0),
                isLocal: true,
                isCurrent
            };
        });

        const combined = [...mockUsers, ...localUsers].sort((a, b) => b.xp - a.xp);

        const list = document.getElementById('leaderboard-list');
        if (!list) return;
        list.innerHTML = combined.map((u, idx) => `
            <div class="leaderboard-entry ${u.isCurrent ? 'current-user' : ''}">
                <div class="entry-rank ${idx < 3 ? 'top-3' : ''}">#${idx + 1}</div>
                <div class="entry-user">
                    ${this.escapeHtml(u.name)}
                    ${u.isCurrent ? '<span class="local-badge">You</span>' : (u.isLocal ? '<span class="local-badge">Local</span>' : '')}
                </div>
                <div class="entry-level">${u.level}</div>
                <div class="entry-xp">${u.xp}</div>
                <div class="entry-streak">${u.streak}</div>
                <div class="entry-challenges">${u.challenges}</div>
            </div>
        `).join('');
    }

    // ==================== ANALYTICS ====================
    updateAnalytics() {
        // Skill XP breakdown
        const timeChart = document.getElementById('time-chart');
        if (timeChart) {
            const skills = Object.entries(this.user.skills);
            const maxSkill = Math.max(...skills.map(([, v]) => v), 1);
            timeChart.innerHTML = skills.map(([name, val]) => `
                <div class="command-freq-item">
                    <span class="command">${name}</span>
                    <div class="freq-bar"><div class="freq-fill" style="width:${Math.round((val / maxSkill) * 100)}%"></div></div>
                    <span class="freq-count">${val} XP</span>
                </div>
            `).join('');
        }

        // Accuracy chart
        const accChart = document.getElementById('accuracy-chart');
        if (accChart) {
            accChart.innerHTML = `
                <div class="analytics-summary-grid">
                    <div class="analytics-mini-stat"><strong>${this.user.accuracy}%</strong><span>Accuracy</span></div>
                    <div class="analytics-mini-stat"><strong>${this.user.totalCommands || 0}</strong><span>Total Runs</span></div>
                    <div class="analytics-mini-stat"><strong>${this.user.successfulCommands || 0}</strong><span>Successful</span></div>
                    <div class="analytics-mini-stat"><strong>${(this.user.totalCommands || 0) - (this.user.successfulCommands || 0)}</strong><span>Errors</span></div>
                </div>
            `;
        }

        // Most used commands
        const freqEl = document.getElementById('command-frequency');
        if (freqEl) {
            const entries = Object.entries(this.commandCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
            if (entries.length === 0) {
                freqEl.innerHTML = '<div class="chart-placeholder">Run commands in the terminal to track frequency</div>';
            } else {
                const maxCount = entries[0][1];
                freqEl.innerHTML = entries.map(([cmd, count]) => `
                    <div class="command-freq-item">
                        <span class="command">${this.escapeHtml(cmd)}</span>
                        <div class="freq-bar"><div class="freq-fill" style="width:${Math.round((count / maxCount) * 100)}%"></div></div>
                        <span class="freq-count">${count}</span>
                    </div>
                `).join('');
            }
        }

        // Challenge & Streak summary
        const streakCal = document.getElementById('streak-calendar');
        if (streakCal) {
            const completed = this.challenges.filter(c => c.completed).length;
            streakCal.innerHTML = `
                <div class="analytics-summary-grid">
                    <div class="analytics-mini-stat"><strong>${completed}/${this.challenges.length}</strong><span>Challenges Done</span></div>
                    <div class="analytics-mini-stat"><strong>${this.user.streak}d</strong><span>Current Streak</span></div>
                    <div class="analytics-mini-stat"><strong>${this.achievements.length}</strong><span>Achievements</span></div>
                    <div class="analytics-mini-stat"><strong>Lv. ${this.user.level}</strong><span>Current Level</span></div>
                </div>
            `;
        }
    }

    // ==================== AI ASSISTANT ====================
    toggleAIAssistant() {
        const assistant = document.getElementById('ai-assistant');
        const toggleBtn = document.getElementById('toggle-assistant');
        assistant?.classList.remove('minimized');
        this.aiAssistantOpen = !this.aiAssistantOpen;
        assistant?.classList.toggle('collapsed', !this.aiAssistantOpen);
        if (toggleBtn) {
            toggleBtn.innerHTML = this.aiAssistantOpen
                ? '<i class="fas fa-chevron-down"></i>'
                : '<i class="fas fa-chevron-up"></i>';
        }
    }

    sendAIMessage() {
        const input = document.getElementById('chat-input');
        const message = input?.value.trim();
        if (!message) return;

        this.addChatMessage(message, 'user');
        input.value = '';

        setTimeout(() => {
            this.addChatMessage(this.generateAIResponse(message), 'assistant');
        }, 400);
    }

    addChatMessage(message, sender) {
        const chatMessages = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `${sender}-message`;
        const avatar = sender === 'assistant' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">${this.escapeHtml(message).replace(/\n/g, '<br>')}</div>
        `;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    generateAIResponse(message) {
        const m = message.toLowerCase();
        if (m.includes('hermit') || m.includes('ashwin')) return "This version of Linux Arsenal was modified and upgraded by Ashwin Vadakkeel (aka Hermit)! Try typing 'hermit' or 'neofetch' in the terminal.";
        if (m.includes('easter') || m.includes('secret')) return "🤫 Looking for secrets? Try typing 'hermit', 'matrix', 'cowsay hello', 'sl', 'neofetch', 'fortune', 'hack', or even 'sudo rm -rf /' in the terminal... or enter the Konami Code!";
        if (m.includes('ls') || m.includes('list files')) return "Use 'ls' to list directory contents. Add '-l' for details, '-a' for hidden files, or '-la' for both.";
        if (m.includes('cd')) return "Use 'cd <dir>' to change directories. 'cd ~' goes home and 'cd ..' moves up one level.";
        if (m.includes('grep')) return "'grep' searches for text patterns in files. Example: grep -i 'error' /var/log/system.log";
        if (m.includes('chmod') || m.includes('permission')) return "'chmod' updates file permissions. Common modes: 755 (rwxr-xr-x) for directories/scripts, 644 (rw-r--r--) for files.";
        if (m.includes('tip')) {
            const tips = [
                "Use Tab completion in the terminal to autocomplete commands and file paths.",
                "Use Up/Down arrow keys to quickly repeat previous commands.",
                "Switch profiles anytime from the top-right user button so multiple learners can track their own progress."
            ];
            return tips[Math.floor(Math.random() * tips.length)];
        }
        return "Ask me about Linux commands like ls, cd, grep, chmod, or click a quick suggestion above!";
    }

    // ==================== EASTER EGGS (BY ASHWIN VADAKKEEL AKA HERMIT) ====================
    unlockEasterEgg(eggId, message, bonusXp = 25) {
        if (!this.discoveredEggs.has(eggId)) {
            this.discoveredEggs.add(eggId);
            this.user.xp += bonusXp;
            this.checkLevelUp();
            this.showNotification(`🥚 Easter Egg! ${message} (+${bonusXp} XP)`, 'success');
            this.updateUserDisplay();
            this.checkAchievements();
            this.saveProgress();
        }
    }

    activateHermitMode() {
        document.body.classList.toggle('hermit-mode');
        const active = document.body.classList.contains('hermit-mode');
        if (!this.discoveredEggs.has('konami_mode')) {
            this.unlockEasterEgg('konami_mode', 'Hermit Developer Mode Activated!', 100);
        } else {
            this.showNotification(active ? '⚡ Hermit Overdrive Mode: ON' : 'Hermit Overdrive Mode: OFF', 'info');
        }
    }

    easterHermit() {
        return `
 _   _ _____ ____  __  __ ___ _____
| | | | ____|  _ \\|  \\/  |_ _|_   _|
| |_| |  _| | |_) | |\\/| || |  | |
|  _  | |___|  _ <| |  | || |  | |
|_| |_|_____|_| \\_\\_|  |_|___| |_|

================================================
  Linux Arsenal — Modified by Ashwin Vadakkeel
               (aka Hermit)
================================================
  "Real mastery happens in the terminal."
  Tip: Try 'matrix', 'neofetch', 'cowsay', 'sl',
       'fortune', 'hack', or the Konami Code!`;
    }

    easterNeofetch() {
        const completed = this.challenges.filter(c => c.completed).length;
        return `
       .--.          ${this.activeUsername}@linux-arsenal
      |o_o |         --------------------------
      |:_/ |         OS: Linux Arsenal OS (Hermit Edition)
     //   \\ \\        Modified By: Ashwin Vadakkeel (aka Hermit)
    (|     | )       Shell: arsenal-bash 5.2
   /'\\_   _/\`\\       Level: ${this.user.level} (${this.user.xp} XP)
   \\___)=(___/       Challenges: ${completed}/${this.challenges.length} completed
                     Easter Eggs Found: ${this.discoveredEggs.size}`;
    }

    easterCowsay(text) {
        const msg = text || 'Moo! Modified by Ashwin Vadakkeel (aka Hermit)!';
        const line = '-'.repeat(msg.length + 2);
        return `
 ${line}
< ${msg} >
 ${line}
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`;
    }

    easterSteamLocomotive() {
        return `
      ====        ________                ___________
  _D _|  |_______/        \\__I_I_____===__|_________|
   |(_)---  |   H\\________/ |   |        =|___ ___|
   /     |  |   H  |  |     |   |         ||_| |_||
  |      |  |   H  |__--------------------| [___] |
  | ________|___H__/__|_____/[][]~\\_______|       |
  |/ |   |-----------I_____I [][] []  D   |=======|__
__/ =| o |=-~~\\  /~~\\  /~~\\  /~~\\ ____Y___________|__
 |/-=|___|=    ||    ||    ||    |_____/~\\___/
  \\_/      \\O=====O=====O=====O_/      \\_/

Oops! You typed 'sl' instead of 'ls' — classic Linux rite of passage!`;
    }

    easterSudoRmRf() {
        return `[sudo] password for ${this.activeUsername}: ********
WARNING: Deleting /boot ...
WARNING: Deleting /etc/passwd ...
WARNING: Deleting /home/user ...
CRITICAL: Kernel panic in 3... 2... 1...

😎 Just kidding! Nice try — Ashwin Vadakkeel (aka Hermit)'s sandbox has your back.`;
    }

    easterFortune() {
        const fortunes = [
            '"Talk is cheap. Show me the code." — Linus Torvalds',
            '"In a world without walls and fences, who needs Windows and Gates?"',
            '"There is no place like 127.0.0.1."',
            '"To err is human; to really foul things up requires root privileges."',
            '"Master the shell, and the machine obeys." — Hermit'
        ];
        return `🔮 ${fortunes[Math.floor(Math.random() * fortunes.length)]}`;
    }

    easterHack() {
        return `[+] Initializing Hermit Cyber-Trace v2.0...
[+] Scanning ports on 127.0.0.1 ... OPEN
[+] Bypassing Gibson mainframe firewall ... DONE
[+] Decrypting /etc/shadow with quantum regex ... 100%
[✓] ACCESS GRANTED. Welcome, ${this.activeUsername} (Root of Simulation).`;
    }

    toggleMatrixRain() {
        const canvas = document.getElementById('matrix-canvas');
        if (!canvas) return 'Matrix canvas unavailable.';

        if (this.matrixActive) {
            clearInterval(this.matrixInterval);
            this.matrixActive = false;
            canvas.classList.add('hidden');
            return 'Matrix Digital Rain deactivated. Welcome back to reality.';
        }

        this.matrixActive = true;
        canvas.classList.remove('hidden');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const letters = '01HERMITASHWINLINUXARSENAL$#%&*@';
        const fontSize = 14;
        const columns = Math.floor(canvas.width / fontSize);
        const drops = Array(columns).fill(1);

        this.matrixInterval = setInterval(() => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#00ff41';
            ctx.font = `${fontSize}px "Fira Code", monospace`;
            for (let i = 0; i < drops.length; i++) {
                const char = letters[Math.floor(Math.random() * letters.length)];
                ctx.fillText(char, i * fontSize, drops[i] * fontSize);
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        }, 45);

        return '🟢 Matrix Digital Rain activated! Type "matrix" again to exit.';
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LinuxArsenal();
});
