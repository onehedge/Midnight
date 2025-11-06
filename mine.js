// ==UserScript==
// @name        ScavengerMine - 自动挖矿
// @namespace   onehedge
// @version     3.1.1
// @description Automatically maintains ScavengerMine uptime on the /mine page by starting the session and reloading if the next challenge time is zero.
// @match       https://sm.midnight.gd/wizard/mine
// @run-at      document-idle
// @grant       none
// @noframes
// @updateURL   [稍后在此处粘贴 Gist 的原始文件链接]
// @downloadURL [稍后在此处粘贴 Gist 的原始文件链接]
// ==/UserScript==

(function () {
    'use strict';

    const TAG = "[ScavengerMineMinePage]";
    const HEARTBEAT_MS = 10 * 60 * 1000; // 10 minutes
    const BOOT_GRACE_MS = 5000;         // 5 seconds wait after load
    const START_WAIT_LOOPS = 16;        // ~8 seconds total wait for start confirmation
    const START_WAIT_STEPMS = 500;
    const RELOAD_GUARD_MS = 60 * 1000;  // 1 minute reload guard

    let lastReloadAt = 0;
    let heartbeatCount = 0;

    // --- 辅助函数 (保持不变) ---

    /**
     * 查找包含特定文本的按钮（不区分大小写）。
     * @param {string} txt 按钮文本的一部分。
     * @returns {HTMLButtonElement | undefined} 找到的按钮元素。
     */
    function findBtn(txt) {
        return Array.from(document.querySelectorAll("button"))
            .find(b => (b.textContent || "").toLowerCase().includes(txt.toLowerCase()));
    }

    /**
     * 检查 "Next challenge in:" 的时间是否为 "00:00:00:00"。
     * @returns {{isZero: boolean, timeText: string}} 包含状态和原始时间文本的对象。
     */
    function checkNextChallengeTime() {
        // 精确匹配 "Next challenge in:" 后面的时间 span
        const span = document.querySelector('div.flex-grow.flex.md\\:justify-end.self-center.text-text-text-secondary span.text-text-text-primary');
        const timeText = span ? (span.textContent || '').trim() : '00:00:00:00'; // 找不到元素时默认视为零

        // 检查时间是否为全零 (00:00:00:00) 或无法解析/缺失 (例如 --:--:--:--)
        const isZero = timeText.startsWith('00:00:00:00') || !span || timeText.startsWith('--');

        return { isZero, timeText };
    }


    /**
     * 检查挖矿会话是否已开始。
     * @returns {boolean} true 如果会话已开始 ("Stop session" 按钮可见)，否则 false。
     */
    function isSessionStarted() {
        const stopBtn = findBtn("Stop session");
        return !!stopBtn; // 仅检查 Stop session 按钮是否存在
    }

    /**
     * 尝试点击 "Start session" 按钮，并等待确认。
     * @returns {Promise<boolean>} true 如果成功开始，否则 false。
     */
    async function tryStartSession() {
        const startBtn = findBtn("Start session");
        if (!startBtn || startBtn.disabled) return false;

        console.log(`${TAG} 🖱️ 模拟点击 'Start session' 按钮...`);
        startBtn.click();

        for (let i = 0; i < START_WAIT_LOOPS; i++) {
            await new Promise(r => setTimeout(r, START_WAIT_STEPMS));
            if (isSessionStarted()) {
                console.log(`${TAG} ✅ Session started. 按钮状态: 已开始 (Stop session)`);
                return true;
            }
        }

        console.log(`${TAG} ⚠️ Start not confirmed after timeout. 按钮状态: ${isSessionStarted() ? '已开始' : '未开始'}`);
        return isSessionStarted();
    }


    /**
     * 安全地刷新页面，并使用时间守卫防止频繁刷新。
     * @param {string} reason 刷新原因。
     */
    function safeReload(reason) {
        const now = Date.now();
        if (now - lastReloadAt < RELOAD_GUARD_MS) {
            console.log(`${TAG} ⏳ Reload guard active (${Math.ceil((RELOAD_GUARD_MS - (now - lastReloadAt)) / 1000)}s remaining) — skip reload.`);
            return;
        }
        console.log(`${TAG} 🔄 Reloading — ${reason} @ ${new Date().toLocaleTimeString()}`);
        lastReloadAt = now;
        location.reload();
    }


    // --- 逻辑1: 首次加载逻辑 (已修改) ---

    async function initialLoadLogic() {
        console.log(`${TAG} ⏳ 页面加载成功开始 ${BOOT_GRACE_MS / 1000} 秒计时...`);
        await new Promise(r => setTimeout(r, BOOT_GRACE_MS));

        const challenge = checkNextChallengeTime();
        const started = isSessionStarted();

        console.log(`${TAG} ⏱️ 首次加载 - 下次挑战时间状态: ${challenge.isZero ? '零' : '非零'} (${challenge.timeText})`);
        console.log(`${TAG} 🟢 首次加载 - 开始按钮状态: ${started ? '已开始 (Stop session)' : '未开始 (Start session)'}`);

        // 4. 当下次挑战时间为"非零"，且开始按钮状态为"未开始"，模拟点击开始按钮，直到开始按钮状态变为"已开始".
        if (!challenge.isZero && !started) {
            console.log(`${TAG} 🚀 条件满足: 下次挑战时间非零且未开始。尝试启动会话...`);
            await tryStartSession();
        } else if (challenge.isZero) {
            // **核心修改：如果首次加载 Next challenge time 为零，现在不做任何操作。**
            console.log(`${TAG} ℹ️ 首次加载 Next challenge time 为零。不立即刷新，将由 ${HEARTBEAT_MS / 60000} 分钟心跳周期处理。`);
        }
    }

    // --- 逻辑2: 监听逻辑 (心跳) (保持不变) ---

    async function heartbeat() {
        heartbeatCount++;
        console.log(`${TAG} 💖 开始第 ${heartbeatCount} 次心跳 (${HEARTBEAT_MS / 60000} 分钟周期)...`);

        const challenge = checkNextChallengeTime();
        const started = isSessionStarted();

        console.log(`${TAG} ⏱️ 心跳检查 - 下次挑战时间状态: ${challenge.isZero ? '零' : '非零'} (${challenge.timeText})`);
        console.log(`${TAG} 🟢 心跳检查 - 开始按钮状态: ${started ? '已开始' : '未开始'}`);


        // 2. 如果下次挑战时间为零，则刷新网页。
        if (challenge.isZero) {
            console.log(`${TAG} 🚨 下次挑战时间为零。会话可能已停止或卡住。执行安全刷新。`);
            safeReload("Heartbeat: Next challenge in is zero");
            return; // 刷新后结束当前心跳
        }

        // 额外检查：如果非零但未启动，也尝试启动一下
        if (!started) {
            console.log(`${TAG} ⚠️ 会话未启动。下次挑战时间非零，尝试启动会话...`);
            await tryStartSession();
        }
    }

    // --- 启动脚本 ---

    // 运行首次加载逻辑
    initialLoadLogic();

    // 启动心跳监听（在首次加载逻辑的 BOOT_GRACE_MS 之后开始计时）
    setTimeout(() => {
        // 第一次心跳在 BOOT_GRACE_MS 之后开始计时，然后每 10 分钟运行一次
        console.log(`${TAG} ⏳ 启动 ${HEARTBEAT_MS / 60000} 分钟心跳计时器...`);
        setInterval(heartbeat, HEARTBEAT_MS);
    }, BOOT_GRACE_MS);

})();
