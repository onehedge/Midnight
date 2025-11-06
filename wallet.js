// ==UserScript==
// @name        ScavengerMine - 自动连接钱包
// @namespace   onehedge
// @version     1.0.7.3
// @description Automatically connects the first installed wallet and moves to the next step on the /wallet page, then forces a reload to trigger the mine script.
// @match       https://sm.midnight.gd/wizard/wallet
// @run-at      document-idle
// @grant       none
// @noframes
// @updateURL   https://raw.githubusercontent.com/onehedge/Midnight/refs/heads/main/wallet.js
// @downloadURL https://raw.githubusercontent.com/onehedge/Midnight/refs/heads/main/wallet.js
// ==/UserScript==

(function () {
    'use strict';

    const TAG = "[ScavengerMineWalletPage]";
    const HEARTBEAT_MS = 10 * 1000;      // 10 seconds heartbeat
    const BOOT_GRACE_MS = 30 * 1000;     // 30 seconds wait after load
    const RELOAD_GUARD_MS = 60 * 1000;  // 1 minute reload guard
    // 🚩 新增：跳转到 /mine 后的刷新延迟时间
    const MINE_RELOAD_DELAY_MS = 10 * 1000;

    let lastReloadAt = 0;
    let heartbeatCount = 0;
    let initialRunComplete = false;
    let heartbeatInterval = null; // 🚩 新增：用于存储心跳计时器句柄

    // --- 辅助函数 (保持不变) ---

    /**
     * 查找包含特定文本的按钮（不区分大小写）。
     */
    function findBtn(txt) {
        return Array.from(document.querySelectorAll("button"))
            .find(b => (b.textContent || "").toLowerCase().includes(txt.toLowerCase()));
    }

    /**
     * 安全地刷新页面，并使用时间守卫防止频繁刷新。
     */
    function safeReload(reason) {
        const now = Date.now();
        if (now - lastReloadAt < RELOAD_GUARD_MS) {
            console.log(`${TAG} ⏳ Reload guard active — skip reload.`);
            return;
        }
        console.log(`${TAG} 🔄 Reloading — ${reason}`);
        lastReloadAt = now;
        location.reload();
    }

    /**
     * 核心检测函数：寻找 INSTALLED 钱包按钮
     */
    function findInstalledWalletButton() {
        const allElements = document.querySelectorAll('*');
        let installedTag = null;

        for (const el of allElements) {
            if ((el.textContent || '').trim().toUpperCase() === 'INSTALLED') {
                installedTag = el;
                break;
            }
        }

        if (installedTag) {
            const walletButton = installedTag.closest('button[type="button"]');

            if (walletButton) {
                const walletNameEl = walletButton.querySelector('div.flex-1');
                const walletName = walletNameEl ? walletNameEl.textContent.trim() : 'Unknown';
                console.log(`${TAG} ✅ 钱包选择器: 找到已安装的钱包按钮: ${walletName}`);
                return walletButton;
            }
        }

        const noWalletWarning = document.querySelector('div.flex.gap-2.p-4.rounded-sm.border');
        if (noWalletWarning && noWalletWarning.textContent.includes('No supported Cardano wallets')) {
            console.log(`${TAG} ⚠️ 钱包选择器: 检测到没有已安装钱包的警告。`);
            return null;
        }

        console.log(`${TAG} ℹ️ 钱包选择器: 未找到已安装钱包按钮。`);
        return null;
    }


    // --- 逻辑1: 首次加载逻辑 (保持不变) ---

    async function initialLoadLogic() {
        if (initialRunComplete) return;

        console.log(`${TAG} ⏳ 页面加载成功开始 ${BOOT_GRACE_MS / 1000} 秒计时，等待元素加载...`);
        await new Promise(r => setTimeout(r, BOOT_GRACE_MS));
        console.log(`${TAG} ⏳ 30 秒延迟结束，开始检查状态。`);

        const walletButton = findInstalledWalletButton();
        const continueBtn = findBtn("Continue");
        const nextBtn = findBtn("Next");

        if (nextBtn) {
            console.log(`${TAG} ℹ️ 首次加载：Next 按钮可见。交由心跳处理。`);
            initialRunComplete = true;
            return;
        }

        if (!walletButton) {
            console.log(`${TAG} ⚠️ 首次加载: 没有找到已安装的钱包。执行安全刷新。`);
            safeReload("Initial load: No installed wallet found");
        } else {
            const walletName = walletButton.querySelector('div.flex-1').textContent.trim();
            console.log(`${TAG} ✅ 首次加载: 找到已安装的钱包 (${walletName})。尝试选择...`);

            walletButton.click();
            console.log(`${TAG} 🖱️ 模拟点击钱包选择按钮: ${walletName}`);

            await new Promise(r => setTimeout(r, 500));

            const updatedContinueBtn = findBtn("Continue");

            if (updatedContinueBtn && !updatedContinueBtn.disabled) {
                console.log(`${TAG} 🖱️ 模拟点击 'Continue' 按钮。`);
                updatedContinueBtn.click();
            } else {
                console.log(`${TAG} 🚫 'Continue' 按钮不可点击或未找到。交由心跳处理。`);
            }
        }

        initialRunComplete = true;
    }

    // --- 逻辑2: 监听逻辑 (心跳 - 已修改) ---

    function heartbeat() {
        heartbeatCount++;
        const currentPath = window.location.pathname;

        // 🚩 核心修改 A: 检测是否已跳转到 /mine 页面
        if (currentPath.endsWith('/wizard/mine')) {
            console.log(`${TAG} 🚀 心跳检测: 发现 URL 已跳转到 /mine 页面！停止心跳。`);
            clearInterval(heartbeatInterval);

            // 延迟 10 秒后执行强制刷新
            console.log(`${TAG} ⏳ 延迟 ${MINE_RELOAD_DELAY_MS / 1000} 秒后执行强制刷新，以触发挖矿脚本...`);
            setTimeout(() => {
                console.log(`${TAG} 🔄 强制刷新：触发挖矿脚本加载。`);
                location.reload();
            }, MINE_RELOAD_DELAY_MS);
            return;
        }

        // 🚩 核心修改 B: 如果 URL 变更到其他非 /wallet 页面（例如条款或中间页），则停止心跳。
        if (!currentPath.endsWith('/wizard/wallet')) {
            console.log(`${TAG} ⛔ 心跳检测：URL 已变更到其他步骤，停止心跳。`);
            clearInterval(heartbeatInterval);
            return;
        }

        // 只有在 /wallet 页面且未跳转时才执行 Next 按钮逻辑
        console.log(`${TAG} 💖 开始第 ${heartbeatCount} 次心跳 (${HEARTBEAT_MS / 1000} 秒周期)...`);

        const nextBtn = findBtn("Next");

        if (nextBtn && !nextBtn.disabled) {
            console.log(`${TAG} 🖱️ 发现 'Next' 按钮。模拟点击，继续到下一个步骤。`);
            nextBtn.click();
        } else if (nextBtn && nextBtn.disabled) {
            console.log(`${TAG} ℹ️ 发现 'Next' 按钮，但处于禁用状态。等待下次心跳。`);
        } else {
            console.log(`${TAG} ℹ️ 没有发现 'Next' 按钮。等待下次心跳。`);
        }
    }

    // --- 启动脚本 ---

    // 运行首次加载逻辑
    setTimeout(initialLoadLogic, 0);

    // 启动心跳监听 (存储句柄)
    setTimeout(() => {
        console.log(`${TAG} ⏳ 启动 ${HEARTBEAT_MS / 1000} 秒心跳计时器...`);
        // 存储句柄
        heartbeatInterval = setInterval(heartbeat, HEARTBEAT_MS);
    }, BOOT_GRACE_MS);

})();
