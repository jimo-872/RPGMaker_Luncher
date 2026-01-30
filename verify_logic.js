const fs = require('fs');
const path = require('path');

const rootPath = path.resolve('test_env');
console.log(`Scanning: ${rootPath}`);

async function run() {
    if (!fs.existsSync(rootPath)) {
        console.log("Creating test_env...");
        fs.mkdirSync(rootPath);
    }

    // Create dummy games for testing if empty
    const legPath = path.join(rootPath, "Legacy_Game");
    if (!fs.existsSync(legPath)) {
        fs.mkdirSync(legPath);
        fs.writeFileSync(path.join(legPath, "Game.exe"), "dummy exe");
    }

    const webPath = path.join(rootPath, "Web_Game");
    if (!fs.existsSync(webPath)) {
        fs.mkdirSync(webPath);
        fs.writeFileSync(path.join(webPath, "index.html"), "<html></html>");
    }

    // New Test Case: Generic Name with System.json
    const mzPath = path.join(rootPath, "MZ_Generic");
    if (!fs.existsSync(mzPath)) {
        fs.mkdirSync(mzPath);
        fs.writeFileSync(path.join(mzPath, "index.html"), "<html></html>");
        fs.writeFileSync(path.join(mzPath, "package.json"), JSON.stringify({ name: "rmmz-game" }));

        const dataPath = path.join(mzPath, "data");
        if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath);
        fs.writeFileSync(path.join(dataPath, "System.json"), JSON.stringify({ gameTitle: "TRUE_MZ_TITLE" }));
    }

    const items = await fs.promises.readdir(rootPath, { withFileTypes: true });
    const gameFolders = items.filter(dirent => dirent.isDirectory());

    for (const dir of gameFolders) {
        const fullPath = path.join(rootPath, dir.name);
        checkAndAddGame(fullPath, dir.name);
    }
}

function checkAndAddGame(folderPath, folderName) {
    let entryPoint = null;
    let type = 'unknown';

    // 1. Check for Web/MV/MZ
    if (fs.existsSync(path.join(folderPath, 'index.html'))) {
        entryPoint = 'index.html';
        type = 'web';
    }
    else if (fs.existsSync(path.join(folderPath, 'www', 'index.html'))) {
        entryPoint = 'www/index.html';
        type = 'web';
    }
    // 2. Check for Legacy EXE
    else {
        if (fs.existsSync(path.join(folderPath, 'Game.exe'))) {
            entryPoint = 'Game.exe';
            type = 'exe';
        } else if (fs.existsSync(path.join(folderPath, 'RPG_RT.exe'))) {
            entryPoint = 'RPG_RT.exe';
            type = 'exe';
        }
    }

    if (!entryPoint) {
        console.log(`[IGNORED] ${folderName} - No entry point found.`);
        return;
    }

    let title = folderName;
    try {
        const pkgPath = path.join(folderPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkgData.name) title = pkgData.name;
        }
    } catch (e) {
        console.warn('Failed to read package.json');
    }

    // Advanced Title Detection Logic (Mirrored from main.js)
    if (title === 'rmmz-game' || title === 'rpg-maker-mv' || title === 'Game' || title === folderName) {
        try {
            const possibleSysPaths = [
                path.join(folderPath, 'www', 'data', 'System.json'),
                path.join(folderPath, 'data', 'System.json')
            ];
            for (const sysPath of possibleSysPaths) {
                if (fs.existsSync(sysPath)) {
                    const sysData = JSON.parse(fs.readFileSync(sysPath, 'utf8'));
                    if (sysData.gameTitle) {
                        title = sysData.gameTitle;
                        break;
                    }
                }
            }
        } catch (err) { }
    }

    console.log(`[FOUND] ${title} (Path: ${folderName}, Entry: ${entryPoint}, Type: ${type})`);
}

run();
