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

const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const settingsModal = document.getElementById('settings-modal');
const inputWidth = document.getElementById('setting-width');
const inputHeight = document.getElementById('setting-height');
const inputFullscreen = document.getElementById('setting-fullscreen');
const inputRecursive = document.getElementById('setting-recursive');

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
    const cards = document.querySelectorAll('.game-card');

    cards.forEach(card => {
        const title = card.getAttribute('data-title').toLowerCase();
        const folder = card.getAttribute('data-folder').toLowerCase();
        const isSlim = card.getAttribute('data-slim') === 'true';

        // 1. Text Match
        const matchText = title.includes(query) || folder.includes(query);

        // 2. Type Match
        let matchType = true;
        if (filterType === 'slim' && !isSlim) matchType = false;
        if (filterType === 'full' && isSlim) matchType = false;

        if (matchText && matchType) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

searchInput.addEventListener('input', applyFilters);
filterSlim.addEventListener('change', applyFilters);

// --- View Management ---
function showLauncherView() {
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

    // Check for Slim Status (Web only)
    let isSlim = false;
    if (type === 'web') {
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
        menu.append(new nw.MenuItem({ label: '瘦身 (移除 NW.js 執行檔)', click: () => confirmAndCleanGame(folderPath, title) }));
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
    const fullEntryPath = path.join(folderPath, entryPoint);

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

            process.chdir(folderPath);
            console.log('Changed CWD to:', folderPath);
        } catch (e) {
            console.error('Failed to change CWD or setup paths', e);
        }

        // 2. Construct URL
        const normalizedPath = fullEntryPath.replace(/\\/g, '/');
        const targetUrl = `file:///${normalizedPath}`;

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
                injectGamePatches(folderPath);
            };
        } else if (type === 'tyrano') {
            console.log("Launching Tyrano: Activating Node.js Environment...");
            gameFrame.onload = () => {
                injectTyranoPatches(folderPath);
            };
        }

    } else if (type === 'exe') {
        // --- Legacy EXE Strategy ---
        // Launch in separate process
        console.log(`Launching Legacy Game: ${fullEntryPath}`);
        execFile(fullEntryPath, [], { cwd: folderPath }, (error, stdout, stderr) => {
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

    // Use JSON.stringify to safely escape path for string injection
    const safePath = JSON.stringify(path.join(folderPath, 'save') + path.sep);

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
    `;

    try {
        win.eval(patchScript);

        // --- Key Listener (F8/F12) - Injected directly to window object ---
        win.addEventListener('keydown', (e) => {
            if (e.key === 'F8' || e.key === 'F12') {
                e.preventDefault();
                e.stopPropagation();
                if (window.parent && window.parent.openGameDevTools) {
                    window.parent.openGameDevTools();
                }
            }
        });

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
        window.addEventListener('keydown', (e) => {
            if (e.key === 'F8' || e.key === 'F12') {
                e.preventDefault();
                e.stopPropagation();
                if (window.parent && window.parent.openGameDevTools) {
                    window.parent.openGameDevTools();
                }
            }
        });
    `;

    try {
        win.eval(patchScript);
    } catch (e) {
        console.error("Failed to inject Tyrano patches", e);
    }
}

// Expose showLauncherView to global so iframe can access it via window.parent.showLauncherView()
window.showLauncherView = showLauncherView;

async function confirmAndCleanGame(folderPath, title) {
    // Confirmation moved to after scanning logic to show specific file info

    const filesToRemove = [
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
        'credits.html'
    ];

    // Auto-detect other .exe files (Renamed game loaders)
    try {
        const rootFiles = fs.readdirSync(folderPath);
        for (const file of rootFiles) {
            if (file.toLowerCase().endsWith('.exe')) {
                // Exclude Uninstallers
                if (file.toLowerCase().startsWith('unins')) continue;
                // Exclude Launcher specific tools? (none expected in game folder)

                // Add to list if not already present
                if (!filesToRemove.includes(file)) {
                    filesToRemove.push(file);
                }
            }
        }
    } catch (e) {
        console.warn("Autoscan for exe failed:", e);
    }

    const foldersToRemove = [
        'locales',
        'swiftshader',
        'pnacl'
    ];

    let deletedCount = 0;
    let errors = 0;

    // Helper to run PowerShell command for recycling
    const recycleItem = (itemPath, isDirectory) => {
        return new Promise((resolve, reject) => {
            // Escape single quotes for PowerShell
            const safePath = itemPath.replace(/'/g, "''");
            const method = isDirectory ? 'DeleteDirectory' : 'DeleteFile';
            const command = `powershell.exe -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}('${safePath}', 'OnlyErrorDialogs', 'SendToRecycleBin')"`;

            require('child_process').exec(command, (err, stdout, stderr) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    };

    // Process Files
    for (const file of filesToRemove) {
        const filePath = path.join(folderPath, file);
        if (fs.existsSync(filePath)) {
            try {
                await recycleItem(filePath, false);
                deletedCount++;
            } catch (e) {
                console.error(`Failed to recycle ${file}`, e);
                errors++;
            }
        }
    }

    // Process Folders
    for (const folder of foldersToRemove) {
        const dirPath = path.join(folderPath, folder);
        if (fs.existsSync(dirPath)) {
            try {
                await recycleItem(dirPath, true);
                deletedCount++;
            } catch (e) {
                console.error(`Failed to recycle folder ${folder}`, e);
                errors++;
            }
        }
    }

    if (errors > 0) {
        alert(`瘦身完成，但在移動部分檔案至資源回收桶時發生錯誤。\n已移除: ${deletedCount} 個項目`);
    } else if (deletedCount === 0) {
        alert("未發現可移除的 NW.js 檔案，此資料夾可能已經瘦身過。");
    } else {
        alert(`瘦身成功！\n已將 ${deletedCount} 個 NW.js 相關檔案/資料夾移至資源回收桶。\n若遊戲無法執行，可隨時還原。`);
    }
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
