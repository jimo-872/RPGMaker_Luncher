const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// --- Config & State ---
let libraryPath = localStorage.getItem('rpg_library_path');
let appSettings = {
    webWidth: 816,
    webHeight: 624,
    webFullscreen: false,
    recursiveScan: false
};
let isScanning = false;
const busyPaths = new Set();
const scannedPaths = new Set();
let libGames = [];
let currentSort = localStorage.getItem('rpg_sort_type') || 'name_asc';

// --- Junk List (Shared for detection and cleaning) ---
const SLIM_JUNK_FILES = [
    'nw.exe', 'Game.exe', 'crashpad_handler.exe', 'notification_helper.exe',
    'nw.dll', 'node.dll', 'ffmpeg.dll', 'libGLESv2.dll', 'libEGL.dll',
    'vk_swiftshader.dll', 'vulcan-1.dll', 'nw_100_percent.pak', 'nw_200_percent.pak',
    'resources.pak', 'icudtl.dat', 'v8_context_snapshot.bin', 'credits.html',
    'd3dcompiler_47.dll', 'natives_blob.bin', 'nw_elf.dll', 'snapshot_blob.bin',
    'ffmpegsumo.dll', 'nw.pak', 'pdf.dll'
];
const SLIM_JUNK_FOLDERS = ['locales', 'swiftshader', 'pnacl'];

// Load saved settings
const savedSettings = localStorage.getItem('app_settings');
if (savedSettings) {
    try {
        appSettings = { ...appSettings, ...JSON.parse(savedSettings) };
    } catch (e) {
        console.error('Failed to parse settings', e);
    }
}

// --- UI Elements ---
const launcherView = document.getElementById('launcher-view');
const gameView = document.getElementById('game-view');
const gameFrame = document.getElementById('game-frame');
const btnExitGame = document.getElementById('btn-exit-game');

const btnSelectFolder = document.getElementById('btn-select-folder');
const btnSelectFolderHero = document.getElementById('btn-select-folder-hero');
const folderPicker = document.getElementById('folder-picker');
const emptyState = document.getElementById('empty-state');
const gameGrid = document.getElementById('game-grid');
const statusText = document.getElementById('status-text');

const searchInput = document.getElementById('search-input');
const filterSlim = document.getElementById('filter-slim');
const filterEngine = document.getElementById('filter-engine');

const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsModal = document.getElementById('settings-modal');
const inputWidth = document.getElementById('setting-width');
const inputHeight = document.getElementById('setting-height');
const inputFullscreen = document.getElementById('setting-fullscreen');

const inputRecursive = document.getElementById('setting-recursive');

const btnRescan = document.getElementById('btn-rescan');
const btnSlimAll = document.getElementById('btn-slim-all');

const slimModal = document.getElementById('slim-modal');
const btnCloseSlim = document.getElementById('btn-close-slim');
const btnCancelSlim = document.getElementById('btn-cancel-slim');
const btnConfirmSlim = document.getElementById('btn-confirm-slim');
const slimTitle = document.getElementById('slim-title');
const slimCount = document.getElementById('slim-count');
const slimSize = document.getElementById('slim-size');
const networkWarning = document.getElementById('network-warning');

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    if (libraryPath && fs.existsSync(libraryPath)) {
        loadLibrary(libraryPath);
    } else {
        showEmptyState();
    }
});

// --- Filter Logic ---
function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    const filterType = filterSlim.value; // 'all', 'slim', 'full'
    const filterEng = filterEngine.value; // 'all', 'web', 'tyrano', 'exe'
    const cards = document.querySelectorAll('.game-card');

    cards.forEach(card => {
        const title = card.getAttribute('data-title').toLowerCase();
        const folder = card.getAttribute('data-folder').toLowerCase();
        const isSlim = card.getAttribute('data-slim') === 'true';
        const engine = card.getAttribute('data-engine');

        // 1. Text Match
        const matchText = title.includes(query) || folder.includes(query);

        // 2. Type/Slim Match
        let matchSlim = true;
        if (filterType === 'slim' && !isSlim) matchSlim = false;
        if (filterType === 'full' && isSlim) matchSlim = false;

        // 3. Engine Match
        let matchEngine = true;
        if (filterEng !== 'all' && engine !== filterEng) matchEngine = false;

        if (matchText && matchSlim && matchEngine) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

searchInput.addEventListener('input', applyFilters);
filterSlim.addEventListener('change', applyFilters);
filterEngine.addEventListener('change', applyFilters);

// --- View Management ---
function showLauncherView() {
    document.body.classList.remove('in-game');
    gameView.classList.add('hidden');
    launcherView.classList.remove('hidden');

    // Clear game frame to stop game
    gameFrame.src = 'about:blank';

    // Restore window size if it was changed?
    // User might want the launcher to come back to original size.
    // For now, let's just leave it as is.

    // Reset CWD back to app path?
    // It's good practice.
    try {
        const appPath = path.dirname(process.execPath);
        process.chdir(appPath);
    } catch (e) { }

    // Reset Title
    document.title = "RPG Maker Universal Launcher";
}

function showGameView(url, width, height, fullscreen) {
    // --- Start Game ---
    // console.log(`Launching ${folderPath} (${type})`); // folderPath and type are not available here.

    // UI Update: Enter Game Mode
    document.body.classList.add('in-game');

    // Hide Launcher, Show Game
    launcherView.classList.add('hidden');
    gameView.classList.remove('hidden');

    const win = nw.Window.get();

    // Apply Window Settings
    if (fullscreen) {
        win.enterFullscreen();
    } else {
        if (width && height) {
            // Center? 
            // Simple resize for now. 
            // Note: resizing might be jarring.
            win.resizeTo(width, height);
            win.setPosition('center');
        }
    }

    gameFrame.src = url;
}


// --- Event Listeners ---
btnSelectFolder.addEventListener('click', () => folderPicker.click());
btnSelectFolderHero.addEventListener('click', () => folderPicker.click());

folderPicker.addEventListener('change', (e) => {
    const selectedPath = e.target.value;
    if (selectedPath) {
        setLibraryPath(selectedPath);
        e.target.value = '';
    }
});

btnSettings.addEventListener('click', () => {
    inputWidth.value = appSettings.webWidth;
    inputHeight.value = appSettings.webHeight;
    inputFullscreen.checked = appSettings.webFullscreen;
    inputRecursive.checked = appSettings.recursiveScan;
    settingsModal.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

btnSaveSettings.addEventListener('click', () => {
    appSettings.webWidth = parseInt(inputWidth.value) || 816;
    appSettings.webHeight = parseInt(inputHeight.value) || 624;
    appSettings.webFullscreen = inputFullscreen.checked;
    appSettings.recursiveScan = inputRecursive.checked;

    localStorage.setItem('app_settings', JSON.stringify(appSettings));
    settingsModal.classList.add('hidden');

    if (libraryPath) loadLibrary(libraryPath);
});

btnExitGame.addEventListener('click', () => {
    showLauncherView();
});


// --- Library Logic ---

function setLibraryPath(path) {
    if (!path) return;
    libraryPath = path;
    localStorage.setItem('rpg_library_path', path);
    loadLibrary(path);
}

function showEmptyState() {
    emptyState.classList.remove('hidden');
    gameGrid.classList.add('hidden');
    statusText.innerText = "等待設定遊戲庫...";
}

async function loadLibrary(rootPath, forceDeep = false) {
    emptyState.classList.add('hidden');
    gameGrid.classList.remove('hidden');

    // 1. Try Load from Cache (Normalize path for key)
    const cacheKey = `rpg_cache_${rootPath.toLowerCase()}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        try {
            const games = JSON.parse(cachedData);
            console.log(`[Cache] Loaded ${games.length} games from cache.`);
            renderGameList(games);
            statusText.innerText = `已載入快取 (${games.length} 個遊戲). 正在背景掃描...`;
        } catch (e) {
            console.error("Cache parse error", e);
            gameGrid.innerHTML = '';
        }
    } else {
        gameGrid.innerHTML = '';
        statusText.innerText = `正在掃描: ${rootPath}`;
    }

    // 2. Background Scan
    isScanning = true;
    if (btnRescan) {
        btnRescan.disabled = true;
        btnRescan.title = "掃描進行中...";
    }
    const btnDeepScan = document.getElementById('btn-deep-scan');

    if (btnDeepScan) {
        btnDeepScan.disabled = true;
        btnDeepScan.title = "掃描進行中...";
    }
    scannedPaths.clear();
    try {
        // Calculate isNetwork ONCE for the whole library to avoid per-game overhead
        const driveType = await getDriveType(rootPath);
        const isNetwork = (driveType === 4 || rootPath.startsWith('\\\\'));

        const games = await scanLibrary(rootPath, forceDeep, isNetwork);

        // 3. Update UI & Cache (Normalize path for key)
        renderGameList(games);
        localStorage.setItem(cacheKey, JSON.stringify(games));

        if (games.length === 0) {
            statusText.innerText = `掃描完成。在 ${rootPath} 中未發現遊戲。`;
        } else {
            statusText.innerText = `掃描完成。共發現 ${games.length} 個遊戲。`;
        }

    } catch (err) {
        console.error(err);
        statusText.innerText = `錯誤: ${err.message}`;
        if (!cachedData) showEmptyState();
    } finally {
        isScanning = false;
        if (btnRescan) {
            btnRescan.disabled = false;
            btnRescan.title = "快速重新整理 (使用快取)";
        }
        const btnDeepScan = document.getElementById('btn-deep-scan');
        if (btnDeepScan) {
            btnDeepScan.disabled = false;
            btnDeepScan.title = "深度掃描 (忽略快取)";
        }
    }
}

async function refreshSingleGame(folderPath) {
    const title = path.basename(folderPath); // Fallback title
    // Force a deep scan to re-verify files (important after slim/rename)
    const metadata = await getGameMetadata(folderPath, title, true);
    if (!metadata) return;

    // 1. Update global in-memory array (libGames)
    const memIdx = libGames.findIndex(g => g.folderPath.toLowerCase() === folderPath.toLowerCase());
    if (memIdx !== -1) {
        libGames[memIdx] = metadata;
    }
    const cacheKey = `rpg_cache_${libraryPath.toLowerCase()}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        try {
            let games = JSON.parse(cachedData);
            const idx = games.findIndex(g => g.folderPath === folderPath);
            if (idx !== -1) {
                games[idx] = metadata;
                localStorage.setItem(cacheKey, JSON.stringify(games));
            }
        } catch (e) { }
    }

    // Update UI Card
    const card = document.querySelector(`.game-card[data-path=${JSON.stringify(folderPath)}]`);
    if (card) {
        const parent = card.parentNode;
        const newCard = createGameCard(metadata);
        parent.replaceChild(newCard, card);
        applyFilters(); // Re-apply current search/filter
    }
}

async function scanLibrary(rootPath, forceDeep = false, isNetwork = false) {
    let games = [];

    if (appSettings.recursiveScan) {
        games = await scanRecursively(rootPath, 3, forceDeep, isNetwork);
    } else {
        const items = await fs.promises.readdir(rootPath, { withFileTypes: true });
        const gameFolders = items.filter(dirent => dirent.isDirectory());

        for (const dir of gameFolders) {
            const fullPath = path.join(rootPath, dir.name);
            const metadata = await getGameMetadata(fullPath, dir.name, forceDeep, isNetwork);
            if (metadata) games.push(metadata);
        }
    }
    return games;
}

async function scanRecursively(currentPath, depth, forceDeep = false, isNetwork = false) {
    if (depth <= 0) return [];
    let games = [];

    try {
        const items = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const dirent of items) {
            if (dirent.isDirectory()) {
                const fullPath = path.join(currentPath, dirent.name);
                const metadata = await getGameMetadata(fullPath, dirent.name, forceDeep, isNetwork);

                if (metadata) {
                    games.push(metadata);
                } else {
                    const subGames = await scanRecursively(fullPath, depth - 1, forceDeep, isNetwork);
                    games = games.concat(subGames);
                }
            }
        }
    } catch (e) { }
    return games;
}

async function getGameMetadata(folderPath, folderName, forceDeep = false, isNetwork = null) {
    const cacheKey = `game_meta_${folderPath.toLowerCase()}`;

    // 1. Quick Path: Use cache if it exists and we're not forcing a deep scan
    if (!forceDeep) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                // Basic validation: must match path (case-insensitive) and exist
                if (data && data.folderPath.toLowerCase() === folderPath.toLowerCase() && fs.existsSync(folderPath)) {
                    // Update scanned status for UI
                    scannedPaths.add(folderPath);
                    return data;
                }
            } catch (e) { }
        }
    }

    if (busyPaths.has(folderPath)) return null;
    busyPaths.add(folderPath);
    try {
        // 0. Filter out common non-game folders
        // 'app', 'resources', 'www': Prevent detecting internal game structures as separate games
        const ignoreList = ['manual', 'help', 'readme', 'documentation', 'css', 'js', 'fonts', 'images', 'img', 'audio', 'locales', 'app', 'resources', 'www', 'icon'];
        if (ignoreList.includes(folderName.toLowerCase())) return null;

        let entryPoint = null;
        let type = 'unknown';

        // 1. Check for Web/MV/MZ
        // Stricter Check: Must have index.html AND (package.json OR js/ OR data/ OR www/)
        const hasIndex = fs.existsSync(path.join(folderPath, 'index.html'));
        const hasWwwIndex = fs.existsSync(path.join(folderPath, 'www', 'index.html'));

        if (hasIndex) {
            // 1. RPG Maker MV/MZ Check
            if (fs.existsSync(path.join(folderPath, 'js', 'rpg_core.js')) ||
                fs.existsSync(path.join(folderPath, 'js', 'rmmz_core.js'))) {
                entryPoint = 'index.html';
                type = 'web';
            }
            // 2. TyranoBuilder Check
            else if (fs.existsSync(path.join(folderPath, 'tyrano'))) {
                entryPoint = 'index.html';
                type = 'tyrano';
            }
            // Also check for www folder structure (sometimes js is inside www)
            else if (fs.existsSync(path.join(folderPath, 'www', 'js', 'rpg_core.js')) ||
                fs.existsSync(path.join(folderPath, 'www', 'js', 'rmmz_core.js'))) {
                entryPoint = 'index.html';
                type = 'web';
            }
        }

        if (!entryPoint && hasWwwIndex) {
            // Enforce core check for www structure too
            if (fs.existsSync(path.join(folderPath, 'www', 'js', 'rpg_core.js')) ||
                fs.existsSync(path.join(folderPath, 'www', 'js', 'rmmz_core.js'))) {
                entryPoint = 'www/index.html';
                type = 'web';
            }
            // Check Tyrano in www? (Unlikely but possible)
            else if (fs.existsSync(path.join(folderPath, 'www', 'tyrano'))) {
                entryPoint = 'www/index.html';
                type = 'tyrano';
            }
        }
        /*     // 2. Check for Legacy EXE (Optional, can be removed if not needed)
            else if (fs.existsSync(path.join(folderPath, 'Game.exe'))) {
                entryPoint = 'Game.exe';
                type = 'exe';
            }
         */
        if (!entryPoint) return null;

        let title = null;
        let iconPath = null;
        let windowConfig = null;

        // 1. Priority: System.json (RPG Maker) or Config.tjs (Tyrano)
        if (type === 'web') {
            try {
                const possibleSysPaths = [
                    path.join(folderPath, 'www', 'data', 'System.json'),
                    path.join(folderPath, 'data', 'System.json')
                ];

                for (const sysPath of possibleSysPaths) {
                    if (fs.existsSync(sysPath)) {
                        console.log(`[TitleCheck] Found System.json at: ${sysPath}`);
                        try {
                            const sysData = JSON.parse(fs.readFileSync(sysPath, 'utf8'));
                            if (sysData.gameTitle && sysData.gameTitle.trim() !== "") {
                                title = sysData.gameTitle;
                                console.log(`[TitleCheck] Extracted RM title: "${title}"`);
                                break;
                            }
                        } catch (jsonErr) {
                            console.error(`[TitleCheck] Error parsing System.json: ${jsonErr.message}`);
                        }
                    }
                }
            } catch (err) {
                console.warn('Failed to read System.json for', folderName, err);
            }
        } else if (type === 'tyrano') {
            // Try parsing Config.tjs
            try {
                const possibleConfigPaths = [
                    path.join(folderPath, 'data', 'system', 'Config.tjs'),
                    path.join(folderPath, 'www', 'data', 'system', 'Config.tjs')
                ];

                for (const cfgPath of possibleConfigPaths) {
                    if (fs.existsSync(cfgPath)) {
                        // Read as buffer first to handle potential UTF-16
                        const buffer = fs.readFileSync(cfgPath);
                        let content = "";

                        // Heuristic for UTF-16 LE
                        if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
                            content = buffer.toString('utf16le');
                        } else {
                            content = buffer.toString('utf8');
                        }

                        // Debug: log first line or relevant part
                        console.log(`[TitleCheck] Config.tjs content start: ${content.substring(0, 100).replace(/\r?\n/g, ' ')}...`);

                        // Robust regex: capture whatever follows System.title
                        const match = content.match(/System\.title\s*=\s*(["'])(.*?)\1/);
                        if (match && match[2]) {
                            title = match[2];
                            console.log(`[TitleCheck] Extracted Tyrano title: "${title}"`);
                            break;
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to read Config.tjs for', folderName, e);
            }
        }

        // 2. Secondary: package.json (Check root and www/)
        try {
            const possiblePkgPaths = [
                path.join(folderPath, 'package.json'),
                path.join(folderPath, 'www', 'package.json')
            ];
            for (const pkgPath of possiblePkgPaths) {
                if (fs.existsSync(pkgPath)) {
                    console.log(`[TitleCheck] Found package.json at: ${pkgPath}`);
                    const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    if (!title && pkgData.name && pkgData.name !== "rmmz-game" && pkgData.name !== "rmmv-game") {
                        title = pkgData.name;
                    }
                    if (pkgData.window && !windowConfig) windowConfig = pkgData.window;
                    if (title) break;
                }
            }
        } catch (e) {
            console.warn('Failed to read package.json metadata for', folderName);
        }

        // 3. Fallback
        if (!title) {
            title = folderName;
            // Filter out [RJ12345678] pattern (DLsite codes)
            title = title.replace(/\[RJ\d+\]/gi, '').trim();
        }

        // Extract RJ Code for context menu (from folderName)
        let rjCode = null;
        const rjMatch = folderName.match(/(RJ\d+)/i);
        if (rjMatch) {
            rjCode = rjMatch[1].toUpperCase();
        }

        // Try finding icon 
        const possibleIcons = [
            path.join(folderPath, 'icon.png'),
            path.join(folderPath, 'www', 'icon.png'),
            path.join(folderPath, 'icon', 'icon.png')
        ];

        for (const p of possibleIcons) {
            if (fs.existsSync(p)) {
                iconPath = p;
                break;
            }
        }

        // Check for Slim Status (Web & Tyrano)
        let isSlim = false;
        if (type === 'web' || type === 'tyrano') {
            // Use passed isNetwork if available (significant performance gain); otherwise calculate (fallback)
            let actualIsNetwork = isNetwork;
            if (actualIsNetwork === null) {
                const driveType = await getDriveType(folderPath);
                actualIsNetwork = (driveType === 4 || folderPath.startsWith('\\\\'));
            }

            const { filesToRemove, foldersToRemove } = await getJunkDetails(folderPath, actualIsNetwork);
            const junkItems = [...filesToRemove, ...foldersToRemove];

            if (junkItems.length > 0) {
                console.warn(`[SlimCheck] ${folderName} is NOT slim. Found:`, junkItems);
                isSlim = false;
            } else {
                isSlim = true;
            }
        }

        const stats = fs.statSync(folderPath);
        const mtime = stats.mtimeMs;

        const metadata = { title, folderPath, entryPoint, iconPath, windowConfig, type, isSlim, rjCode, mtime };
        // Save to individual cache (Normalize path for key)
        localStorage.setItem(cacheKey, JSON.stringify(metadata));
        return metadata;
    } finally {
        busyPaths.delete(folderPath);
        scannedPaths.add(folderPath);
    }
}

function renderGameList(games) {
    libGames = games;
    gameGrid.innerHTML = '';

    // Sorting logic
    const sortedGames = [...games].sort((a, b) => {
        if (currentSort === 'name_asc') return a.title.localeCompare(b.title);
        if (currentSort === 'name_desc') return b.title.localeCompare(a.title);
        if (currentSort === 'date_desc') return (b.mtime || 0) - (a.mtime || 0);
        if (currentSort === 'date_asc') return (a.mtime || 0) - (b.mtime || 0);
        return a.title.localeCompare(b.title);
    });

    sortedGames.forEach(game => {
        const card = createGameCard(game);
        gameGrid.appendChild(card);
    });
}

function createGameCard(game) {
    const { title, folderPath, entryPoint, iconPath, windowConfig, type, isSlim, rjCode } = game;
    const card = document.createElement('div');
    card.className = 'game-card';
    card.setAttribute('data-path', folderPath);
    card.setAttribute('data-title', title); // For Search
    card.setAttribute('data-folder', path.basename(folderPath)); // For Search
    card.setAttribute('data-slim', isSlim); // For Filter
    card.setAttribute('data-engine', type); // For Filter

    const cssIconPath = iconPath ? iconPath.replace(/\\/g, '/') : null;

    let fallbackIcon = '🎮';
    if (type === 'exe') fallbackIcon = '🕹️';

    const thumbContent = cssIconPath
        ? `<div style="width:100%; height:100%; background-image: url('${cssIconPath}'); background-size: cover; background-position: center;"></div>`
        : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; color:#444;">${fallbackIcon}</div>`;

    let badges = '';
    if (type === 'exe') {
        badges += '<div style="background:rgba(0,0,0,0.7); padding:2px 6px; border-radius:4px; font-size:0.7rem; color:#aaa; margin-left:4px;">LEGACY</div>';
    }
    if (type === 'tyrano') {
        badges += '<div style="background:rgba(0,0,0,0.7); padding:2px 6px; border-radius:4px; font-size:0.7rem; color:#ff922b; margin-left:4px;">TYRANO</div>';
    }
    if (isSlim) {
        badges += '<div style="background:rgba(0,0,0,0.7); padding:2px 6px; border-radius:4px; font-size:0.7rem; color:#4dabf7; margin-left:4px;">SLIM</div>';
    }

    card.innerHTML = `
        <div class="card-thumb">
            ${thumbContent}
            <div style="position:absolute; bottom:5px; right:5px; display:flex;">
                ${badges}
            </div>
        </div>
        <div class="card-info">
            <div class="card-title" title="${title}">${title}</div>
            <div class="card-path" title="點擊開啟資料夾: ${folderPath}">${path.basename(folderPath)}</div>
        </div>
    `;

    // 1. Launch Game
    card.addEventListener('click', (e) => {
        // Prevent launch if clicking specific elements (like path)
        if (e.target.closest('.card-path')) return;
        launchGame(folderPath, entryPoint, windowConfig, type, title);
    });

    // 2. Open Folder (Right Click)
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const menu = new nw.Menu();
        menu.append(new nw.MenuItem({ label: '開啟資料夾', click: () => nw.Shell.openItem(folderPath) }));

        // Add DLsite link if RJ code exists
        if (rjCode) {
            menu.append(new nw.MenuItem({
                label: `開啟 DLsite (${rjCode})`,
                click: () => nw.Shell.openExternal(`https://www.dlsite.com/maniax/work/=/product_id/${rjCode}.html`)
            }));
        }

        menu.append(new nw.MenuItem({ type: 'separator' }));
        menu.append(new nw.MenuItem({
            label: '瘦身 (移除 NW.js 執行檔)',
            click: () => {
                if (busyPaths.has(folderPath)) {
                    alert("該遊戲資料夾正忙碌中，請稍候。");
                    return;
                }
                if (!scannedPaths.has(folderPath)) {
                    alert("該遊戲尚未完成掃描驗證，請等待背景掃描或更新完成。");
                    return;
                }
                confirmAndCleanGame(folderPath, title);
            }
        }));
        menu.popup(e.x, e.y);
    });

    // 3. Open Folder (Click Path)
    const pathEl = card.querySelector('.card-path');
    pathEl.addEventListener('click', (e) => {
        e.stopPropagation(); // Stop bubble to card click
        console.log('Opening folder:', folderPath);
        nw.Shell.openItem(folderPath);
    });

    // Add hover hint style via JS or CSS? CSS is better but easy here
    pathEl.style.cursor = "alias";
    pathEl.style.textDecoration = "underline";
    pathEl.style.textDecorationStyle = "dotted";

    return card;
}

// --- Launch Game Logic ---

function launchGame(folderPath, entryPoint, windowConfig, type, title) {
    if (title) document.title = title;

    // Auto-Patch: Check for Nore_Tes plugin issue
    patchPluginsJs(folderPath);

    // --- Safe Path Logic (Junction) ---
    // Fix for paths with single quotes (e.g. "Ririka's") causing VM SyntaxError in NW.js/Node eval
    let launchPath = folderPath;
    let isJunction = false;
    let junctionPath = null;

    if (folderPath.includes("'")) {
        try {
            const os = require('os');
            const crypto = require('crypto');

            // Create a temp folder for junctions
            const tempDir = path.join(os.tmpdir(), 'RpgLauncherLinks');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            // Create a unique hash for this path
            const hash = crypto.createHash('md5').update(folderPath).digest('hex').substring(0, 8);

            // Create a safe name (Title if safe, else "Game_Hash")
            // Use regex to strip anything not alphanumeric
            const safeTitle = (title || "Game").replace(/[^a-zA-Z0-9]/g, '');
            junctionPath = path.join(tempDir, `${safeTitle}_${hash}`);

            // Remove existing if any (stale)
            if (fs.existsSync(junctionPath)) {
                try {
                    fs.unlinkSync(junctionPath); // Unlink if it's a file/symlink
                } catch (e) {
                    // If it's a directory?
                    fs.rmdirSync(junctionPath);
                }
            }

            // Create Junction
            fs.symlinkSync(folderPath, junctionPath, 'junction');
            console.log(`[Launcher] Created Safe Junction: ${junctionPath} -> ${folderPath}`);

            launchPath = junctionPath;
            isJunction = true;

        } catch (e) {
            console.error("[Launcher] Failed to create safe junction:", e);
            // Fallback to original path
            launchPath = folderPath;
        }
    }

    const fullEntryPath = path.join(launchPath, entryPoint);

    if (type === 'web' || type === 'tyrano') {
        // --- Web/MV/MZ/Tyrano Launch Strategy ---

        // 1. Change CWD to game folder and Setup Module Path
        try {
            // Save original CWD and Path
            // Support game finding dependencies in Launcher's node_modules
            const launcherNodeModules = path.join(path.dirname(process.execPath), 'node_modules'); // For packaged app
            // Or current dev path
            const devNodeModules = path.join(process.cwd(), 'node_modules');

            let nodePathList = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : [];
            if (!nodePathList.includes(devNodeModules)) nodePathList.push(devNodeModules);
            // process.env.NODE_PATH = nodePathList.join(path.delimiter);
            // Actually, manipulating module.paths might be more effective for the current process, 
            // but the iframe is a new context.
            // NW.js inherits NODE_PATH.
            process.env.NODE_PATH = nodePathList.join(path.delimiter);
            require('module').Module._initPaths(); // Refresh paths

            process.chdir(launchPath);
            console.log('Changed CWD to:', launchPath);
        } catch (e) {
            console.error('Failed to change CWD or setup paths', e);
        }

        // 2. Construct URL
        // Use pathToFileURL to handle special characters (spaces, brackets, etc.) safely
        const url = require('url');
        const targetUrl = url.pathToFileURL(fullEntryPath).href;

        // 3. Determine Window Size
        let targetWidth = appSettings.webWidth;
        let targetHeight = appSettings.webHeight;
        let targetFullscreen = appSettings.webFullscreen;

        if (windowConfig) {
            if (windowConfig.width) targetWidth = windowConfig.width;
            if (windowConfig.height) targetHeight = windowConfig.height;
            if (windowConfig.fullscreen !== undefined) targetFullscreen = windowConfig.fullscreen;
        }

        // 4. Switch to Game View
        // Universal: Remove 'nwdisable' to ensure Node.js/NW.js access (needed for fs/saving)
        gameFrame.removeAttribute('nwdisable');

        // Isolation: Use 'nwfaketop' for Tyrano to prevent window.top conflicts
        if (type === 'tyrano') {
            gameFrame.setAttribute('nwfaketop', '');
        } else {
            gameFrame.removeAttribute('nwfaketop');
        }

        showGameView(targetUrl, targetWidth, targetHeight, targetFullscreen);

        // 5. Inject Patches
        // Only for RPG Maker (Web/MV/MZ)
        if (type === 'web') {
            gameFrame.onload = () => {
                try {
                    injectGamePatches(launchPath);
                    // Expose game window and common globals for console debugging
                    const win = gameFrame.contentWindow;
                    window.game = win;

                    // Helpful shortcuts for console debugging
                    ['$gameVariables', '$gameSwitches', '$gameParty', '$gameActors', '$gameSystem', '$dataScenario'].forEach(g => {
                        Object.defineProperty(window, g, {
                            get: () => win[g],
                            configurable: true
                        });
                    });

                    console.log("[Launcher] Game context exposed for console access.");
                } catch (e) {
                    console.error("Patch Injection Failed:", e);
                }
            };
        } else if (type === 'tyrano') {
            console.log("Launching Tyrano: Activating Node.js Environment...");
            gameFrame.onload = () => {
                injectTyranoPatches(launchPath);
                // Expose game window for console debugging
                window.game = gameFrame.contentWindow;
                console.log("[Launcher] Game window exposed as 'window.game' for console access.");
            };
        }

    } else if (type === 'exe') {
        // --- Legacy EXE Strategy ---
        // Launch in separate process
        console.log(`Launching Legacy Game: ${fullEntryPath}`);
        execFile(fullEntryPath, [], { cwd: launchPath }, (error, stdout, stderr) => {
            if (error) {
                console.error('Launch error:', error);
                alert(`無法啟動遊戲: ${error.message}`);
            }
        });
    }
}

function injectGamePatches(folderPath) {
    const win = gameFrame.contentWindow;
    if (!win) return;

    // Detect Save Path: Check for 'www/save' first, else fallback to 'save'
    let saveDir = path.join(folderPath, 'save');
    if (fs.existsSync(path.join(folderPath, 'www', 'save'))) {
        saveDir = path.join(folderPath, 'www', 'save');
    }

    // Use JSON.stringify to safely escape path for string injection
    const safePath = JSON.stringify(saveDir + path.sep);

    const patchScript = `
        console.log("%c[Launcher] Injecting Single-Window Patches...", "color: cyan; font-weight: bold;");

        // --- Save Path Patch (RPG Maker Only) ---
        try {
            const targetPath = ${safePath};
            
            // Force NW.js check (RPG Maker logic)
            if (typeof Utils !== 'undefined') {
                Utils.isNwjs = function() { return true; };
                Utils.isOptionValid = function(name) { return name === 'test'; };
            }

            if (typeof StorageManager !== 'undefined') {
                StorageManager.localFileDirectoryPath = function() { return targetPath; };
                StorageManager.saveDirectory = function() { return targetPath; };
                StorageManager.fileDirectoryPath = function() { return targetPath; };
                
                // Ensure directory
                if (typeof require !== 'undefined') {
                    try {
                        const fs = require('fs');
                        if (!fs.existsSync(targetPath)) fs.mkdirSync(targetPath, {recursive: true});
                    } catch(e){}
                }

                // Data Reload
                if (typeof DataManager !== 'undefined') {
                    DataManager._globalInfo = null;
                    DataManager.loadGlobalInfo();
                }

                console.log("%c[Launcher] Save Path Patch Applied.", "color: lime;");
            }
        } catch(e) {
            console.error("[Launcher] Save Patch Failed:", e);
        }

        // --- Exit/Terminate Patch ---
        try {
            // Function to call back to parent (Launcher)
            // In iframe, 'window.parent' is the launcher's window
            const returnToLauncher = function() {
                console.log("[Launcher] Return to Launcher requested.");
                if (window.parent && window.parent.showLauncherView) {
                    window.parent.showLauncherView();
                } else {
                    console.error("Cannot find parent launcher window!");
                }
            };
            
            // 1. Patch window.close (Standard DOM)
            window.close = function() {
                console.log("Intercepted window.close");
                returnToLauncher();
            };

            // 2. Patch NW.js App Quit
            if (typeof nw !== 'undefined' && nw.App) {
                nw.App.quit = returnToLauncher;
            }
            
            // 3. Patch NW.js Window Close
            if (typeof nw !== 'undefined' && nw.Window) {
                const origGet = nw.Window.get;
                nw.Window.get = function() {
                    const winInstance = origGet.apply(this, arguments);
                    if (winInstance) {
                         // Intercept close on the window instance
                         winInstance.close = function(force) {
                             console.log("Intercepted nw.Window.close");
                             returnToLauncher();
                         };
                         // Intercept hide? Some games hide instead of close
                         // winInstance.hide = returnToLauncher; 
                    }
                    return winInstance;
                };
            }

            // 4. Patch Process Exit
            if (typeof process !== 'undefined') {
                process.exit = function() {
                    console.log("Intercepted process.exit");
                    returnToLauncher();
                };
            }

            // 5. Patch SceneManager (RPG Maker specific)
            if (typeof SceneManager !== 'undefined') {
                SceneManager.terminate = returnToLauncher;
                SceneManager.exit = returnToLauncher;
            }
            
            console.log("%c[Launcher] Exit Patch Applied.", "color: lime;");

        } catch(e) {
            console.error("[Launcher] Exit Patch Failed:", e);
        }

        // --- Auto Refresh Title (Async) ---
        const refreshInterval = setInterval(() => {
            if (typeof SceneManager !== 'undefined' && SceneManager._scene) {
                const scene = SceneManager._scene;
                if (scene.constructor.name === 'Scene_Title') {
                     if (!window._launcherRefreshed) {
                         window._launcherRefreshed = true;
                         // Wait for data load?
                         SceneManager.goto(SceneManager._scene.constructor);
                         clearInterval(refreshInterval);
                     } else {
                         clearInterval(refreshInterval);
                     }
                }
            }
        }, 500);
        setTimeout(() => clearInterval(refreshInterval), 10000);

        // --- Patch: Force HTTP 200 for file:// protocol (Fixes strict plugins like SkillTree) ---
        // Some plugins strictly check for xhr.status === 200. In newer NW.js/iframe, local files return 0.
        try {
            const _OldXHR = window.XMLHttpRequest;
            window.XMLHttpRequest = class extends _OldXHR {
                get status() {
                    let s = 0;
                    try { s = super.status; } catch(e) {} // Handle readyState issues
                    // If local file and status is 0, lie and say 200
                    if (s === 0 && (window.location.protocol === 'file:' || (this.responseURL && this.responseURL.startsWith('file:')))) {
                        return 200;
                    }
                    return s;
                }
            };
            // Object.assign(window.XMLHttpRequest, _OldXHR); // Removed: Causes TypeError on read-only props
            console.log("%c[Launcher] XHR Status Patch Applied (0 -> 200)", "color: lime;");
        } catch(e) {
            console.error("[Launcher] XHR Patch Failed:", e);
        }

        // --- Key Listener (F8/F12) - Capture Mode ---
        // Some games prevent F8/F12. We prefer to allow them for debug.
        document.addEventListener('keydown', (e) => {
            // F8 / F12: DevTools (Force)
            if (e.key === 'F8' || e.key === 'F12') {
                e.preventDefault();
                e.stopPropagation();
                try {
                    const win = nw.Window.get();
                    win.showDevTools();
                } catch(err) { console.error("Force DevTools Failed", err); }
                return;
            }
            
            // F9: RPG Maker Debug Menu (Force)
            if (e.key === 'F9') {
                if (typeof Scene_Debug !== 'undefined' && typeof SceneManager !== 'undefined') {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        SceneManager.push(Scene_Debug);
                    } catch (e) { console.error("F9 Force Failed", e); }
                }
                return;
            }
        }, true); // USE_CAPTURE = true
    `;

    try {
        win.eval(patchScript);

    } catch (e) {
        console.error("Failed to inject into iframe", e);
    }
}

function injectTyranoPatches(folderPath) {
    const win = gameFrame.contentWindow;
    if (!win) return;

    const patchScript = `
        console.log("%c[Launcher] Injecting Tyrano Patches...", "color: pink; font-weight: bold;");

        // --- Verify Node Access ---
        if (typeof require !== 'undefined') {
            console.log("[Launcher] Node.js is available inside Tyrano.");
            try {
                const fs = require('fs');
                console.log("[Launcher] fs module check: OK");
            } catch(e) {
                console.warn("[Launcher] fs module check: Failed", e);
            }
        } else {
            console.error("[Launcher] Node.js is MISSING! Config loading will fail.");
        }

        // --- Exit/Terminate Patch ---
        try {
            const returnToLauncher = function() {
                console.log("[Launcher] Return to Launcher requested.");
                if (window.parent && window.parent.showLauncherView) {
                    window.parent.showLauncherView();
                } else {
                    console.error("Cannot find parent launcher window!");
                }
            };
            
            // 1. Patch window.close (Standard DOM)
            window.close = function() {
                console.log("Intercepted window.close");
                returnToLauncher();
            };

            // 2. Patch NW.js App Quit
            if (typeof nw !== 'undefined' && nw.App) {
                nw.App.quit = returnToLauncher;
            }
            
            // 3. Patch NW.js Window Close
            if (typeof nw !== 'undefined' && nw.Window) {
                const origGet = nw.Window.get;
                nw.Window.get = function() {
                    const winInstance = origGet.apply(this, arguments);
                    if (winInstance) {
                         winInstance.close = function(force) {
                             console.log("Intercepted nw.Window.close");
                             returnToLauncher();
                         };
                    }
                    return winInstance;
                };
            }
            
            console.log("%c[Launcher] Tyrano Exit Patch Applied.", "color: lime;");

        } catch(e) {
            console.error("[Launcher] Tyrano Patch Failed:", e);
        }

        // --- Stack Overflow Protection (Recursion Guard) ---
        // Tyrano games can recurse infinitely in synchronous tag loops (e.g. chara_face).
        // We patch nextOrder to catch RangeError and schedule the next call asynchronously.
        const addStackGuard = function() {
             if (typeof tyrano !== 'undefined' && tyrano.plugin && tyrano.plugin.kag && tyrano.plugin.kag.ftag) {
                 console.log("[Launcher] Installing Stack Overflow Guard...");
                 const ftag = tyrano.plugin.kag.ftag;
                 const origNextOrder = ftag.nextOrder;
                 
                 ftag.nextOrder = function() {
                     try {
                         origNextOrder.apply(this, arguments);
                     } catch(e) {
                         if (e.name === 'RangeError' || e.message.includes('stack')) {
                             console.warn("%c[Launcher] Stack Overflow prevented! Rescheduling nextOrder...", "color: orange");
                             setTimeout(() => { 
                                 origNextOrder.apply(this, arguments); 
                             }, 0);
                         } else {
                             console.error("[Launcher] Error in nextOrder:", e);
                             throw e;
                         }
                     }
                 };
                 console.log("[Launcher] Guard Installed.");
             } else {
                 console.log("[Launcher] Tyrano object not ready, retrying...");
                 setTimeout(addStackGuard, 1000);
             }
        };
        addStackGuard();



        // --- Key Listener (F8/F12) ---
        // --- Key Listener (F8/F12/F10) - Capture Mode ---
        document.addEventListener('keydown', (e) => {
            // F8 / F12: DevTools
            if (e.key === 'F8' || e.key === 'F12') {
                e.preventDefault();
                e.stopPropagation();
                try {
                    const win = nw.Window.get();
                    win.showDevTools();
                } catch(err) {} 
                return;
            }
        }, true);
    `;

    try {
        win.eval(patchScript);
    } catch (e) {
        console.error("Failed to inject Tyrano patches:", e);
    }
}

// Expose showLauncherView to global so iframe can access it via window.parent.showLauncherView()
window.showLauncherView = showLauncherView;

// --- Utils ---
/**
 * Safe version of moveItemToTrash that fallbacks to permanent delete if needed
 */
function safeRemoveItem(p, isNetwork = false) {
    if (isNetwork || !nw.Shell || typeof nw.Shell.moveItemToTrash !== 'function') {
        const stats = fs.statSync(p);
        if (stats.isDirectory()) {
            fs.rmSync(p, { recursive: true });
        } else {
            fs.unlinkSync(p);
        }
    } else {
        nw.Shell.moveItemToTrash(p);
    }
}

/**
 * Atomic batch delete: Collects items into a temp folder then removes once.
 */
function atomicBatchDelete(folderPath, itemList, isNetwork = false, logCallback = null) {
    const junkDirName = `.slim_junk_${Date.now()}`;
    const junkDir = path.join(folderPath, junkDirName);
    let itemsFound = [];

    // 1. Identify existing items
    for (const name of itemList) {
        const full = path.join(folderPath, name);
        if (fs.existsSync(full)) {
            itemsFound.push({ name: name, full: full });
        }
    }

    if (itemsFound.length === 0) return 0;

    try {
        // 2. Create temp folder
        if (!fs.existsSync(junkDir)) fs.mkdirSync(junkDir);

        // 3. Move items inward
        for (const item of itemsFound) {
            const dest = path.join(junkDir, item.name);
            const destParent = path.dirname(dest);
            if (!fs.existsSync(destParent)) fs.mkdirSync(destParent, { recursive: true });

            try {
                fs.renameSync(item.full, dest);
                if (logCallback) logCallback(`  收集: ${item.name}`);
            } catch (renameErr) {
                // cross-volume fallback
                const stats = fs.statSync(item.full);
                if (stats.isDirectory()) {
                    fs.cpSync(item.full, dest, { recursive: true });
                    fs.rmSync(item.full, { recursive: true });
                } else {
                    fs.copyFileSync(item.full, dest);
                    fs.unlinkSync(item.full);
                }
                if (logCallback) logCallback(`  收集 (移轉): ${item.name}`);
            }
        }

        // 4. Delete the whole folder
        if (logCallback) logCallback(`>>> 執行整併刪除...`);
        safeRemoveItem(junkDir, isNetwork);

        return itemsFound.length;
    } catch (e) {
        if (logCallback) logCallback(`  [錯誤] 原子刪除失敗: ${e.message}`);
        throw e;
    }
}

async function getDriveType(inputPath) {
    return new Promise((resolve) => {
        try {
            // UNC Path Check
            if (inputPath.startsWith('\\\\')) return resolve(4);

            const root = path.parse(inputPath).root; // e.g. "C:\" or "Y:\"
            const driveLetter = root.substring(0, 2); // e.g. "C:" or "Y:"

            require('child_process').exec(`powershell -NoProfile -Command "(Get-WmiObject Win32_LogicalDisk -Filter \\"DeviceID='${driveLetter}'\\").DriveType"`, (err, stdout) => {
                if (err || !stdout) resolve(0);
                else {
                    const type = parseInt(stdout.trim());
                    resolve(isNaN(type) ? 0 : type);
                }
            });
        } catch (e) { resolve(0); }
    });
}

function getItemSize(itemPath) {
    try {
        const stats = fs.statSync(itemPath);
        if (stats.isDirectory()) {
            let total = 0;
            const files = fs.readdirSync(itemPath);
            for (const f of files) total += getItemSize(path.join(itemPath, f));
            return total;
        } else {
            return stats.size;
        }
    } catch (e) { return 0; }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}



/**
 * Shared helper to find all junk items in a folder.
 */
async function getJunkDetails(folderPath, isNetwork) {
    let filesToRemove = [];
    let warnings = "";

    // 1. Collect standard files
    for (const f of SLIM_JUNK_FILES) {
        if (fs.existsSync(path.join(folderPath, f))) {
            filesToRemove.push(f);
        }
    }

    // 2. EXE Analysis
    const allExes = [];
    const nonStandardExes = [];
    try {
        const rootFiles = fs.readdirSync(folderPath);
        for (const file of rootFiles) {
            if (file.toLowerCase().endsWith('.exe')) {
                if (file.toLowerCase().startsWith('unins')) continue;
                allExes.push(file);
                if (!SLIM_JUNK_FILES.includes(file)) nonStandardExes.push(file);
            }
        }
    } catch (e) { }

    if (nonStandardExes.length > 0) {
        if (isNetwork) {
            warnings += "\n(注意：偵測到非標準執行檔，因位於網路磁碟已跳過)";
        } else {
            if (allExes.length === 1 && nonStandardExes.length === 1) {
                filesToRemove.push(nonStandardExes[0]);
                warnings += `\n(包含非標準執行檔: ${nonStandardExes[0]})`;
            } else if (allExes.length > 1) {
                warnings += "\n(注意：偵測到多個執行檔，請手動確認剩餘 EXE)";
            }
        }
    }

    // 3. Folders
    let actualFolders = [];
    for (const f of SLIM_JUNK_FOLDERS) {
        if (fs.existsSync(path.join(folderPath, f))) {
            actualFolders.push(f);
        }
    }

    return { filesToRemove, foldersToRemove: actualFolders, warningMessage: warnings };
}


/**
 * Identifies all redundant items in a game folder.
 * Returns { filesToRemove, foldersToRemove, totalBytes, foundItems, warningMessage }
 */
async function identifyJunkItems(folderPath, isNetwork) {
    const { filesToRemove, foldersToRemove, warningMessage } = await getJunkDetails(folderPath, isNetwork);

    // Calculate Size
    let totalBytes = 0;
    let foundCount = 0;
    const combined = [...filesToRemove, ...foldersToRemove];
    for (const item of combined) {
        totalBytes += getItemSize(path.join(folderPath, item));
        foundCount++;
    }

    return {
        filesToRemove,
        foldersToRemove,
        totalBytes,
        foundItems: foundCount,
        warningMessage
    };
}


// --- Slim Logic ---
async function confirmAndCleanGame(folderPath, title) {
    if (busyPaths.has(folderPath)) {
        alert("該路徑正忙碌中，請先關閉目前的處理視窗。");
        return;
    }
    busyPaths.add(folderPath);

    // Reset Modal (in case batch changed it)
    document.querySelector('.slim-stats').classList.remove('hidden');
    document.querySelector('.warning-section').classList.remove('hidden');
    document.getElementById('slim-cli').classList.add('hidden');
    document.getElementById('btn-confirm-slim').classList.remove('hidden');
    document.getElementById('btn-cancel-slim').classList.add('btn-secondary');
    document.getElementById('btn-cancel-slim').classList.remove('btn-primary');
    document.getElementById('btn-cancel-slim').innerText = "取消";
    document.getElementById('btn-cancel-slim').disabled = false;

    // 0. Determine if it's a network drive
    const driveType = await getDriveType(folderPath);
    const isNetwork = (driveType === 4 || folderPath.startsWith('\\\\'));

    // 1. Analyze items comprehensively
    const analysis = await identifyJunkItems(folderPath, isNetwork);
    const { filesToRemove, foldersToRemove, totalBytes, foundItems, warningMessage } = analysis;

    if (foundItems === 0) {
        alert("未發現可移除的 NW.js 檔案，此資料夾可能已經瘦身過。");
        busyPaths.delete(folderPath);
        return;
    }

    const savedSizeStr = formatSize(totalBytes);

    // 6. Show Confirmation Modal with CLI Logic
    slimTitle.textContent = title;
    slimCount.textContent = `${foundItems} 個項目`;
    slimSize.textContent = savedSizeStr;

    // Reset UI State
    document.querySelector('.slim-stats').classList.remove('hidden');
    document.querySelector('.warning-section').classList.remove('hidden');
    document.getElementById('slim-cli').classList.add('hidden');
    // Ensure content div exists
    let cliContent = document.getElementById('slim-cli-content');
    if (!cliContent) {
        cliContent = document.createElement('div');
        cliContent.id = 'slim-cli-content';
        document.getElementById('slim-cli').appendChild(cliContent);
    }
    cliContent.innerHTML = '';

    // Hide network warning by default
    networkWarning.classList.add('hidden');
    if (isNetwork) {
        networkWarning.classList.remove('hidden');
    }

    // Reset Buttons
    btnConfirmSlim.textContent = "確認瘦身";
    btnConfirmSlim.disabled = false;
    btnConfirmSlim.classList.remove('hidden');
    btnCancelSlim.textContent = "取消";
    btnCancelSlim.classList.remove('hidden');

    slimModal.classList.remove('hidden');

    // --- Helper: Appends line to CLI ---
    const logCli = (msg, type = '') => {
        const div = document.createElement('div');
        div.className = `cli-line ${type}`;
        div.textContent = msg;
        const cliContent = document.getElementById('slim-cli-content');
        if (cliContent) cliContent.appendChild(div);
        // Auto scroll
        document.getElementById('slim-cli').scrollTop = document.getElementById('slim-cli').scrollHeight;
    };

    // --- Clean Process Logic ---
    const runCleanProcess = async () => {
        // 1. UI Setup
        document.querySelector('.slim-stats').classList.add('hidden');
        document.querySelector('.warning-section').classList.add('hidden');
        networkWarning.classList.add('hidden'); // Hide warning during run

        const cliBox = document.getElementById('slim-cli');
        cliBox.classList.remove('hidden');

        btnConfirmSlim.disabled = true;
        btnConfirmSlim.textContent = "執行中...";
        btnCancelSlim.classList.add('hidden'); // Cannot cancel once started

        logCli(`Starting cleanup for: ${title}`);
        logCli(`Target path: ${folderPath}`);
        if (isNetwork) logCli(`[WARN] Network drive detected. Files will be permanently deleted.`, 'warn');
        if (warningMessage) logCli(warningMessage.trim(), 'warn');
        logCli("---------------------------------------------------");

        // 2. Atomic Delete
        logCli(">>> 正在進行項目的原子化整併...");

        const combinedTargets = [...filesToRemove, ...foldersToRemove];
        try {
            const deletedCount = atomicBatchDelete(folderPath, combinedTargets, isNetwork, (msg) => logCli(msg));

            // 3. Patch plugins.js
            logCli("---------------------------------------------------");
            logCli(">>> 正在套用插件修復 (plugins.js)...");
            patchPluginsJs(folderPath);

            // 4. Finish
            logCli("---------------------------------------------------");
            logCli(`Cleanup Complete!`, 'success');
            logCli(`Removed: ${deletedCount} items`);
            logCli(`Space Saved: ${savedSizeStr}`, 'success');
        } catch (err) {
            logCli(`>>> 執行過程發生錯誤: ${err.message}`, 'error');
        }

        // Update UI to "Done" state
        btnConfirmSlim.textContent = "完成";
        btnConfirmSlim.disabled = false;
        btnConfirmSlim.onclick = () => {
            slimModal.classList.add('hidden');
            busyPaths.delete(folderPath);
            refreshSingleGame(folderPath);
        };
    };


    // Setup Event Listeners
    // Clone buttons to remove previous listeners (or just use onclick)
    document.getElementById('btn-confirm-slim').onclick = runCleanProcess;

    document.getElementById('btn-cancel-slim').onclick = () => {
        slimModal.classList.add('hidden');
        busyPaths.delete(folderPath);
    };
    document.getElementById('btn-close-slim').onclick = () => {
        slimModal.classList.add('hidden');
        busyPaths.delete(folderPath);
    };
}

// --- DevTools Logic ---
function openGameDevTools() {
    console.log("Opening Game DevTools...");
    const win = nw.Window.get();
    try {
        // Inspect the specific iframe
        win.showDevTools(gameFrame);
    } catch (e) {
        console.error("Failed to open Game DevTools", e);
    }
}
window.openGameDevTools = openGameDevTools;

// Global Key Listener (Launcher Context)
document.addEventListener('keydown', (e) => {
    // Only if game view is active
    if (!gameView.classList.contains('hidden')) {
        if (e.key === 'F8' || e.key === 'F12') {
            e.preventDefault();
            openGameDevTools();
        }
    }
});

const sortSelect = document.getElementById('sort-type');
if (sortSelect) {
    sortSelect.value = currentSort;
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        localStorage.setItem('rpg_sort_type', currentSort);
        renderGameList(libGames);
    });
}

// --- UI Popover Logic ---
const btnFilterPopover = document.getElementById('btn-filter-popover');
const filterPopover = document.getElementById('filter-popover');
const btnMoreTools = document.getElementById('btn-more-tools');
const moreMenu = document.getElementById('more-menu');

if (btnFilterPopover) {
    btnFilterPopover.addEventListener('click', (e) => {
        e.stopPropagation();
        filterPopover.classList.toggle('hidden');
        moreMenu.classList.add('hidden');
    });
}

if (btnMoreTools) {
    btnMoreTools.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('hidden');
        filterPopover.classList.add('hidden');
    });
}

// Close popovers on external click
document.addEventListener('click', (e) => {
    if (filterPopover && !filterPopover.contains(e.target)) {
        filterPopover.classList.add('hidden');
    }
    if (moreMenu && !moreMenu.contains(e.target)) {
        moreMenu.classList.add('hidden');
    }
});

if (btnRescan) {
    btnRescan.addEventListener('click', () => {
        if (isScanning) return;
        if (libraryPath) loadLibrary(libraryPath, false); // Quick Refresh
    });
}

const btnDeepScan = document.getElementById('btn-deep-scan');
if (btnDeepScan) {
    btnDeepScan.addEventListener('click', () => {
        if (isScanning) return;
        if (confirm("深度掃描將重新辨識所有遊戲的標題、圖示與瘦身狀態，處理大型遊戲庫可能需要較長時間。\n\n確定要重新完整掃描嗎？")) {
            if (libraryPath) loadLibrary(libraryPath, true); // Deep Scan
        }
    });
}

if (btnSlimAll) {
    btnSlimAll.addEventListener('click', confirmAndSlimAll);
}

// --- Batch Slim Logic ---

async function confirmAndSlimAll() {
    if (isScanning) {
        alert("掃描正在進行中，請等待掃描完成後再執行批次操作。");
        return;
    }

    const targets = libGames.filter(g => !g.isSlim);
    if (targets.length === 0) {
        alert("目前所有遊戲均已完成瘦身！");
        return;
    }

    // Pre-check for Network Drives (Check library root once)
    const driveType = await getDriveType(libraryPath);
    const isNetwork = driveType === 4 || libraryPath.startsWith('\\\\');

    let msg = `您即將對 ${targets.length} 個遊戲執行批次瘦身操作。\n\n`;
    msg += "⚠️ 此操作將移除 redundent NW.js 執行檔與相關檔案。\n";

    if (isNetwork) {
        msg += "\n🛑 警告：偵測到部份網路磁碟路徑！\n";
        msg += "在網路磁碟執行瘦身將會【永久刪除】檔案（無法進入資源回收桶）。\n";
    }

    msg += "\n確定要繼續嗎？";

    if (confirm(msg)) {
        runBatchSlim(targets, isNetwork);
    }
}

async function runBatchSlim(targets, isNetwork) {
    btnSlimAll.disabled = true;
    const originalText = btnSlimAll.innerHTML;

    // --- Prepare Modal for Batch Mode ---
    slimModal.classList.remove('hidden');
    document.getElementById('slim-title').innerText = "批次瘦身進度";
    document.querySelector('.slim-stats').classList.add('hidden');
    document.querySelector('.warning-section').classList.add('hidden');
    const cli = document.getElementById('slim-cli');
    const cliContent = document.getElementById('slim-cli-content');
    cli.classList.remove('hidden');
    cliContent.innerHTML = ''; // Reset logs

    // Buttons handling
    const btnCancel = document.getElementById('btn-cancel-slim');
    const btnConfirm = document.getElementById('btn-confirm-slim');
    btnConfirm.classList.add('hidden');
    btnCancel.disabled = true;
    btnCancel.innerText = "處理中...";

    const log = (msg, isHeader = false) => {
        const div = document.createElement('div');
        div.innerText = msg;
        if (isHeader) {
            div.style.color = '#228be6';
            div.style.marginTop = '8px';
            div.style.fontWeight = 'bold';
        }
        cliContent.appendChild(div);
        cli.scrollTop = cli.scrollHeight;
    };

    let successCount = 0;

    for (let i = 0; i < targets.length; i++) {
        const game = targets[i];
        btnSlimAll.innerText = `正在處理 (${i + 1}/${targets.length})...`;
        statusText.innerText = `正在執行批次瘦身: ${game.title} (${i + 1}/${targets.length})`;
        log(`>>> [${i + 1}/${targets.length}] ${game.title}`, true);

        try {
            // 1. Thorough Analysis
            const analysis = await identifyJunkItems(game.folderPath, isNetwork);
            const combinedTargets = [...analysis.filesToRemove, ...analysis.foldersToRemove];

            if (combinedTargets.length > 0) {
                // 2. Atomic Delete
                atomicBatchDelete(game.folderPath, combinedTargets, isNetwork, log);

                // 3. Patch plugins.js
                patchPluginsJs(game.folderPath);

                // 4. Update single card
                await refreshSingleGame(game.folderPath);
                successCount++;
            } else {
                log(`  跳過 (無殘留項目)`);
            }
        } catch (err) {
            log(`  [錯誤] ${err.message}`);
            console.error(`Batch slim failed for ${game.title}:`, err);
        }
    }

    // --- Finish state ---
    btnSlimAll.disabled = false;
    btnSlimAll.innerHTML = originalText;
    statusText.innerText = `批次瘦身完成！共處理 ${successCount} 個遊戲。`;

    btnCancel.disabled = false;
    btnCancel.innerText = "完成";
    btnCancel.classList.remove('btn-secondary');
    btnCancel.classList.add('btn-primary');

    // Reset modal on close
    const cleanupModal = () => {
        slimModal.classList.add('hidden');
        document.querySelector('.slim-stats').classList.remove('hidden');
        document.querySelector('.warning-section').classList.remove('hidden');
        cli.classList.add('hidden');
        btnConfirm.classList.remove('hidden');
        btnCancel.innerText = "取消";
        btnCancel.classList.add('btn-secondary');
        btnCancel.classList.remove('btn-primary');
        busyPaths.clear();
        btnCancel.removeEventListener('click', cleanupModal);
    };
    btnCancel.addEventListener('click', cleanupModal);
}


// --- Window Controls (Frameless) ---
(function initWindowControls() {
    // Wait for nw object
    if (typeof nw === 'undefined') return;

    const win = nw.Window.get();
    const btnMin = document.getElementById('win-minimize');
    const btnMax = document.getElementById('win-maximize');
    const btnClose = document.getElementById('win-close');

    if (btnMin) {
        btnMin.addEventListener('click', () => win.minimize());
    }

    if (btnMax) {
        btnMax.addEventListener('click', () => {
            // Check state by comparing dimension (heuristic)
            if (window.outerWidth >= screen.availWidth * 0.95 && window.outerHeight >= screen.availHeight * 0.95) {
                win.restore();
            } else {
                win.maximize();
            }
        });
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => win.close());
    }
})();
// --- Plugin Patcher (Nore_Tes Fix) ---
function patchPluginsJs(folderPath) {
    // 1. Detect multiple possible plugins.js locations (MV vs MZ)
    const possiblePaths = [
        path.join(folderPath, 'www', 'js', 'plugins.js'),
        path.join(folderPath, 'js', 'plugins.js')
    ];
    let pluginsPath = null;
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            pluginsPath = p;
            break;
        }
    }

    if (!pluginsPath) return;

    try {
        let content = fs.readFileSync(pluginsPath, 'utf8');
        const jsonStart = content.indexOf('[');
        const jsonEnd = content.lastIndexOf(']');
        if (jsonStart === -1 || jsonEnd === -1) return;

        const jsonStr = content.substring(jsonStart, jsonEnd + 1);
        const plugins = JSON.parse(jsonStr);
        let modified = false;

        // Determine if we need ./scenario/ or ../scenario/
        // If plugins.js is in /js/, index.html is likely in root -> ./scenario/
        // If plugins.js is in /www/js/, index.html is likely in /www/ -> ./scenario/ (relative to web context)
        // Historically, many Nore_Tes implementations expect it relative to the game's base URL.
        const scenarioRelativePath = "./scenario/";

        for (const plugin of plugins) {
            if (plugin.name === 'Nore_Tes' && plugin.status === true) {
                if (plugin.parameters && plugin.parameters.scenarioFolder) {
                    const val = plugin.parameters.scenarioFolder;

                    // Update if it doesn't match our optimized relative path
                    if (val !== scenarioRelativePath) {
                        console.log(`[Launcher] Patching Nore_Tes (Relative): ${val} -> ${scenarioRelativePath}`);
                        plugin.parameters.scenarioFolder = scenarioRelativePath;
                        modified = true;
                    }
                }
            }
        }

        if (modified) {
            const prefix = content.substring(0, jsonStart);
            const suffix = content.substring(jsonEnd + 1);
            const newJson = JSON.stringify(plugins, null, 4);
            const newContent = prefix + newJson + suffix;
            fs.writeFileSync(pluginsPath, newContent, 'utf8');
            console.log(`[Launcher] plugins.js patched at ${pluginsPath}`);
        }

        // 2. Static Patch for Nore_Tes.js source code
        const noreTesPaths = [
            path.join(folderPath, 'www', 'js', 'plugins', 'Nore_Tes.js'),
            path.join(folderPath, 'js', 'plugins', 'Nore_Tes.js')
        ];
        let noreTesPath = null;
        for (const p of noreTesPaths) {
            if (fs.existsSync(p)) {
                noreTesPath = p;
                break;
            }
        }

        if (noreTesPath) {
            try {
                let scriptContent = fs.readFileSync(noreTesPath, 'utf8');
                let scriptModified = false;

                if (!scriptContent.includes('skipping write but continuing to load')) {
                    const writeRegex = /if\s*\(self\._isJp\)\s*\{([\s\S]*?)fs\.writeFileSync\((Tes\.DATA_PATH\s*\+\s*'Scenario\.json')[\s\S]*?DataManager\.loadScenarioFile\('\$dataScenario'[\s\S]*?\}/;
                    if (writeRegex.test(scriptContent)) {
                        const safetyFix = `if (self._isJp) {
                            if (Object.keys(scenario).length === 0) { 
                                console.error('[Launcher] Nore_Tes: Scenario empty, skipping write but continuing to load.');
                            } else {
                                require('fs').writeFileSync($2, JSON.stringify(scenario));
                            }
                            DataManager.loadScenarioFile('$dataScenario', Tes.SCENARIO_FILE_NAME);
                        }`;
                        scriptContent = scriptContent.replace(writeRegex, safetyFix);
                        scriptModified = true;
                    }
                }

                // Patch 2: Path Resolution Stabilization
                // Replace inconsistent relative paths with absolute paths based on process.cwd()
                // Use a more aggressive regex to capture potential IIFE remnants or complex assignments
                const pathReplacements = [
                    {
                        pattern: /var\s+SCENARIO_FOLDER_NAME\s*=\s*[^;]+;/g,
                        replacement: "var SCENARIO_FOLDER_NAME = 'scenario';\n        window.$dataScenario = window.$dataScenario || null;"
                    },
                    {
                        pattern: /Tes\.SCENARIO_SRC_PATH\s*=\s*(?:path\.join\([^;]+\)|function\(\)\s*\{[\s\S]*?\}\(\));?/g,
                        replacement: "Tes.SCENARIO_SRC_PATH = path.join(process.cwd(), 'scenario/');"
                    },
                    {
                        pattern: /Tes\.SCENARIO_SRC_PATH_EN\s*=\s*(?:path\.join\([^;]+\)|function\(\)\s*\{[\s\S]*?\}\(\));?/g,
                        replacement: "Tes.SCENARIO_SRC_PATH_EN = path.join(process.cwd(), 'scenario_en/');"
                    },
                    {
                        pattern: /Tes\.DATA_PATH\s*=\s*(?:path\.join\([^;]+\)|function\(\)\s*\{[\s\S]*?\}\(\));?/g,
                        replacement: "Tes.DATA_PATH = path.join(process.cwd(), 'scenario/');"
                    }
                ];

                // Patch 3: Load Strategy Optimization (Emergency Load)
                if (!scriptContent.includes('EMERGENCY LOAD')) {
                    const runRegex = /PluginManager\.registerCommand\(pluginName,\s*'Run',\s*function\s*\(args\)\s*\{([\s\S]*?)(var\s+list\s*=\s*\$dataScenario\[normalized\];)/;
                    if (runRegex.test(scriptContent)) {
                        const emergencyLoad = `PluginManager.registerCommand(pluginName, 'Run', function (args) {
            $1// EMERGENCY LOAD
            if (!window.$dataScenario && Utils.isNwjs()) {
                try {
                    const directPath = require('path').join(Tes.DATA_PATH, Tes.SCENARIO_FILE_NAME);
                    if (require('fs').existsSync(directPath)) {
                        window.$dataScenario = JSON.parse(require('fs').readFileSync(directPath, 'utf8'));
                    }
                } catch (e) {}
            }
            $2`;
                        scriptContent = scriptContent.replace(runRegex, emergencyLoad);
                        scriptModified = true;
                    }
                }

                if (scriptModified) {
                    fs.writeFileSync(noreTesPath, scriptContent, 'utf8');
                    console.log(`[Launcher] Nore_Tes.js patched at ${noreTesPath}`);
                }
            } catch (noreErr) {
                console.error("[Launcher] Failed to patch Nore_Tes.js", noreErr);
            }
        }
    } catch (e) {
        console.error("[Launcher] Failed to patch plugins.js", e);
    }
}
