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
let pendingSlimTask = null;

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

/* // --- Global Context Menu (Reload) ---
document.addEventListener('contextmenu', (e) => {
    // Only show if clicking on blank areas or header, not inside game frame (which has its own logic usually)
    // But game frame is in a separate view.
    if (e.target.closest('.game-card') || e.target.closest('input') || e.target.closest('select')) return;

    e.preventDefault();
    const menu = new nw.Menu();
    menu.append(new nw.MenuItem({
        label: '重新載入啟動器',
        click: () => chrome.runtime.reload()
    }));
    menu.append(new nw.MenuItem({
        label: '開啟開發者工具',
        click: () => nw.Window.get().showDevTools()
    }));

    menu.popup(e.x, e.y);
});
 */
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

async function loadLibrary(rootPath) {
    emptyState.classList.add('hidden');
    gameGrid.classList.remove('hidden');

    // 1. Try Load from Cache
    const cacheKey = `rpg_cache_${rootPath}`;
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
    try {
        const games = await scanLibrary(rootPath);

        // 3. Update UI & Cache
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

        // Execute Pending Task if any
        if (pendingSlimTask) {
            console.log("Executing pending slim task...", pendingSlimTask);
            // Check if user closed the waiting modal? 
            // In confirmAndCleanGame, we will just update the modal if it's open.
            // But here we just call it.
            confirmAndCleanGame(pendingSlimTask.folderPath, pendingSlimTask.title);
            pendingSlimTask = null;
        }
    }
}

async function scanLibrary(rootPath) {
    let games = [];

    if (appSettings.recursiveScan) {
        games = await scanRecursively(rootPath, 3);
    } else {
        const items = await fs.promises.readdir(rootPath, { withFileTypes: true });
        const gameFolders = items.filter(dirent => dirent.isDirectory());

        for (const dir of gameFolders) {
            const fullPath = path.join(rootPath, dir.name);
            const metadata = await getGameMetadata(fullPath, dir.name);
            if (metadata) games.push(metadata);
        }
    }
    return games;
}

async function scanRecursively(currentPath, depth) {
    if (depth <= 0) return [];
    let games = [];

    try {
        const items = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const dirent of items) {
            if (dirent.isDirectory()) {
                const fullPath = path.join(currentPath, dirent.name);
                const metadata = await getGameMetadata(fullPath, dirent.name);

                if (metadata) {
                    games.push(metadata);
                } else {
                    const subGames = await scanRecursively(fullPath, depth - 1);
                    games = games.concat(subGames);
                }
            }
        }
    } catch (e) { }
    return games;
}

async function getGameMetadata(folderPath, folderName) {
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
                    try {
                        const sysData = JSON.parse(fs.readFileSync(sysPath, 'utf8'));
                        if (sysData.gameTitle && sysData.gameTitle.trim() !== "") {
                            title = sysData.gameTitle;
                            break;
                        }
                    } catch (jsonErr) { }
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
                    const content = fs.readFileSync(cfgPath, 'utf8');
                    // Look for ;System.title = "Title";
                    const match = content.match(/;System\.title\s*=\s*"(.*?)";/);
                    if (match && match[1]) {
                        title = match[1];
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to read Config.tjs for', folderName, e);
        }
    }

    // 2. Secondary: package.json
    try {
        const pkgPath = path.join(folderPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (!title && pkgData.name && pkgData.name !== "rmmz-game") {
                title = pkgData.name;
            }
            if (pkgData.window) windowConfig = pkgData.window;
        }
    } catch (e) {
        console.warn('Failed to read metadata for', folderName);
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
        const hasNwExe = fs.existsSync(path.join(folderPath, 'nw.exe'));
        const hasGameExe = fs.existsSync(path.join(folderPath, 'Game.exe'));
        const hasNwDll = fs.existsSync(path.join(folderPath, 'nw.dll'));

        // If NO executables AND NO runtime dll, then it's slim
        // If it has nw.dll, it's definitely NOT slim (even if exe is renamed)
        if (!hasNwExe && !hasGameExe && !hasNwDll) {
            isSlim = true;
        }
    }

    return { title, folderPath, entryPoint, iconPath, windowConfig, type, isSlim, rjCode };
}

function renderGameList(games) {
    gameGrid.innerHTML = '';
    games.sort((a, b) => a.title.localeCompare(b.title));

    games.forEach(game => {
        createGameCard(game);
    });
}

function createGameCard(game) {
    const { title, folderPath, entryPoint, iconPath, windowConfig, type, isSlim, rjCode } = game;
    const card = document.createElement('div');
    card.className = 'game-card';
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
                if (isScanning) {
                    alert("正在背景掃描遊戲列表，請等待掃描完成後再執行瘦身操作。");
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

    gameGrid.appendChild(card);
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
                // Determine path to patches relative to ORIGINAL folder to avoid confusion?
                // Actually passing the launchPath (Junction) is probably safer for relative paths inside game.
                // But patches might need to know real path for some reason?
                // For now, let's use launchPath so the game thinks it's there.
                try {
                    injectGamePatches(launchPath);
                } catch (e) {
                    console.error("Patch Injection Failed:", e);
                }
            };
        } else if (type === 'tyrano') {
            console.log("Launching Tyrano: Activating Node.js Environment...");
            gameFrame.onload = () => {
                injectTyranoPatches(launchPath);
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
async function getDriveType(inputPath) {
    // 0: Unknown, 1: NoRoot, 2: Removable, 3: Fixed, 4: Network, 5: CD-ROM, 6: RAM
    // Powershell snippet to get drive type
    return new Promise((resolve) => {
        try {
            const root = path.parse(inputPath).root;
            // Quick check for UNC path (starts with \\)
            if (inputPath.startsWith('\\\\')) return resolve(4);

            require('child_process').exec(`powershell -NoProfile -Command "(Get-WmiObject Win32_LogicalDisk | Where-Object {$_.DeviceID -eq '${root.replace('\\', '').replace(':', '')}'}).DriveType"`, (err, stdout) => {
                if (err || !stdout) resolve(0);
                else resolve(parseInt(stdout.trim()));
            });
        } catch (e) {
            resolve(0);
        }
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

// --- Network Drive Detection ---
// This function is now replaced by the new getDriveType above.
// function getDriveType(rootPath) {
//     return new Promise((resolve) => {
//         const driveLetter = path.parse(rootPath).root.replace('\\', ''); // "C:"

//         // UNC Path Check (Starts with \\)
//         if (rootPath.startsWith('\\\\')) {
//             resolve(4); // Treat as Network
//             return;
//         }

//         // Mapped Drive Check via PowerShell
//         const cmd = `powershell -NoProfile -Command "(Get-WmiObject -Class Win32_LogicalDisk -Filter \\"DeviceID='${driveLetter}'\\").DriveType"`;
//         require('child_process').exec(cmd, (err, stdout) => {
//             if (err) {
//                 console.warn("Drive type check failed", err);
//                 resolve(3); // Assume Local if failed
//             } else {
//                 const type = parseInt(stdout.trim());
//                 resolve(isNaN(type) ? 3 : type);
//             }
//         });
//     });
// }

function showSlimModal(title, count, sizeStr, isNetwork) {
    return new Promise((resolve) => {
        slimTitle.innerText = title;
        slimCount.innerText = count;
        slimSize.innerText = sizeStr;

        if (isNetwork) {
            networkWarning.classList.remove('hidden');
        } else {
            networkWarning.classList.add('hidden');
        }

        slimModal.classList.remove('hidden');

        // Handlers
        const close = () => {
            slimModal.classList.add('hidden');
            cleanup();
            resolve(false);
        };

        const confirm = () => {
            slimModal.classList.add('hidden');
            cleanup();
            resolve(true);
        };

        const cleanup = () => {
            btnCloseSlim.removeEventListener('click', close);
            btnCancelSlim.removeEventListener('click', close);
            btnConfirmSlim.removeEventListener('click', confirm);
        };

        btnCloseSlim.addEventListener('click', close);
        btnCancelSlim.addEventListener('click', close);
        btnConfirmSlim.addEventListener('click', confirm);
    });
}

// --- Slim Logic ---
async function confirmAndCleanGame(folderPath, title) {
    // 1. Standard "Junk" Files (Always Safe to Remove if they exist)
    const standardFiles = [
        'nw.exe',
        'Game.exe',
        'crashpad_handler.exe',
        'notification_helper.exe',
        'nw.dll',
        'node.dll',
        'ffmpeg.dll',
        'libGLESv2.dll',
        'libEGL.dll',
        'vk_swiftshader.dll',
        'vulcan-1.dll',
        'nw_100_percent.pak',
        'nw_200_percent.pak',
        'resources.pak',
        'icudtl.dat',
        'v8_context_snapshot.bin',
        'credits.html',
        'd3dcompiler_47.dll',
        'natives_blob.bin',
        'nw_elf.dll',
        'snapshot_blob.bin',
        'ffmpegsumo.dll',
        'nw.pak',
        'pdf.dll'
    ];

    // Files we definitely plan to remove
    let filesToRemove = [...standardFiles];

    // 2. Network Check (Do this EARLY to decide on EXE logic)
    let isNetwork = false;
    try {
        const driveType = await getDriveType(folderPath); // 4 = Network
        if (driveType === 4) isNetwork = true;
    } catch (e) {
        console.warn("Network check error", e);
    }

    // 3. EXE Analysis
    const allExes = [];
    const nonStandardExes = [];

    try {
        const rootFiles = fs.readdirSync(folderPath);
        for (const file of rootFiles) {
            if (file.toLowerCase().endsWith('.exe')) {
                // Ignore Uninstallers
                if (file.toLowerCase().startsWith('unins')) continue;

                allExes.push(file);

                // Check if it's a "Standard" name
                // (Note: standardFiles includes nw.exe/Game.exe/helpers)
                if (!standardFiles.includes(file)) {
                    nonStandardExes.push(file);
                }
            }
        }
    } catch (e) {
        console.warn("Autoscan for exe failed:", e);
    }

    // 4. Decision Logic for EXEs
    let warningMessage = "";

    if (nonStandardExes.length > 0) {
        if (isNetwork) {
            // Case A: Network Drive + Non-Standard EXE -> SAFETY FIRST
            // Do NOT delete non-standard EXEs.
            // Also, do not auto-delete even standard EXEs if there's confusion? 
            // Standard EXEs are useless without libraries, so ok to delete.
            // But exclude non-standard ones from 'filesToRemove' (they aren't in there yet unless we push them)
            warningMessage += "\n(注意：偵測到非標準名稱的執行檔，因位於網路磁碟，系統已跳過該檔案)";
        } else {
            // Local Drive
            if (allExes.length === 1 && nonStandardExes.length === 1) {
                // Case B: Exactly 1 EXE, and it is the non-standard one.
                // "If non-standard name, prompt and delete" (User Request)
                // We add it to the deletion list.
                filesToRemove.push(nonStandardExes[0]);
                warningMessage += `\n(已包含非標準執行檔: ${nonStandardExes[0]})`;
            } else if (allExes.length > 1) {
                // Case C: Multiple EXEs (e.g. Game.exe + Launcher.exe)
                // "If > 1 exe, prompt user to manually delete"
                // We SKIP adding non-standard EXEs.
                // We also might want to remove Standard EXEs from the list to be safe? 
                // Usually standard EXEs (nw.exe) are safe to delete as they are just the runner.
                // But let's stick to: "Prompt user to manually delete".
                // We will delete standard junk (dlls), but leave ambiguous EXEs?
                // Let's filter OUT 'Game.exe' if there is ambiguity, just in case?
                // No, 'Game.exe' is usually generic.
                // We simply DO NOT ADD the non-standard ones.
                warningMessage += "\n(注意：偵測到多個執行檔，請手動確認並刪除剩餘的 EXE)";
            }
        }
    }
    // Note: If no non-standard EXEs, we just delete the standard list (nw.exe/Game.exe etc), which is correct behavior.

    const foldersToRemove = [
        'locales',
        'swiftshader',
        'pnacl'
    ];

    // 5. Calculate Savings (using the FINAL filesToRemove list)
    let totalBytes = 0;
    let foundItems = 0;
    for (const file of filesToRemove) {
        const p = path.join(folderPath, file);
        if (fs.existsSync(p)) {
            totalBytes += getItemSize(p);
            foundItems++;
        }
    }
    for (const folder of foldersToRemove) {
        const p = path.join(folderPath, folder);
        if (fs.existsSync(p)) {
            totalBytes += getItemSize(p);
            foundItems++;
        }
    }

    if (foundItems === 0) {
        alert("未發現可移除的 NW.js 檔案，此資料夾可能已經瘦身過。");
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

        let deletedCount = 0;

        // 2. Remove Files
        for (const file of filesToRemove) {
            const p = path.join(folderPath, file);
            if (fs.existsSync(p)) {
                try {
                    // Artificial Delay for CLI effect
                    await new Promise(r => setTimeout(r, 20));

                    if (isNetwork) {
                        fs.unlinkSync(p); // Network: Perm delete
                    } else {
                        nw.Shell.moveItemToTrash(p); // Local: Recycle Bin
                    }
                    logCli(`> Removing file: ${file}... OK`);
                    deletedCount++;
                } catch (e) {
                    console.error('Delete failed:', p, e);
                    logCli(`> Removing file: ${file}... FAILED (${e.message})`, 'error');
                }
            }
        }

        // 3. Remove Folders
        for (const folder of foldersToRemove) {
            const p = path.join(folderPath, folder);
            if (fs.existsSync(p)) {
                try {
                    await new Promise(r => setTimeout(r, 20));
                    if (isNetwork) {
                        fs.rmdirSync(p, { recursive: true });
                    } else {
                        nw.Shell.moveItemToTrash(p);
                    }
                    logCli(`> Removing folder: ${folder}... OK`);
                    deletedCount++;
                } catch (e) {
                    logCli(`> Removing folder: ${folder}... FAILED`, 'error');
                }
            }
        }

        // 4. Finish
        logCli("---------------------------------------------------");
        logCli(`Cleanup Complete!`, 'success');
        logCli(`Removed: ${deletedCount} items`);
        logCli(`Space Saved: ${savedSizeStr}`, 'success');

        // Update UI to "Done" state
        btnConfirmSlim.textContent = "完成";
        btnConfirmSlim.disabled = false;

        // Remove old listener to prevent re-run, add close listener
        const newBtn = btnConfirmSlim.cloneNode(true);
        btnConfirmSlim.parentNode.replaceChild(newBtn, btnConfirmSlim);

        newBtn.addEventListener('click', () => {
            slimModal.classList.add('hidden');
            loadLibrary(libraryPath);
        });
    };


    // Setup Event Listeners
    // Clone buttons to remove previous listeners (or just use onclick)
    document.getElementById('btn-confirm-slim').onclick = runCleanProcess;

    document.getElementById('btn-cancel-slim').onclick = () => {
        slimModal.classList.add('hidden');
    };
    document.getElementById('btn-close-slim').onclick = () => {
        slimModal.classList.add('hidden');
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
    const pluginsPath = path.join(folderPath, 'www', 'js', 'plugins.js');
    if (!fs.existsSync(pluginsPath)) return;

    try {
        let content = fs.readFileSync(pluginsPath, 'utf8');
        // Expected format: var $plugins = [...];
        // Strip header/footer to get JSON
        const jsonStart = content.indexOf('[');
        const jsonEnd = content.lastIndexOf(']');

        if (jsonStart === -1 || jsonEnd === -1) return;

        const jsonStr = content.substring(jsonStart, jsonEnd + 1);
        const plugins = JSON.parse(jsonStr);
        let modified = false;

        // Correct Scenario Path (Absolute + POSIX)
        // Convert backslashes to forward slashes to match JS convention and avoid escaping issues
        // e.g. "Y:/games/GameFolder/scenario/"
        let scenarioAbsolutePath = path.join(folderPath, 'scenario').replace(/\\/g, '/');

        // Ensure trailing slash
        if (!scenarioAbsolutePath.endsWith('/')) scenarioAbsolutePath += '/';

        for (const plugin of plugins) {
            if (plugin.name === 'Nore_Tes' && plugin.status === true) {
                if (plugin.parameters && plugin.parameters.scenarioFolder) {
                    const val = plugin.parameters.scenarioFolder;

                    // Update if it doesn't match our calculated absolute path
                    if (val !== scenarioAbsolutePath) {
                        console.log(`[Launcher] Patching Nore_Tes scenarioFolder: ${val} -> ${scenarioAbsolutePath}`);
                        plugin.parameters.scenarioFolder = scenarioAbsolutePath;
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
            console.log("[Launcher] plugins.js patched successfully.");
        }

    } catch (e) {
        console.error("[Launcher] Failed to patch plugins.js", e);
    }
}
