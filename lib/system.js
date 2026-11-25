document.getElementById("version-short").innerHTML = "[BW ver 0.6.3.1]";

function playCheckSound() {
    var audio = document.getElementById('sound');
    audio.play();
}

// 画面全体にクリックとタッチスタートのリスナーを追加
document.body.addEventListener('click', playCheckSound);
document.body.addEventListener('touchend', function (event) {
    event.preventDefault(); // タッチイベントのデフォルト動作を防ぐ
    playCheckSound();
});


// ここのテキストは自由に書き換えて大丈夫です
const readyText = "[準備中]";
const descriptionText = "キーボード入力 or 画面スワイプで移動" // 今はhidden
const clickToStartText = "画面タッチで開始";
const initializeMidiText = "MIDI環境設定開始";
const initialDownloadingText = "ゲームファイルチェック中";
const buttonNormalColor = "whitesmoke"
const buttonPressedColor = "darkgrey"
var noGameHeaderFooter = false;

// ここから下はシステムに関わる部分なので基本的に触らない
document.title = WoditorGameSettings.projectName;
document.getElementById("title").innerHTML = readyText;
document.getElementById("readme").innerHTML = descriptionText;

// <base href="/GameFilesUpdate/202553/2/"> などで設定されている場合(PLiCy形式)
function getPLiCyFormatGameId(){
    const match = document.baseURI.match(/GameFilesUpdate\/(\d+)\/(\d+)/);
    if(match && match[1] && match[2]){
        const Game_ID = match[1];   //PLiCy上のGame_ID
        const Update_No = match[2]; //PLiCyでバージョンアップした回数
        return Game_ID;         //PLiCyのGame_IDをプロジェクトIDに設定
    }
    return null;
}

// Game_IDというidが iframe URLに指定されていればそれを抽出 http://example.com/iframe/Game_ID=xxx
function getGameIdFromLocationPathname() {
    // クエリ文字列にも対応させる
    // 「{Game_ID}_{settings.projectId}」= 「g3_g3」等
    const fromQuery = new URLSearchParams(window.location.search).get("Game_ID");
    if (fromQuery) {
        return fromQuery;
    }
    const match = window.location.pathname.match(/Game_ID=([A-Za-z0-9]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
}

// いずれかの方式でGame_IDが指定されていないか確認して取得する
function getGameIdFromUrl() {
    const gameIdFromPLiCyFormat = getPLiCyFormatGameId();
    if(gameIdFromPLiCyFormat){
        console.log("PLiCy形式のGame_IDを取得しました");
        return gameIdFromPLiCyFormat;
    }
    const gameIdFromLocationPathname = getGameIdFromLocationPathname();
    if(gameIdFromLocationPathname){
        console.log("PathnameからGame_IDを取得しました");
        return gameIdFromLocationPathname;
    }
    console.log("サイトURLを基準のGame_IDとします");
    return null;
}

function getGameProjectPath() {
    // Game_IDというidが iframe URL に含まれていればばそれを使う
    const gameIdValue = getGameIdFromUrl();
    if (gameIdValue) {
      return gameIdValue + "_" + WoditorGameSettings.projectId;
    }

    // 設置するサイトのドメイン以降のパスを見ます(iframe内に設置した場合も表示ページのURLを基準に)
    // http://example.com/GamePlay/12345 => GamePlay_12345_project_id
    let dir = null;

    try{
        dir = top.location.pathname; // iframeではCORSが発生する可能性があるため例外処理でfallback
    }catch(e){
        dir = window.location.pathname;
    }
    
    const sep = dir.endsWith("/") ? "" : "/";
    let path = dir + sep + WoditorGameSettings.projectId;

    path = path.replace("index.html/", "");
    path = path.replaceAll(".", "_");
    if (path.startsWith("/")) {
        path = path.substring(1);
    }
    path = path.replaceAll("/", "_");

    console.log("Game project path:", path);

    return path;
}

var Module = {
    projectId: getGameProjectPath(),
    showDebugLog: 1,
    woditor: {},
    noInitialRun: true,
    preRun: [],
    postRun: [],
    print: (function () {
        return function (text) {
            text = Array.prototype.slice.call(arguments).join(' ');
            console.log(text);
        };
    })(),
    printErr: function (text) {
        text = Array.prototype.slice.call(arguments).join(' ');
        document.getElementById("error-log").innerHTML += text;
        console.error(text);
    },
    canvas: (function () {
        var canvas = document.getElementById('canvas');
        canvas.addEventListener("webglcontextlost", function (e) { alert('FIXME: WebGL context lost, please reload the page'); e.preventDefault(); }, false);
        return canvas;
    })(),
    webgl_enable_webgl2: true,
    webgl_enable_extension: ["OES_texture_float", "WEBGL_color_buffer_float"],
    title: document.getElementById("title"),
    setStatus: function (text) {
        if (text == '') {
            Module.ready = true;
            document.getElementById('title').innerHTML = clickToStartText;
            document.getElementById('touchtostart').innerHTML = clickToStartText;
        }
    },
    monitorRunDependencies: function (left) { },
    //ウディタ内部の「BrowserWoditor:」でデバッグ文が実行された時に内容の文が飛んでくる関数です
    catchGameMessage: function (message) {
        if(message.startsWith("warning:")){
            showToast(message); // 警告はトーストで表示
        }
        console.log(message);
    },
    playVibration: function (inputType, power, time, effectIndex) {
        playGamePadVibration(inputType, power, time, effectIndex); // 後述
    }
};

window.progressDownloading = function (loaded, total, filename) {
    const percentage = total > 0 ? Math.round(100 * loaded / total) + "%" : Math.round(loaded / 100000) / 10 + "MB";
    const progressText = filename + " [" + percentage + "]";
    document.getElementById('title').innerHTML = progressText;
    document.getElementById('touchtostart').innerHTML = progressText;
}

function registerKeyDownUp(buttonEl, keyCode) {
    // 【WOLF改造】方向キーパッド(#move-axis)が即反応(tap)モードのときは、
    // ボタン全体の背景色変化(暗転)を行わない。反応は keydispatch.js 側の
    // 「押した方向のセクターハイライト」のみとし、過剰反応に見えるのを防ぐ。
    // shift/esc/enter 等の他ボタンおよびドラッグ式時の #move-axis は従来どおり暗転する。
    const setButtonColor = (color) => {
        if (buttonEl.id === 'move-axis' && typeof getDirPadMode === 'function' && getDirPadMode() === 'tap') {
            buttonEl.style.backgroundColor = buttonNormalColor; // tap中は常に通常色を維持
            return;
        }
        buttonEl.style.backgroundColor = color;
    };
    buttonEl.addEventListener('mousedown', (e) => {
        setButtonColor(buttonPressedColor); // 【WOLF改造】直接代入をガード付き関数経由に変更(以下同)
        e.preventDefault();
        dispatchKeyCode('keydown', keyCode);
    });
    buttonEl.addEventListener('mouseup', (e) => {
        setButtonColor(buttonNormalColor);
        e.preventDefault();
        dispatchKeyCode('keyup', keyCode);
    });
    buttonEl.addEventListener('touchstart', (e) => {
        setButtonColor(buttonPressedColor);
        e.preventDefault();
        dispatchKeyCode('keydown', keyCode);
    });
    buttonEl.addEventListener('touchend', (e) => {
        setButtonColor(buttonNormalColor);
        e.preventDefault();
        dispatchKeyCode('keyup', keyCode);
    });
    buttonEl.addEventListener('touchcancel', (e) => {
        setButtonColor(buttonNormalColor);
        e.preventDefault();
        dispatchKeyCode('keyup', keyCode);
    });
}
const rightClickButton = document.getElementById("right-hold");
rightClickButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    rightClickButton.style.backgroundColor = buttonPressedColor;
});
rightClickButton.addEventListener('mouseup', (e) => {
    e.preventDefault();
    rightClickButton.style.backgroundColor = buttonNormalColor;
});
rightClickButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    rightClickButton.style.backgroundColor = buttonPressedColor;
    enableMouseRightButton();
});
rightClickButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    rightClickButton.style.backgroundColor = buttonNormalColor;
    disableMouseRightButton();
});
registerKeyDownUp(document.getElementById("shift"), shift);
registerKeyDownUp(document.getElementById("esc"), cancel);
registerKeyDownUp(document.getElementById("enter"), enter);
registerKeyDownUp(document.getElementById("move-axis"), undefined);

var screenObserver = undefined;
function setCustomGameSize(width, height) { //システムの初期化時に内部から呼ばれ、画面サイズを自動的に調節します
    if (!screenObserver) {
        screenObserver = new ResizeObserver(function (mutations) {
            adjustGameUI();
        });
        screenObserver.observe(document.body);
    }
    // 入力位置補正
    Module.gameWidth = width;
    Module.gameHeight = height;

    // アス比調整
    Module.canvas.width = width;
    Module.canvas.height = height;
    adjustGameUI();
}
window.onload = () => {
    const resizableEl = document.getElementById("canvas");
    setCustomGameSize(resizableEl.width, resizableEl.height); // 標準サイズで一度呼ぶ
}

window.onerror = (err) => {
    // document.getElementById("error-log").innerHTML += err;
}
function showGameMemoryUsage() {
    if (Module && Module.HEAP8) {
        const memory = (Math.round(10 * Module.HEAP8.length / 1000000) / 10 + "MB");
        document.getElementById("memory-usage").innerHTML = "使用メモリ:" + memory;
    }
}
setInterval(showGameMemoryUsage, 1000);

function showToast(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = "show";
    setTimeout(function () { toast.className = toast.className.replace("show", ""); }, 3000);
}

function handleFullScreen() {
    var elem = document.getElementById("main-content");
    const isIPhone = /iPhone/i.test(navigator.userAgent);
    const isIPad = /iPad/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

    if (true || isIPhone || isIPad) { // すべてのデバイスで仮想(仮)
        if (!WoditorGameSettings.isPseudoFullscreen) {
            startPseudoFullscreen();
        } else {
            endPseudoFullscreen();
        }
        adjustGameUI();

    } else if (elem.requestFullscreen) {
        elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) { /* Safari */
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) { /* IE11 */
        elem.msRequestFullscreen();
    }
}
function lockScreenOrientation(orientation) {
    if (orientation && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock(orientation).catch(function (error) {
            // alert("画面の向きをロックできませんでした:", error);
        });
    }
}
function tryFullScreen() {
    handleFullScreen();
    if (WoditorGameSettings.lockOrientation) {
        lockScreenOrientation(WoditorGameSettings.lockOrientation);
    }
    document.onfullscreenchange = (event) => {
        event.preventDefault();
        if (document.fullscreenElement) {
            WoditorGameSettings.isFullscreen = true;
        } else {
            WoditorGameSettings.isFullscreen = false;
        }
        adjustGameUI();
    };
}

document.getElementById('fullscreen').addEventListener('click', tryFullScreen);
document.getElementById('fullscreen').addEventListener('touchend', function (event) {
    event.preventDefault(); // タッチイベントのデフォルト動作を防ぐ
    tryFullScreen();
});

const mainContent = document.getElementById("outer");
function beforeGameStart() {
    document.getElementById('touchtostart').hidden = true;
}
function initializeGame() { // タッチ時のゲーム開始処理
    if (Module.ready && Module.woditor && !Module.woditor.initialized) {
        mainContent.ontouchend = undefined; // 何度も起動トライが走ると問題なので外す
        mainContent.onclick = undefined;

        Module.woditor.initialized = true;
        Module.woditor.textInputField = document.getElementById("textinput");

        document.getElementById('title').innerHTML = initializeMidiText;
        document.getElementById('title').innerHTML = initialDownloadingText;
        document.getElementById('touchtostart').innerHTML = initialDownloadingText;

        setTimeout(() => {
            window.Benten.initialize();
        }, 10);

        Module.callMain(); // entry point

        if (WoditorGameSettings.requestFullScreen) {
            handleFullScreen();
            lockScreenOrientation(WoditorGameSettings.lockOrientation);
        }
    }
}
mainContent.ontouchend = (e) => { //開始時タッチ
    if (e.target.localName == "a") {
        return;
    }
    e.preventDefault();
    initializeGame();
}
mainContent.onclick = (e) => { //クリックにも反応
    if (e.target.localName == "a") {
        return;
    }
    e.preventDefault();
    initializeGame();
}

window.addEventListener('touchend', function (event) { // iOSの領域外タッチ対策
    event.preventDefault();
});

window.addEventListener('beforeunload', function (event) {
    FS.syncfs(false, function (err) {
        console.log(err);
    });
});

async function customTestFileChanged(urlStr, pathStr) { // ファイルの要求時に内部から呼び出され、ファイルが更新されているかチェックしてDLするか決める
    try {
        const response = await fetch(urlStr, { method: "HEAD", redirect: 'follow' });
        if (response.status == 200) {
            var modifiedInfo = response.headers.get('ETag');
            const filePathStr = "/data0/" + Module.projectId + "-GameCache" + pathStr + "_etag";

            if (modifiedInfo === null) {
                modifiedInfo = response.headers.get('Last-Modified');
            }

            if (modifiedInfo === null) {
                modifiedInfo = "null";
            }

            if (FS.analyzePath(filePathStr, false).exists) {
                const prevModifiedInfo = FS.readFile(filePathStr, { encoding: 'utf8' });
                if (modifiedInfo !== prevModifiedInfo) { // 過去のETagが存在していてかつ違うETag
                    console.log("updated: " + pathStr, prevModifiedInfo, "=>", modifiedInfo);
                    FS.writeFile(filePathStr, modifiedInfo, { flags: 'w+' });
                    return true;
                }
            } else { // 過去のETagがそもそも存在しない(完全に新しいDL)
                console.log("new: " + pathStr, modifiedInfo);

                FS.writeFile(filePathStr, modifiedInfo, { flags: 'w+' });
                return true;
            }
        }
    } catch {
        return false;
    }
    return false;
}

function browserCheckFailed(errorCode) { // ブラウザ向け設定がされていない時に呼び出されます。ここでやるのは内部的なエラーを警告するだけです
    if (errorCode == 0) {
        alert("必要ファイルが Data.wolf の外側に配置されています\n手順を再度ご確認下さい");
    } else {
        alert("「Data/BasicData」フォルダ内に「BrowserWoditor.dat」が含まれていないため起動できませんでした\n手順を再度ご確認下さい\n(バージョンアップで仕様が変更された可能性があります)")
    }
}
const noSystemTouchEl = document.getElementById("no-system-touch");
function toggleNoSystemTouch() {
    WoditorGameSettings.noSystemTouch = !WoditorGameSettings.noSystemTouch;
    if (WoditorGameSettings.noSystemTouch) {
        noSystemTouchEl.style.backgroundColor = buttonPressedColor;
    } else {
        noSystemTouchEl.style.backgroundColor = buttonNormalColor;
    }
}
if (WoditorGameSettings.noSystemTouch) { // 初期カラー設定
    noSystemTouchEl.style.backgroundColor = buttonPressedColor;
} else {
    noSystemTouchEl.style.backgroundColor = buttonNormalColor;
}

const switchUIEl = document.getElementById("switch-ui");
function toggleSwitchUI() {
    WoditorGameSettings.switchUILeftRight = !WoditorGameSettings.switchUILeftRight;
    if (WoditorGameSettings.switchUILeftRight) {
        switchUIEl.style.backgroundColor = buttonPressedColor;
    } else {
        switchUIEl.style.backgroundColor = buttonNormalColor;
    }
    adjustGameUI();
}
if (WoditorGameSettings.switchUILeftRight && switchUIEl !== null) { // 初期カラー設定
    switchUIEl.style.backgroundColor = buttonPressedColor;
} else {
    switchUIEl.style.backgroundColor = buttonNormalColor;
}

function toggleSettingVisibility() {
    const el = document.getElementById("main-footer-additional");
    el.hidden = !el.hidden;
}

document.addEventListener("visibilitychange", async (e) => {
    if (document.visibilityState === "visible") {
        if (Module && Module.AL) {
            // オーディオコンテキストを再開する処理
            for (var key in Module.AL.contexts) {
                const ctx = Module.AL.contexts[key].audioCtx;
                if (ctx.state === "suspended") {
                    await ctx.resume().then(() => {
                        console.log("AudioContext resumed.");
                    }).catch(err => {
                        console.log("Failed to resume AudioContext:", err);
                    });
                }
            }

            // MIDI再生のミュート解除
            if (window.Benten) {
                window.Benten.unmute();
            }
        }
    } else if (document.visibilityState === "hidden") {
        if (window.Benten) {
            window.Benten.mute();
        }
    }
});

// 設定ボタン
{
    const popup = document.getElementById('popup');

    function startPseudoFullscreen() {
        showToast("設定ボタンから全画面解除");

        WoditorGameSettings.isFullscreen = true;
        WoditorGameSettings.isPseudoFullscreen = true;
        adjustGameUI();
    }

    function endPseudoFullscreen() {
        if (WoditorGameSettings.isFullscreen && WoditorGameSettings.isPseudoFullscreen) {
            WoditorGameSettings.isFullscreen = false;
            WoditorGameSettings.isPseudoFullscreen = false;
            adjustGameUI();
        }
    }
    function isOpenSetting() {
        return !popup.hidden;
    }
    function openSetting() {
        popup.hidden = !popup.hidden;
    }
    function closeSetting() {
        popup.hidden = true;
    }

    const button = document.getElementById('settings');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    let moveCount = 0;

    button.addEventListener('mousedown', dragStart);
    button.addEventListener('touchstart', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag);
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);

    function dragStart(e) {
        e.preventDefault();
        moveCount = 0;
        startTime = new Date().getTime();
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }

        if (e.target === button) {
            isDragging = true;
        }
    }

    function drag(e) {
        e.preventDefault();
        if (isDragging) {
            moveCount += 1;
            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            currentX = limitedX(currentX, button);
            currentY = limitedY(currentY, button);

            const translated = setTranslate(currentX, currentY, button);
            currentX = xOffset = translated.x;
            currentY = yOffset = translated.y;
        }
    }

    function dragEnd(e) {
        e.preventDefault();
        const moveCountThreshold = 20;

        if (moveCount < moveCountThreshold) {
            const isTargetCanvas = e.target.id == 'canvas';
            const isTargetBody = e.target == document.body;
            if ((isTargetCanvas || isTargetBody) && isOpenSetting()) { // canvasクリックで閉じる
                closeSetting();
            }

            const isTargetSetting = e.target.id == 'settings';
            if (isTargetSetting) {
                openSetting();
            }
        }

        initialX = currentX;
        initialY = currentY;

        isDragging = false;
    }

    const outer = document.getElementById("outer");
    let offsetX;
    let offsetY;
    let wholeWidth;
    let wholeHeight;
    let dragBoundsReady = false;
    let boundsButtonWidth;
    let boundsButtonHeight;

    // 回転後もドラッグ可能範囲を新しい表示領域に合わせるため、境界値は固定しない。
    function remapDragPosition(position, oldOffset, oldWhole, oldSize, newOffset, newWhole, newSize, leadingMargin, trailingMargin) {
        const oldMin = oldOffset + oldWhole * leadingMargin;
        const oldMax = oldOffset + oldWhole - oldSize - oldWhole * trailingMargin;
        const newMin = newOffset + newWhole * leadingMargin;
        const newMax = newOffset + newWhole - newSize - newWhole * trailingMargin;
        const oldRange = oldMax - oldMin;
        const newRange = newMax - newMin;
        if (!Number.isFinite(position)
            || !Number.isFinite(oldMin)
            || !Number.isFinite(oldRange)
            || oldRange <= 0
            || !Number.isFinite(newMin)
            || !Number.isFinite(newRange)) {
            return position;
        }
        const ratio = Math.max(0, Math.min(1, (position - oldMin) / oldRange));
        return newMin + ratio * Math.max(0, newRange);
    }

    function updateDragBounds() {
        const outerSize = outer.getBoundingClientRect();
        const newOffsetX = outerSize.left;
        const newOffsetY = outerSize.top;
        const newWholeWidth = window.innerWidth - newOffsetX;
        const newWholeHeight = window.innerHeight - newOffsetY;
        const buttonRect = button.getBoundingClientRect();
        const canRemap = dragBoundsReady
            && Number.isFinite(currentX)
            && Number.isFinite(currentY)
            && Number.isFinite(boundsButtonWidth)
            && Number.isFinite(boundsButtonHeight);

        if (canRemap) {
            const previousPointerX = isDragging && Number.isFinite(initialX) ? currentX + initialX : undefined;
            const previousPointerY = isDragging && Number.isFinite(initialY) ? currentY + initialY : undefined;
            currentX = remapDragPosition(currentX, offsetX, wholeWidth, boundsButtonWidth, newOffsetX, newWholeWidth, buttonRect.width, 0.1, 0.0125);
            currentY = remapDragPosition(currentY, offsetY, wholeHeight, boundsButtonHeight, newOffsetY, newWholeHeight, buttonRect.height, 0, 0.1);
            xOffset = currentX;
            yOffset = currentY;
            if (isDragging && Number.isFinite(previousPointerX) && Number.isFinite(previousPointerY)) {
                initialX = previousPointerX - currentX;
                initialY = previousPointerY - currentY;
            }
        }

        offsetX = newOffsetX;
        offsetY = newOffsetY;
        wholeWidth = newWholeWidth;
        wholeHeight = newWholeHeight;
        boundsButtonWidth = buttonRect.width;
        boundsButtonHeight = buttonRect.height;
        dragBoundsReady = true;
    }
    updateDragBounds();

    function limitedX(xPos, el) {
        const rect = el.getBoundingClientRect();
        xPos -= offsetX;
        return offsetX + Math.max(wholeWidth * 0.1, Math.min(xPos, wholeWidth - rect.width - wholeWidth * 0.0125));
    }

    function limitedY(yPos, el) {
        const rect = el.getBoundingClientRect();
        yPos -= offsetY;
        return offsetY + Math.max(0, Math.min(yPos, wholeHeight - rect.height - wholeHeight * 0.1));
    }

    function setTranslate(xPos, yPos, el) {
        const rect = el.getBoundingClientRect();
        xPos = limitedX(xPos, el); // iOSで左や下すぎると他操作と被るので問題
        yPos = limitedY(yPos, el);
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
        return { x: xPos, y: yPos };
    }

    window.addEventListener("resize", function (e) {
        updateDragBounds();
        if (Number.isFinite(currentX) && Number.isFinite(currentY)) {
            const translated = setTranslate(currentX, currentY, button);
            currentX = xOffset = translated.x;
            currentY = yOffset = translated.y;
        }
    });
    window.addEventListener("load", function (e) {
        updateDragBounds();
        const rect = button.getBoundingClientRect();
        xOffset = offsetX + wholeWidth - rect.width;
        yOffset = offsetY + Math.max(0, Math.min(yOffset, wholeHeight - rect.height));
        const translated = setTranslate(xOffset, yOffset, button);
        currentX = xOffset = translated.x;
        currentY = yOffset = translated.y;
    });
}

{
    document.body.addEventListener("touchmove", function (e) { // 余白対策
        e.preventDefault();
    });
}

{
    const framelimitEl = document.getElementById("framelimit");

    function changeFrameLimit() {
        const limitFPS = WoditorGameSettings.isLimitFPS ? 30 : 60;
        Module.ccall('setFrameLimit', null, ['number'], [limitFPS]);
    }

    function toggleFrameLimit() {
        WoditorGameSettings.isLimitFPS = !WoditorGameSettings.isLimitFPS;

        if (WoditorGameSettings.isLimitFPS) {
            framelimitEl.style.backgroundColor = buttonPressedColor;
        } else {
            framelimitEl.style.backgroundColor = buttonNormalColor;
        }
        changeFrameLimit();
    }

    if (WoditorGameSettings.limitFPS == 30 && !WoditorGameSettings.isLimitFPS) {
        toggleFrameLimit();
    }
}

{
    function openLink(url) {
        showToast("ポップアップブロックが有効なとき反応しない場合があります");

        window.open(url, '_blank').focus();
    }
}

// SaveフォルダDL/UL関連
{
    // ここを変えると全体のDL/UL対象Saveフォルダが変わります
    let targetSaveFileDir = "Save";

    function mkdirs(dirpath) {
        const rootDir = FS.analyzePath(dirpath);
        if (!rootDir.exists) {
            if (!rootDir.parentExists) {
                mkdirs(rootDir.parentPath);
            }
            try {
                FS.mkdir(dirpath);
            } catch (err) {
                console.log(err);
            }
        }
    }

    // {filename: Uint8Array}
    const zipAndDownloadAllDict = (dict) => {
        var zip = new JSZip();

        for (let key in dict) {
            zip.file(key, dict[key]);
        };

        const location = document.getElementById('savedownload');

        zip.generateAsync({ type: "base64" }).then(function (base64) {
            location.href = "data:application/zip;base64," + base64;
            location.click();
        });
    }

    function downloadSaveDir() {
        const savepath = "/data0/" + Module.projectId + "-Save";

        const root = FS.lookupPath(savepath);
        const fileDict = {};

        function lookupAndAdd(node, path) {
            if (FS.isDir(node.mode)) {
                for (const [key, value] of Object.entries(node.contents)) {
                    lookupAndAdd(node.contents[key], path + node.name + "/");
                }
            }
            if (FS.isFile(node.mode)) {
                const filename = (path + node.name).substring(2);
                fileDict[filename] = node.contents.buffer;
            }
        }
        lookupAndAdd(root.node, "");

        zipAndDownloadAllDict(fileDict);
    }

    function removeTree(path) {
        for (const name of FS.readdir(path)) {
            if (name === "." || name === "..") continue;

            const child = path + "/" + name;
            const stat = FS.lstat(child);

            if (FS.isDir(stat.mode)) {
                removeTree(child);
                FS.rmdir(child);
            } else {
                FS.unlink(child);
            }
        }
    }

    function clearIDBFS(mountPoint, callback) {
        // Emscripten上のFSから削除
        var result = FS.analyzePath(mountPoint);
        if (result.exists) {
            removeTree(mountPoint);
        }

        // 削除状態をIndexedDBへ反映
        FS.syncfs(false, (err) => {
            if (err) {
                console.error("IDBFS clear failed:", err);
                callback?.(err);
                return;
            }

            console.log("IDBFS cleared:", mountPoint);
            callback?.(null);
        });
    }

    function removeGameDir() {
        const cachepath = "/data0/" + Module.projectId + "-GameCache";
        
        clearIDBFS(cachepath);
        showToast("ゲームデータ削除完了。ブラウザリロードで反映されます");
    }


    function removeSaveDir() {
        const savepath = "/data0/" + Module.projectId + "-Save";
        const cachepath = "/data0/" + Module.projectId + "-GameCache/Save";

        clearIDBFS(savepath);
        clearIDBFS(cachepath);
        showToast("セーブデータ削除完了。ブラウザリロードで反映されます");
    }

    // キャッシュ領域と本体ファイル両方を上書き(フォルダが無ければ作成)
    const uploadSaveFiles = (dict) => {
        const savepath = "/data0/" + Module.projectId + "-Save";

        FS.mkdirTree(savepath + "/" + targetSaveFileDir);
        FS.mkdirTree(targetSaveFileDir);

        for (let key in dict) {
            const path = savepath + "/" + key;
            // 【WOLF改造】zip内のサブフォルダ付きエントリ(例: Save/sub/xxx.sav)に対応:
            // 書き込み先の親フォルダを永続側・実行時側の両方で再帰作成する
            const keyDir = key.substring(0, key.lastIndexOf("/"));
            if (keyDir !== "") {
                FS.mkdirTree(savepath + "/" + keyDir);
                FS.mkdirTree(keyDir);
            }
            FS.writeFile(path, dict[key]);
            FS.writeFile(key, dict[key]);
        };
        FS.syncfs(false, function (err) {
            if (err) {
                console.error("Save import persistence failed:", err);
                showToast("セーブデータを保存できませんでした。ページを再読み込みせず、もう一度アップロードしてください");
                return;
            }
            showToast("セーブデータの読み込みが完了しました。ゲームを再起動します");
            setTimeout(function () {
                window.location.reload();
            }, 0);
        });
    }

    // 【WOLF改造】原作のまま残置(現在は未使用)。zip判定のため全ファイルを
    // Uint8Arrayで読む必要があり、下の collectUploadDict 方式に置き換えた
    function loadAllFiles(selectedFiles, i, stop, dict, onLoadFinished) {
        const file = selectedFiles[i];
        const reader = new FileReader();

        reader.onload = function () {
            var ar = new Uint8Array(reader.result);
            dict[targetSaveFileDir + "/" + file.name] = ar;

            if (i + 1 < stop) {
                loadAllFiles(selectedFiles, i + 1, stop, dict, onLoadFinished);
            } else {
                onLoadFinished(dict);
            }
        }

        reader.readAsArrayBuffer(file);
    }

    // ========================================================================
    // 【WOLF改造】SaveフォルダULのzip対応
    //   downloadSaveDir()が生成するzip(SaveフォルダDL)をそのまま選択して復元できる
    //   ようにする(スマホではzip解凍→複数選択が実質不可能なため)。
    //   生ファイル(.sav等)の複数選択も従来どおり動作し、zipとの混在も可
    // ========================================================================

    // zip判定はマジックバイト PK\x03\x04(拡張子より堅牢)
    function isZipData(bytes) {
        return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    }

    // zipエントリ名 → Saveフォルダ相対パス("Save/...")へ正規化。復元対象外は null。
    // 【重要】downloadSaveDir()のzipエントリは、lookupAndAdd()が
    // 「ルートフォルダ名({projectId}-Save)から始まる相対パス」を組み立てたあと
    // .substring(2) で先頭2文字を削るため、先頭セグメントが
    // 「projectIdの3文字目以降+"-Save"」になる(例: projectId "g3_g3" なら
    // "_g3-Save/Save/SaveData01.sav")。そこで "-Save/" を含む場合は
    // そこまでを取り除いてSave相対パスに戻す(これでDLしたzipが元の配置に復元される)
    function normalizeZipEntryPath(entryName) {
        let p = String(entryName).replace(/\\/g, "/");
        while (p.indexOf("/") === 0) { p = p.substring(1); }
        if (p.indexOf("./") === 0) { p = p.substring(2); }
        if (p === "") { return null; }
        // macOSのFinder圧縮等が混ぜるメタデータは除外
        if (p.indexOf("__MACOSX/") === 0 || p.split("/").pop() === ".DS_Store") { return null; }
        const saveRootIdx = p.indexOf("-Save/");
        if (saveRootIdx >= 0) {
            p = p.substring(saveRootIdx + "-Save/".length);
        }
        if (p === "") { return null; }
        if (p.indexOf(targetSaveFileDir + "/") === 0) {
            return p; // 既にSave相対("Save/...")
        }
        return targetSaveFileDir + "/" + p; // 素のファイル名等はSave/直下扱い(生ファイルUL互換)
    }

    function readFileAsUint8(file) {
        return new Promise(function (resolve) {
            const reader = new FileReader();
            reader.onload = function () { resolve(new Uint8Array(reader.result)); };
            reader.onerror = function () { resolve(null); };
            reader.readAsArrayBuffer(file);
        });
    }

    // 選択ファイル群を {Save相対パス: Uint8Array} に集約する(zipは中身を展開)
    function collectUploadDict(selectedFiles) {
        const tasks = [];
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            tasks.push(readFileAsUint8(file).then(function (bytes) {
                if (bytes === null) {
                    return { errors: [file.name], files: [] }; // 読み込み失敗
                }
                if (!isZipData(bytes)) {
                    // 生ファイル: 従来どおり Save/ファイル名 として扱う(後方互換)
                    return { errors: [], files: [{ path: targetSaveFileDir + "/" + file.name, data: bytes }] };
                }
                return JSZip.loadAsync(bytes).then(function (zip) {
                    const fileEntries = [];
                    zip.forEach(function (relativePath, entry) {
                        if (!entry.dir) { fileEntries.push(entry); } // フォルダエントリは除外
                    });
                    return Promise.all(fileEntries.map(function (entry) {
                        return entry.async("uint8array").then(function (data) {
                            return { path: normalizeZipEntryPath(entry.name), data: data };
                        });
                    })).then(function (files) {
                        return { errors: [], files: files.filter(function (f) { return f.path !== null; }) };
                    });
                }).catch(function () {
                    return { errors: [file.name], files: [] }; // 壊れたzip
                });
            }));
        }
        return Promise.all(tasks).then(function (results) {
            const dict = {};
            const errors = [];
            results.forEach(function (r) {
                r.errors.forEach(function (name) { errors.push(name); });
                r.files.forEach(function (f) { dict[f.path] = f.data; });
            });
            return { dict: dict, errors: errors };
        });
    }

    // UP用ファイル選択ダイアログを開く(設定ポップアップのボタンから呼ばれる)。
    // ボタンはonclickとontouchstartの両方に紐付くため、短時間の二重発火をガードする
    let saveFilePickerLastOpen = 0;
    function openSaveFilePicker() {
        const now = Date.now();
        if (now - saveFilePickerLastOpen < 500) { return; }
        saveFilePickerLastOpen = now;
        document.getElementById("savefiles").click();
    }

    function uploadSaveDir() {
        const inputEl = document.getElementById("savefiles");
        const selectedFiles = inputEl.files;

        if (selectedFiles.length > 0) {
            // 【WOLF改造】zip対応の集約処理経由に変更(生ファイルも同経路で従来互換)
            collectUploadDict(selectedFiles).then(function (result) {
                const count = Object.keys(result.dict).length;
                if (count > 0) {
                    try {
                        uploadSaveFiles(result.dict); // 部分成功でも書き込み＆syncfsする
                    } catch (err) {
                        console.error("Save import persistence failed:", err);
                        showToast("セーブデータを保存できませんでした。ページを再読み込みせず、もう一度アップロードしてください");
                    }
                }
                if (result.errors.length > 0) {
                    showToast("読み込めないファイルがありました: " + result.errors.join(", "));
                } else if (count === 0) {
                    showToast("復元できるファイルがありませんでした(空のzip?)");
                }
                inputEl.value = ""; // 同じファイルを選び直せるようクリア
            });
        }
    }
}

{
    let isPlayingGanePadVibration = false;

    //ゲームパッドの振動の実装
    function playGamePadVibration(inputType, power, time, effectIndex) {
        for (let index = 0; index < navigator.getGamepads().length; ++index) {
            const gamepad = navigator.getGamepads()[index];
            if (gamepad && gamepad.vibrationActuator) {
                if (time <= 0) {
                    isPlayingGanePadVibration = false;
                    gamepad.vibrationActuator.reset();
                } else {
                    // 規定ms以上を一度に入れると上手く動かないため対策している
                    isPlayingGanePadVibration = true;
                    const maxtime = 5000;
                    let remaining = time;

                    function playGamePadVibrationRaw() {
                        gamepad.vibrationActuator.playEffect("dual-rumble", {
                            startDelay: 0,
                            duration: remaining > maxtime ? maxtime : remaining,
                            weakMagnitude: power / 1000.0,
                            strongMagnitude: power / 1000.0,
                        });
                        remaining -= maxtime;
                        if(remaining > 0){
                            setTimeout(() => {
                                if (isPlayingGanePadVibration) {
                                    playGamePadVibrationRaw();
                                }
                            }, (maxtime - 1));
                        }else{
                            isPlayingGanePadVibration = false;
                        }
                    }
                    playGamePadVibrationRaw();
                }
            }
        }
    }
}

{
    // エラー表記対策
    window.onerror = function (msg, file, line, column, err) {
        const errorMessage = msg + "\n" + file + "[line:" + line + "]\n";

        const settingButton = document.getElementById('settings');
        settingButton.style.backgroundColor = '#88000088';

        const errorText = document.getElementById('bwoditorerror');
        errorText.textContent = errorMessage;
    };
}

{
    if((getDirPadMode() == 'drag' && WoditorGameSettings.useNewPad) || (getDirPadMode() == 'tap' && !WoditorGameSettings.useNewPad)){
        toggleDirPadMode();
        updateDirPadModeButton();
    }
}


;
// lib/system.jsの末尾へ全文追記。scriptタグ不要、SHA等の入力不要、今回検証したエンジン用。
// 外部JSとして新規読込しない。既存HTMLのlib/system.jsがwoditor.jsより前に実行される構成を前提とする。
/* ASOBITA_ENGINE_VOICE_TAIL_PATCH_BEGIN */
(function (global) {
  'use strict';
  const currentScript = typeof document !== 'undefined' ? document.currentScript : null;
  let wasmUrl = '';
  if (currentScript && typeof currentScript.src === 'string' && currentScript.src !== '') {
    try { wasmUrl = new URL('../woditor.wasm', document.currentScript.src).href; } catch (error) { wasmUrl = ''; }
  }
  global.__VOICE_TAIL_WORKAROUND_CONFIG = {
    autoInstall: wasmUrl !== '',
    engineVersion: "0.6.2.2c",
    expectedEngineJsSha256: "16B98BB20AF44000881DE949DD8096AA50FA02F48C96635A3D05A239AB7BB30B",
    expectedEngineWasmSha256: "739EAF162CF690C2F0AD16DC01CC6CBC24817F9DF94160FF2ECECA76ACBA9843",
    actualEngineJsSha256: "16B98BB20AF44000881DE949DD8096AA50FA02F48C96635A3D05A239AB7BB30B",
    actualEngineWasmSha256: "739EAF162CF690C2F0AD16DC01CC6CBC24817F9DF94160FF2ECECA76ACBA9843",
    wasmUrl: wasmUrl
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
/*
 * ブラウザ追加JS用のボイス終端保護試作。
 * 旧WASMや生成済みエンジンを変更せず、終端候補のAL_BUFFERS_PROCESSED照会だけを一時保留する。
 * 固定SHAガードを通らない場合は、フックを有効化しない。
 */
(function (global) {
  'use strict';

  // v5-abi: 固定artifactのSOUNDBUFFER値で終端を確定し、外部source ID表を使わない。
  const VERSION = 'voice-tail-workaround-v5-abi';
  const PROFILE_JS = '16B98BB20AF44000881DE949DD8096AA50FA02F48C96635A3D05A239AB7BB30B';
  const PROFILE_WASM = '739EAF162CF690C2F0AD16DC01CC6CBC24817F9DF94160FF2ECECA76ACBA9843';
  const AL_BUFFERS_PROCESSED = 4118;
  const AL_SOURCE_STATE = 4112;
  const AL_PLAYING = 4114;
  const AL_STOPPED = 4116;
  const STREAM_SOURCE = 4137;
  const LOOP_SOURCE = 4136;
  // 旧DxSoundWebの8192サンプル単位を候補識別にだけ使う。WASM版で未確認なら介入しない。
  const FULL_CHUNK_FRAMES = 8192;
  const MAX_ABI_FRAMES = 1000000000;
  const SOUNDBUFFER_SAMPLE_NUM_REL = 48;
  const SOUNDBUFFER_STATE_REL = 84;
  const SOUNDBUFFER_COMPPOS_REL = 92;
  const SOUNDBUFFER_LOOP_REL = 108;
  const PF_ALBUFFER_BASE_OFFSET = 296;
  const PF_ALBUFFER_COUNT = 6;
  const SOUNDBUFFER_PF_ALSOURCE_FROM_ALBUFFER = 96;
  const BUFFER_GUARD_LIMIT = 32;
  const LOG_LIMIT = 256;

  if (global.__voiceTailWorkaround &&
      global.__voiceTailWorkaround.version === VERSION) return;

  const state = {
    module: null,
    options: null,
    installed: false,
    active: false,
    phase: 'not-installed',
    reason: '',
    hashGuard: null,
    wrappedImports: [],
    sourceStates: new WeakMap(),
    logs: [],
    readyResolve: null,
  };
  state.ready = new Promise((resolve) => { state.readyResolve = resolve; });

  function now() {
    return global.performance && typeof global.performance.now === 'function'
      ? global.performance.now() : Date.now();
  }

  function log(kind, source, extra) {
    if (state.logs.length >= LOG_LIMIT) return;
    state.logs.push(Object.assign({
      kind,
      wall: now(),
      sourceId: source && source.id,
      sourceState: source && source.state,
    }, extra || {}));
  }

  function normalizeHash(value) {
    return typeof value === 'string' ? value.trim().toUpperCase() : '';
  }

  function validSha256(value) {
    return /^[0-9A-F]{64}$/.test(value);
  }

  function getSource(sourceId) {
    const module = state.module;
    return module && module.AL && module.AL.currentCtx && module.AL.currentCtx.sources
      ? module.AL.currentCtx.sources[sourceId] || null : null;
  }

  function nonEmptyBuffers(source) {
    if (!source || !Array.isArray(source.bufQueue)) return [];
    return source.bufQueue.filter((buffer) => buffer && buffer.id && buffer.length > 0)
      .slice(0, BUFFER_GUARD_LIMIT);
  }

  function heap32(module) {
    if (module && module.HEAP32 && module.HEAP32.buffer) return module.HEAP32;
    if (module && module.HEAP8 && module.HEAP8.buffer) return new Int32Array(module.HEAP8.buffer);
    if (module && module.HEAPU8 && module.HEAPU8.buffer) return new Int32Array(module.HEAPU8.buffer);
    return null;
  }

  function readWord(heap, address) {
    if (!heap || !Number.isSafeInteger(address) || address < 0 || address % 4 !== 0 ||
        address + 4 > heap.byteLength) return null;
    return heap[address >> 2];
  }

  // queue呼出しのpointerから、固定artifactのSOUNDBUFFER候補を限定して読む。
  // 候補が複数・範囲外・source不一致なら、別ABIを誤認しないため無効扱いにする。
  function readAbiState(sourceId, pBufferIds) {
    const heap = heap32(state.module);
    const pointer = Number(pBufferIds);
    const numericSourceId = Number(sourceId);
    if (!heap || !Number.isSafeInteger(pointer) || pointer < 0 || pointer % 4 !== 0 ||
        !Number.isSafeInteger(numericSourceId) || numericSourceId <= 0) return null;
    let found = null;
    for (let index = 0; index < PF_ALBUFFER_COUNT; index += 1) {
      const pfOffset = PF_ALBUFFER_BASE_OFFSET + index * 4;
      const base = pointer - pfOffset;
      const sampleNum = readWord(heap, base + SOUNDBUFFER_SAMPLE_NUM_REL);
      const stateValue = readWord(heap, base + SOUNDBUFFER_STATE_REL);
      const compPos = readWord(heap, base + SOUNDBUFFER_COMPPOS_REL);
      const loop = readWord(heap, base + SOUNDBUFFER_LOOP_REL);
      // ALSourceはPF配列の固定末尾(base+392)にあり、queue pointerの要素位置には追随しない。
      const alSource = readWord(heap,
        base + PF_ALBUFFER_BASE_OFFSET + SOUNDBUFFER_PF_ALSOURCE_FROM_ALBUFFER);
      const valid = Number.isInteger(sampleNum) && sampleNum > 0 && sampleNum <= MAX_ABI_FRAMES &&
        stateValue === 1 &&
        Number.isInteger(compPos) && compPos >= 0 && compPos <= sampleNum &&
        Number.isInteger(loop) && (loop === 0 || loop === 1) &&
        alSource === numericSourceId;
      if (!valid) continue;
      if (found) return null;
      found = { index, base, sampleNum, state: stateValue, compPos, loop, alSource };
    }
    return found;
  }

  function queuedFrameCount(source, count) {
    if (!source || !Array.isArray(source.bufQueue) || !Number.isInteger(count) ||
        count <= 0 || count > BUFFER_GUARD_LIMIT || source.bufQueue.length < count) return null;
    const buffers = source.bufQueue.slice(source.bufQueue.length - count);
    let total = 0;
    for (const buffer of buffers) {
      if (!buffer || !buffer.id || !Number.isSafeInteger(buffer.length) || buffer.length <= 0) {
        return null;
      }
      total += buffer.length;
      if (total > MAX_ABI_FRAMES) return null;
    }
    return total;
  }

  // SOUNDBUFFERのCompPos==SampleNumを、同じ非loop sourceで観測した場合だけEOF候補にする。
  function exactEndIsKnown(source, value, abi, queueFrames) {
    if (!source || !value || !abi || source.looping || source.type === LOOP_SOURCE ||
        source.type !== STREAM_SOURCE || abi.loop !== 0 || value.abiInvalid) {
      return !!(value && value.exactEndKnown);
    }
    if (queueFrames === null) {
      value.abiInvalid = true;
      value.exactEndKnown = false;
      return false;
    }
    if (value.abiSampleNum === null) value.abiSampleNum = abi.sampleNum;
    if (value.abiBase === null) value.abiBase = abi.base;
    const expectedCompPos = value.abiLastCompPos === null
      ? queueFrames : value.abiLastCompPos + queueFrames;
    if (value.abiSampleNum !== abi.sampleNum || value.abiBase !== abi.base ||
        abi.compPos !== expectedCompPos || abi.compPos < 0 || abi.compPos > abi.sampleNum) {
      value.abiInvalid = true;
      value.exactEndKnown = false;
      return false;
    }
    value.abiObserved = true;
    value.abiLastCompPos = abi.compPos;
    if (abi.compPos === abi.sampleNum) {
      value.knownTotalFrames = abi.sampleNum;
      value.exactEndKnown = true;
    }
    return value.exactEndKnown;
  }

  function newSourceState(source) {
    const value = {
      source,
      queueCalls: 0,
      firstQueueCount: null,
      candidate: false,
      holding: false,
      holdCount: 0,
      capCount: 0,
      explicitStop: false,
      naturalTerminal: false,
      knownTotalFrames: null,
      exactEndKnown: false,
      abiObserved: false,
      abiInvalid: false,
      abiBase: null,
      abiSampleNum: null,
      abiLastCompPos: null,
    };
    state.sourceStates.set(source, value);
    return value;
  }

  function sourceState(source) {
    if (!source) return null;
    return state.sourceStates.get(source) || newSourceState(source);
  }

  function observeQueue(source, count, wasEmpty, abi) {
    if (!source) return;
    const value = sourceState(source);
    // 全bufferをunqueueしてplaceholderだけになった後の再利用を新世代として扱う。
    if (value.queueCalls > 0 && wasEmpty) {
      value.queueCalls = 0;
      value.firstQueueCount = null;
      value.candidate = false;
      value.holding = false;
      value.capCount = 0;
      value.explicitStop = false;
      value.naturalTerminal = false;
      value.knownTotalFrames = null;
      value.exactEndKnown = false;
      value.abiObserved = false;
      value.abiInvalid = false;
      value.abiBase = null;
      value.abiSampleNum = null;
      value.abiLastCompPos = null;
    }
    value.queueCalls += 1;
    const queueCount = Number(count);
    if (value.firstQueueCount === null && Number.isFinite(queueCount) && queueCount > 0) {
      value.firstQueueCount = queueCount;
    }
    exactEndIsKnown(source, value, abi, queuedFrameCount(source, queueCount));
    value.candidate = value.abiObserved && value.exactEndKnown && !value.abiInvalid;
    if (abi && value.exactEndKnown && value.queueCalls <= 3) {
      log('abi-eof-observed', source, {
        targetIndex: abi.index,
        sampleNum: abi.sampleNum,
        compPos: abi.compPos,
        loop: abi.loop,
      });
    }
  }

  function candidateState(source) {
    const value = sourceState(source);
    if (!value || source.looping || source.type === LOOP_SOURCE ||
        source.type !== STREAM_SOURCE || source.state !== AL_PLAYING) return null;
    value.candidate = value.candidate && value.abiObserved && value.exactEndKnown && !value.abiInvalid;
    return value.candidate ? value : null;
  }

  function wrapImports(imports) {
    if (!imports || typeof imports !== 'object') return [];
    const wrapped = [];

    if (typeof imports.alSourceQueueBuffers === 'function') {
      const original = imports.alSourceQueueBuffers;
      imports.alSourceQueueBuffers = function voiceTailQueueBuffers(sourceId, count) {
        const sourceBefore = getSource(sourceId);
        const wasEmpty = !!sourceBefore && nonEmptyBuffers(sourceBefore).length === 0;
        const result = original.apply(this, arguments);
        observeQueue(getSource(sourceId), count, wasEmpty,
          readAbiState(sourceId, arguments[2]));
        return result;
      };
      wrapped.push('alSourceQueueBuffers');
    }

    for (const name of ['alSourceStop', 'alSourcePause', 'alSourcePlay']) {
      if (typeof imports[name] !== 'function') continue;
      const original = imports[name];
      imports[name] = function voiceTailSourceStateChange(sourceId) {
        const source = getSource(sourceId);
        if (source) {
          const value = sourceState(source);
          if (name === 'alSourcePlay') {
            value.explicitStop = false;
            value.naturalTerminal = false;
            value.holding = false;
          } else {
            value.explicitStop = name === 'alSourceStop';
            value.naturalTerminal = false;
            value.holding = false;
          }
        }
        return original.apply(this, arguments);
      };
      wrapped.push(name);
    }

    return wrapped;
  }

  // AL公開メソッドの戻り値だけを包み、WASMの出力メモリを直接書き換えない。
  function wrapSourceParam() {
    const al = state.module && state.module.AL;
    if (!al || typeof al.getSourceParam !== 'function') return false;
    const original = al.getSourceParam;
    if (original.__voiceTailWorkaroundVersion === VERSION) return true;
    const wrapped = function voiceTailGetSourceParam(funcname, sourceId, parameter) {
      const result = original.apply(this, arguments);
      const source = getSource(sourceId);
      const allState = source ? sourceState(source) : null;
      if (parameter === AL_SOURCE_STATE && source && allState &&
          source.state === AL_STOPPED && !allState.explicitStop &&
          (allState.holding || allState.naturalTerminal || allState.candidate)) {
        // 自然終端後だけ、C++のEND後再生分岐にSTOPPEDを渡さない。
        const firstNaturalTerminalQuery = !allState.naturalTerminal;
        allState.naturalTerminal = true;
        if (firstNaturalTerminalQuery) {
          log('suppress-natural-replay', source, {
            queueLength: source.bufQueue && source.bufQueue.length,
            audioQueueLength: source.audioQueue && source.audioQueue.length,
          });
        }
        return AL_PLAYING;
      }
      if (parameter !== AL_BUFFERS_PROCESSED) return result;

      const actual = Number(result);
      const exactValue = candidateState(source);
      // 最終partialを投入する前に複数件を返すと、C++の同一for内でEOFを跨いでしまう。
      // 既知の6個構成にも1件ずつ返し、次の照会で新しい末尾を判定する機会を確保する。
      if (source && allState && source.type === STREAM_SOURCE && !source.looping &&
          source.state === AL_PLAYING && allState.firstQueueCount === 6 &&
          !(exactValue && exactValue.exactEndKnown) &&
          Number.isInteger(actual) && actual > 1 &&
          Array.isArray(source.bufQueue) && source.bufQueue.length > 0 && source.bufQueue.length <= 6 &&
          source.bufQueue.every((buffer) => buffer && buffer.id && buffer.length === FULL_CHUNK_FRAMES)) {
        log('cap-before-tail-detection', source, { actualProcessed: actual });
        return 1;
      }
      const value = exactValue;
      if (!source || !value || !Number.isFinite(actual)) return result;
      if (source.state === AL_PLAYING && Array.isArray(source.bufQueue) &&
          actual > 0 && actual < source.bufQueue.length) {
        // 予約済みWebAudio nodeが一時的に空でも、未消化AL bufferがあれば末尾を保護する。
        value.holding = true;
        value.holdCount += 1;
        if (value.holdCount === 1) {
          log('hold-processed', source, {
            actualProcessed: actual,
            queueLength: source.bufQueue && source.bufQueue.length,
            audioQueueLength: source.audioQueue.length,
            firstQueueCount: value.firstQueueCount,
            exactEndKnown: value.exactEndKnown,
            knownTotalFrames: value.knownTotalFrames,
          });
        }
        return 0;
      }
      if (source.state === AL_PLAYING && actual > 1 &&
          (!source.audioQueue || source.audioQueue.length === 0)) {
        // 同一C++ループで複数unqueueされるとEOF判定が連続するため、再開時も1件に制限する。
        value.holding = true;
        value.capCount += 1;
        if (value.capCount === 1) {
          log('release-processed-cap', source, { actualProcessed: actual });
        }
        return 1;
      }
      // 非PLAYING時もholdingを直ちに消さない。次のAL_SOURCE_STATE照会で
      // 自然終端後の再発音分岐を抑止できるよう、明示操作はimport側で解除する。
      return result;
    };
    Object.defineProperty(wrapped, '__voiceTailWorkaroundVersion', { value: VERSION });
    al.getSourceParam = wrapped;
    state.wrappedImports.push('Module.AL.getSourceParam');
    return true;
  }

  function validateHashes(module, options) {
    const expectedJs = normalizeHash(options.expectedEngineJsSha256);
    const expectedWasm = normalizeHash(options.expectedEngineWasmSha256);
    const actualJs = normalizeHash(options.actualEngineJsSha256 || module.__voiceTailEngineJsSha256);
    const actualWasm = normalizeHash(options.actualEngineWasmSha256 || module.__voiceTailEngineWasmSha256);
    const result = { expectedJs, expectedWasm, actualJs, actualWasm, ok: false, reason: '' };
    if (!validSha256(expectedJs) || !validSha256(expectedWasm)) {
      result.reason = 'expectedEngineJsSha256/expectedEngineWasmSha256が未設定または不正';
    } else if (!validSha256(actualJs) || !validSha256(actualWasm)) {
      result.reason = 'actualEngineJsSha256/actualEngineWasmSha256が未設定または不正';
    } else if (expectedJs !== PROFILE_JS || expectedWasm !== PROFILE_WASM ||
        actualJs !== PROFILE_JS || actualWasm !== PROFILE_WASM ||
        expectedJs !== actualJs || expectedWasm !== actualWasm) {
      result.reason = '固定SHAガード不一致';
    } else {
      result.ok = true;
      result.reason = '固定SHA一致';
    }
    return result;
  }

  function defaultInstantiate(module, imports, receiveInstance) {
    const wasmUrl = state.options.wasmUrl ||
      (typeof module.locateFile === 'function' ? module.locateFile('woditor.wasm', '') : 'woditor.wasm');
    return fetch(wasmUrl, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error('woditor.wasmを取得できません。HTMLのwasmUrlを確認してください。');
        if (typeof WebAssembly.instantiateStreaming !== 'function') {
          return response.arrayBuffer().then((bytes) => WebAssembly.instantiate(bytes, imports));
        }
        const fallbackResponse = response.clone();
        return WebAssembly.instantiateStreaming(response, imports).catch(() =>
          fallbackResponse.arrayBuffer().then((bytes) => WebAssembly.instantiate(bytes, imports)));
      })
      .then((result) => { receiveInstance(result.instance); return result.instance; });
  }

  function install(module, options) {
    if (state.installed) return api.status();
    state.module = module || global.Module || (global.Module = {});
    state.options = Object.assign({ wasmUrl: 'woditor.wasm' }, options || {});
    state.hashGuard = validateHashes(state.module, state.options);
    if (!state.hashGuard.ok) {
      state.phase = 'blocked';
      state.reason = state.hashGuard.reason;
      state.readyResolve(false);
      return api.status();
    }

    const originalFactory = state.module.instantiateWasm;
    state.module.instantiateWasm = function voiceTailInstantiateWasm(imports, receiveInstance) {
      const namespaces = [];
      for (const name of ['env', 'wasi_snapshot_preview1']) {
        const namespace = imports && imports[name];
        if (namespace && !namespaces.includes(namespace)) namespaces.push(namespace);
      }
      const wrapped = [];
      for (const namespace of namespaces) wrapped.push(...wrapImports(namespace));
      state.wrappedImports = Array.from(new Set(wrapped));
      const hasGetSourcei = namespaces.some((namespace) =>
        typeof namespace.alGetSourcei === 'function');
      if (!hasGetSourcei) {
        state.phase = 'blocked';
        state.reason = 'alGetSourcei importが見つからないため変更を適用しません';
        state.readyResolve(false);
        return originalFactory
          ? originalFactory.call(this, imports, receiveInstance)
          : defaultInstantiate(state.module, imports, receiveInstance);
      }
      const finish = (instance) => {
        const active = wrapSourceParam();
        if (active) {
          state.installed = true;
          state.active = true;
          state.phase = 'ready';
          state.reason = 'AL_BUFFERS_PROCESSED監視を有効化';
          state.readyResolve(true);
        } else {
          state.phase = 'blocked';
          state.reason = 'Module.AL.getSourceParamが見つからないため変更を適用しません';
          state.readyResolve(false);
        }
        return receiveInstance(instance);
      };
      return originalFactory
        ? originalFactory.call(this, imports, finish)
        : defaultInstantiate(state.module, imports, finish);
    };
    // Module.instantiateWasmが呼ばれるまで、まだWASMへは介入していない。
    state.installed = true;
    state.phase = 'waiting-for-wasm';
    state.reason = '固定SHA一致。WASM初期化待ち';
    return api.status();
  }

  const api = {
    version: VERSION,
    install,
    status() {
      return {
        version: VERSION,
        installed: state.installed,
        active: state.active,
        phase: state.phase,
        reason: state.reason,
        hashGuard: state.hashGuard,
        wrappedImports: state.wrappedImports.slice(),
        logCount: state.logs.length,
      };
    },
    whenReady() { return state.ready; },
    getLogs() { return state.logs.slice(); },
  };
  global.__voiceTailWorkaround = api;

  const config = global.__VOICE_TAIL_WORKAROUND_CONFIG;
  if (config && config.autoInstall !== false) install(global.Module || (global.Module = {}), config);
})(typeof globalThis !== 'undefined' ? globalThis : window);
/* ASOBITA_ENGINE_VOICE_TAIL_PATCH_END */