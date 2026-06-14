/**
 * JRSY App Store Plugin
 * 黑白极简INS风 — Firebase 云端版
 * 去掉三张介绍图功能 / 图标压缩 / 搜索 / 每次刷新 / 排行榜前15
 */

(function () {

    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyA9xeW6iFftlz1r-EnDbskU8-5oGHCOHSo",
        authDomain: "jrsy-5eabc.firebaseapp.com",
        projectId: "jrsy-5eabc",
        storageBucket: "jrsy-5eabc.firebasestorage.app",
        messagingSenderId: "531967624404",
        appId: "1:531967624404:web:2399bcebe5bc02ddbd6741"
    };

    let _db   = null;
    let _auth = null;
    let _currentUser = null;

    function _loadScript(src) {
        return new Promise((resolve) => {
            if (document.querySelector(`script[src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = resolve;
            document.head.appendChild(s);
        });
    }

    async function _initFirebase() {
        if (_db) return;
        await _loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
        await _loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js');
        await _loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js');
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        _auth = firebase.auth();
        _db   = firebase.firestore();
        if (!_auth.currentUser) await _auth.signInAnonymously();
        _currentUser = _auth.currentUser;
        if (!_currentUser) {
            await new Promise((resolve) => {
                const unsub = _auth.onAuthStateChanged(user => {
                    unsub(); _currentUser = user; resolve();
                });
            });
        }
    }

    const CloudDB = {
        async getApps(orderBy = 'created_at', limitN = 50) {
            await _initFirebase();
            const snap = await _db.collection('apps').orderBy(orderBy, 'desc').limit(limitN).get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },
        async searchApps(keyword) {
            await _initFirebase();
            const snap = await _db.collection('apps').orderBy('created_at', 'desc').limit(200).get();
            const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const kw   = keyword.toLowerCase();
            return all.filter(a =>
                (a.name  || '').toLowerCase().includes(kw) ||
                (a.desc  || '').toLowerCase().includes(kw) ||
                (a.author|| '').toLowerCase().includes(kw)
            );
        },
        async publishApp(appData) {
            await _initFirebase();
            const doc = {
                ...appData,
                authorUid: _currentUser.uid,
                downloads: 0,
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            };
            const ref = await _db.collection('apps').add(doc);
            return { id: ref.id, ...doc };
        },
        async incrementDownload(appId) {
            await _initFirebase();
            await _db.collection('apps').doc(appId).update({
                downloads: firebase.firestore.FieldValue.increment(1)
            });
        },
        async getApp(appId) {
            await _initFirebase();
            const doc = await _db.collection('apps').doc(appId).get();
            if (!doc.exists) throw new Error('应用不存在');
            return { id: doc.id, ...doc.data() };
        },
        async deleteApp(appId) {
            await _initFirebase();
            await _db.collection('apps').doc(appId).delete();
        }
    };

    const AS_MYAPPS_KEY  = 'JRSY_APPSTORE_DOWNLOADED';
    const AS_PROFILE_KEY = 'JRSY_APPSTORE_PROFILE';
    let myApps    = JSON.parse(localStorage.getItem(AS_MYAPPS_KEY))  || [];
    let asProfile = JSON.parse(localStorage.getItem(AS_PROFILE_KEY)) || { name: '独立开发者', avatar: '' };

    function asSaveLocal() {
        localStorage.setItem(AS_MYAPPS_KEY,  JSON.stringify(myApps));
        localStorage.setItem(AS_PROFILE_KEY, JSON.stringify(asProfile));
    }

    // ==========================================
    // 样式
    // ==========================================
    const style = document.createElement('style');
    style.textContent = `
        #appStoreScreen {
            background-color: #ffffff; color: #000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden; display: none; flex-direction: column; height: 100%;
        }
        #appStoreScreen.active { display: flex; }
        .as-nav-bar {
            height: calc(50px + 30px + env(safe-area-inset-top, 0px));
            padding-top: calc(30px + env(safe-area-inset-top, 0px));
            display: flex; align-items: center; justify-content: space-between;
            padding-left: 15px; padding-right: 15px;
            background: #fff; border-bottom: 1px solid #f0f0f0;
            z-index: 10; box-sizing: border-box; flex-shrink: 0;
        }
        .as-nav-title { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
        .as-nav-btn { background: none; border: none; font-size: 24px; color: #000; cursor: pointer; padding: 0; }
        .as-content {
            flex: 1; overflow-y: auto;
            padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px) + 10px);
            background: #fafafa;
        }
        .as-view { display: none; }
        .as-view.active { display: block; }
        .as-tab-bar {
            position: absolute; bottom: 0; left: 0; right: 0;
            height: calc(60px + env(safe-area-inset-bottom, 0px));
            padding-bottom: env(safe-area-inset-bottom, 0px);
            background: rgba(255,255,255,0.97);
            backdrop-filter: blur(12px);
            border-top: 1px solid #eee;
            display: flex; justify-content: space-around; align-items: flex-start;
            z-index: 100; box-sizing: border-box;
        }
        .as-tab {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; color: #ccc; font-size: 10px;
            cursor: pointer; transition: all 0.2s; height: 60px; flex: 1;
        }
        .as-tab i { font-size: 24px; margin-bottom: 2px; }
        .as-tab.active { color: #000; font-weight: bold; }

        .as-search-bar {
            padding: 12px 15px; background: #fff;
            border-bottom: 1px solid #f0f0f0; display: flex; gap: 10px; align-items: center;
        }
        .as-search-input {
            flex: 1; padding: 9px 14px; background: #f5f5f5;
            border: none; border-radius: 20px; font-size: 14px; outline: none; color: #000;
        }
        .as-search-btn {
            padding: 9px 16px; background: #000; color: #fff;
            border: none; border-radius: 20px; font-size: 14px;
            font-weight: bold; cursor: pointer; white-space: nowrap;
        }
        .as-search-clear {
            padding: 9px 12px; background: #f0f0f0; color: #666;
            border: none; border-radius: 20px; font-size: 13px;
            cursor: pointer; display: none; white-space: nowrap;
        }

        .as-card { background: #fff; border-radius: 16px; padding: 20px; margin: 15px; box-shadow: 0 2px 10px rgba(0,0,0,0.02); border: 1px solid #f5f5f5; }
        .as-btn-black { background: #000; color: #fff; border: none; border-radius: 8px; padding: 12px; font-size: 15px; font-weight: bold; width: 100%; cursor: pointer; display: block; box-sizing: border-box; }
        .as-btn-black:active { transform: scale(0.98); }
        .as-btn-black:disabled { background: #999; cursor: not-allowed; }
        .as-btn-outline { background: transparent; color: #000; border: 1px solid #000; border-radius: 8px; padding: 12px; font-size: 15px; font-weight: bold; width: 100%; cursor: pointer; display: block; margin-top: 10px; box-sizing: border-box; }
        .as-btn-danger { background: transparent; color: #ff3b30; border: 1px solid #ff3b30; border-radius: 8px; padding: 12px; font-size: 15px; font-weight: bold; width: 100%; cursor: pointer; display: block; margin-top: 10px; box-sizing: border-box; }

        .as-app-item { display: flex; align-items: center; gap: 15px; padding: 15px; background: #fff; border-bottom: 1px solid #f9f9f9; cursor: pointer; }
        .as-app-item:active { background: #f5f5f5; }
        .as-app-icon { width: 60px; height: 60px; border-radius: 14px; background: #eee; object-fit: cover; border: 1px solid #f0f0f0; flex-shrink: 0; }
        .as-app-info { flex: 1; overflow: hidden; }
        .as-app-title { font-size: 16px; font-weight: 800; color: #000; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .as-app-desc { font-size: 12px; color: #888; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .as-app-get-btn { background: #f0f0f0; color: #000; font-weight: bold; font-size: 13px; padding: 6px 16px; border-radius: 20px; border: none; flex-shrink: 0; cursor: pointer; }

        .as-rank-num { font-size: 24px; font-weight: 900; font-style: italic; width: 30px; text-align: center; color: #ccc; flex-shrink: 0; }
        .as-rank-1 { color: #000; } .as-rank-2 { color: #333; } .as-rank-3 { color: #666; }

        .as-profile-header { display: flex; align-items: center; gap: 20px; padding: 30px 20px; background: #fff; border-bottom: 1px solid #f5f5f5; }
        .as-profile-avatar-wrap { position: relative; width: 70px; height: 70px; flex-shrink: 0; cursor: pointer; }
        .as-profile-avatar { width: 70px; height: 70px; border-radius: 50%; background: #eee; object-fit: cover; border: 2px solid #000; display: block; }
        .as-avatar-badge { position: absolute; bottom: 0; right: 0; width: 22px; height: 22px; background: #000; border-radius: 50%; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; }
        .as-avatar-badge i { font-size: 12px; color: #fff; }
        .as-profile-name { font-size: 22px; font-weight: 800; }

        .as-myapps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; padding: 20px; }
        .as-myapps-item { display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; }
        .as-myapps-icon { width: 56px; height: 56px; border-radius: 12px; border: 1px solid #eee; object-fit: cover; background: #eee; }
        .as-myapps-name { font-size: 11px; font-weight: 600; color: #333; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .as-input { width: 100%; padding: 12px 15px; background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; font-size: 14px; margin-bottom: 15px; outline: none; box-sizing: border-box; }
        .as-input:focus { border-color: #000; }
        .as-textarea { width: 100%; padding: 12px 15px; background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; font-size: 14px; margin-bottom: 15px; outline: none; resize: vertical; box-sizing: border-box; font-family: monospace; }

        .as-loading { text-align: center; color: #999; padding: 50px 20px; font-size: 14px; }
        .as-spinner-wrap { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 50px; color: #ccc; font-size: 13px; }
        .as-spinner { width: 28px; height: 28px; border: 3px solid #eee; border-top-color: #000; border-radius: 50%; animation: as-spin 0.8s linear infinite; }
        @keyframes as-spin { to { transform: rotate(360deg); } }

        .as-run-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #fff; z-index: 5000; display: none; flex-direction: column; }
        .as-run-back-btn {
            position: absolute;
            top: calc(14px + env(safe-area-inset-top, 0px));
            left: 14px; width: 34px; height: 34px;
            background: rgba(0,0,0,0.35); border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; z-index: 10; backdrop-filter: blur(5px);
        }
        .as-run-back-btn i { font-size: 22px; color: #fff; margin-right: 2px; }
        .as-iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; background: transparent; }

        .wechat-dark-mode #appStoreScreen { background-color: #000; color: #fff; }
        .wechat-dark-mode .as-nav-bar, .wechat-dark-mode .as-tab-bar { background: rgba(0,0,0,0.97); border-color: #333; }
        .wechat-dark-mode .as-content { background: #111; }
        .wechat-dark-mode .as-nav-btn, .wechat-dark-mode .as-nav-title { color: #fff; }
        .wechat-dark-mode .as-tab.active { color: #fff; }
        .wechat-dark-mode .as-card, .wechat-dark-mode .as-app-item, .wechat-dark-mode .as-profile-header { background: #1c1c1e; border-color: #333; }
        .wechat-dark-mode .as-app-title, .wechat-dark-mode .as-profile-name, .wechat-dark-mode .as-myapps-name { color: #fff; }
        .wechat-dark-mode .as-btn-black { background: #fff; color: #000; }
        .wechat-dark-mode .as-btn-outline { border-color: #fff; color: #fff; }
        .wechat-dark-mode .as-input, .wechat-dark-mode .as-textarea { background: #2c2c2e; border-color: #444; color: #fff; }
        .wechat-dark-mode .as-search-bar { background: #000; border-color: #333; }
        .wechat-dark-mode .as-search-input { background: #2c2c2e; color: #fff; }
    `;
    document.head.appendChild(style);

    // ==========================================
    // HTML
    // ==========================================
    const htmlTemplate = `
        <div id="appStoreScreen" class="page">
            <div class="as-nav-bar">
                <button class="as-nav-btn" onclick="asGoHome()"><i class="ri-arrow-left-s-line"></i></button>
                <div class="as-nav-title" id="asNavTitle">应用商店</div>
                <div style="width:24px;"></div>
            </div>

            <div class="as-content">

                <!-- 首页 -->
                <div id="asViewHome" class="as-view active">
                    <div style="padding:20px 20px 10px;font-size:28px;font-weight:900;letter-spacing:-1px;background:#fff;">Discover<br>发现新奇</div>
                    <div class="as-search-bar">
                        <input class="as-search-input" id="asSearchInput" placeholder="搜索应用名称、简介、开发者..."
                            oninput="asOnSearchInput()"
                            onkeydown="if(event.key==='Enter'){asDoSearch()}">
                        <button class="as-search-clear" id="asSearchClear" onclick="asClearSearch()">清除</button>
                        <button class="as-search-btn" onclick="asDoSearch()">搜索</button>
                    </div>
                    <div id="asSearchStatus" style="display:none;padding:10px 15px;font-size:13px;color:#888;background:#fff;border-bottom:1px solid #f0f0f0;"></div>
                    <div id="asHomeList"></div>
                </div>

                <!-- 排行榜 -->
                <div id="asViewRank" class="as-view">
                    <div style="padding:20px;font-size:28px;font-weight:900;letter-spacing:-1px;border-bottom:1px solid #f0f0f0;background:#fff;">Top Charts<br>排行榜 Top 15</div>
                    <div id="asRankList"></div>
                </div>

                <!-- 我的 -->
                <div id="asViewMe" class="as-view">
                    <div class="as-profile-header">
                        <div class="as-profile-avatar-wrap" onclick="document.getElementById('asAvatarInput').click()">
                            <img src="" id="asMyAvatar" class="as-profile-avatar">
                            <div class="as-avatar-badge"><i class="ri-camera-line"></i></div>
                        </div>
                        <input type="file" id="asAvatarInput" style="display:none;" accept="image/*" onchange="asHandleAvatarUpload(event)">
                        <div>
                            <div class="as-profile-name" id="asMyName">开发者</div>
                            <div style="font-size:13px;color:#888;margin-top:4px;cursor:pointer;" onclick="asEditProfile()">点击修改昵称</div>
                        </div>
                    </div>
                    <div style="padding:15px 20px 0;font-weight:800;font-size:18px;">我下载的应用</div>
                    <div class="as-myapps-grid" id="asMyAppsGrid"></div>
                    <div class="as-card">
                        <button class="as-btn-black" onclick="asOpenPublish()">发布新应用</button>
                        <button class="as-btn-outline" onclick="asOpenTutorial()">开发者指南</button>
                        <button class="as-btn-outline" onclick="asOpenTestLab()">测试 App</button>
                    </div>
                </div>

                <!-- 发布页 -->
                <div id="asViewPublish" class="as-view">
                    <div class="as-card">
                        <div style="font-weight:800;font-size:18px;margin-bottom:15px;">发布应用到云端</div>
                        <input type="text" id="asPubName" class="as-input" placeholder="应用名称（必填）">
                        <input type="text" id="asPubDesc" class="as-input" placeholder="一句话简介（必填）">
                        <label style="font-size:12px;color:#888;margin-bottom:6px;display:block;">应用图标</label>
                        <div style="display:flex;gap:10px;margin-bottom:18px;align-items:center;">
                            <img id="asPubIconPreview" style="width:64px;height:64px;border-radius:14px;background:#eee;border:1px solid #ddd;object-fit:cover;flex-shrink:0;">
                            <button class="as-btn-outline" style="width:auto;margin:0;padding:8px 15px;" onclick="document.getElementById('asPubIconInput').click()">上传图标</button>
                            <input type="file" id="asPubIconInput" style="display:none;" accept="image/*" onchange="asHandleIconUpload(event)">
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <label style="font-size:12px;color:#888;">HTML 源码（含CSS/JS）</label>
                            <label style="font-size:12px;color:#007aff;cursor:pointer;">
                                导入 .html 文件
                                <input type="file" accept=".html,.txt" style="display:none;" onchange="asHandleCodeUpload(event)">
                            </label>
                        </div>
                        <textarea id="asPubCode" class="as-textarea" style="height:260px;" placeholder="在此粘贴完整 HTML 代码..."></textarea>
                        <button class="as-btn-black" id="asSubmitBtn" onclick="asSubmitApp()">发布到云端</button>
                        <button class="as-btn-outline" onclick="asSwitchTab('me')">取消</button>
                    </div>
                </div>

                <!-- 详情页 -->
                <div id="asViewDetail" class="as-view"><div id="asDetailContent"></div></div>


                <!-- 测试页 -->
                <div id="asViewTestLab" class="as-view">
                    <div class="as-card">
                        <div style="font-weight:800;font-size:18px;margin-bottom:6px;">测试 App</div>
                        <div style="font-size:13px;color:#888;margin-bottom:15px;">上传或粘贴代码，点击运行测试效果，不会发布到商店。</div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <label style="font-size:12px;color:#888;">HTML 源码</label>
                            <label style="font-size:12px;color:#007aff;cursor:pointer;">
                                导入 .html 文件
                                <input type="file" accept=".html,.txt" style="display:none;" onchange="asHandleTestCodeUpload(event)">
                            </label>
                        </div>
                        <textarea id="asTestCode" class="as-textarea" style="height:300px;" placeholder="在此粘贴要测试的 HTML 代码..."></textarea>
                        <button class="as-btn-black" onclick="asRunTestCode()">运行测试</button>
                        <button class="as-btn-outline" onclick="asSwitchTab('me')">取消</button>
                    </div>
                </div>

                <!-- 教程页 -->
                <div id="asViewTutorial" class="as-view">
                    <div class="as-card" style="line-height:1.6;font-size:14px;">
                        <h2 style="margin-bottom:10px;">开发者指南</h2>
                        <p>用 HTML / CSS / JS 创造属于自己的小程序，发布后所有人都能看到和下载。</p>
                        <div style="margin:20px 0;border-top:1px dashed #eee;"></div>
                        <h3 style="margin-bottom:10px;font-size:16px;">重要开发规则</h3>
                        <ul style="padding-left:20px;color:#555;margin-bottom:20px;font-size:13px;">
                            <li style="margin-bottom:8px;"><b>直连数据库：</b>用 <code>IndexedDB</code> 读取 <code>JRSY_DB_V2</code>。</li>
                            <li><b style="color:red;">防卡死：</b>JS 结尾标签必须加空格写成 <code>&lt;/script &gt;</code>，否则白屏！</li>
                        </ul>
                        <h3 style="margin-bottom:10px;font-size:16px;display:flex;justify-content:space-between;align-items:center;">
                            <span>基础模板源码</span>
                            <button onclick="asCopyTemplate()" style="background:#000;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">复制代码</button>
                        </h3>
                        <div style="background:#f7f7f7;padding:15px;border-radius:8px;font-family:monospace;font-size:11px;border:1px solid #ddd;overflow-x:auto;white-space:pre;" id="asTplCode"></div>
                        <button class="as-btn-black" style="margin-top:20px;" onclick="asSwitchTab('me')">我已了解，去发布应用</button>
                    </div>
                </div>

            </div>

            <div class="as-tab-bar" id="asTabBar">
                <div class="as-tab active" onclick="asSwitchTab('home')"><i class="ri-home-5-line"></i><span>首页</span></div>
                <div class="as-tab" onclick="asSwitchTab('rank')"><i class="ri-bar-chart-box-line"></i><span>排行</span></div>
                <div class="as-tab" onclick="asSwitchTab('me')"><i class="ri-user-smile-line"></i><span>我的</span></div>
            </div>
        </div>

        <div id="asRunContainer" class="as-run-container">
            <div class="as-run-back-btn" onclick="asCloseApp()">
                <i class="ri-arrow-left-s-line"></i>
            </div>
            <iframe id="asAppIframe" class="as-iframe"></iframe>
        </div>
    `;
    document.querySelector('.phone').insertAdjacentHTML('beforeend', htmlTemplate);

    function showVisualToast(msg) {
        const old = document.querySelector('.as-toast-el');
        if (old) old.remove();
        const t = document.createElement('div');
        t.className = 'as-toast-el';
        t.textContent = msg;
        t.style.cssText = `position:fixed;top:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 24px;border-radius:30px;font-size:14px;font-weight:bold;z-index:99999;opacity:0;transition:opacity 0.3s,top 0.3s;white-space:nowrap;pointer-events:none;`;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '1'; t.style.top = '120px'; }, 10);
        setTimeout(() => { t.style.opacity = '0'; t.style.top = '100px'; setTimeout(() => t.remove(), 300); }, 2200);
    }

    function _esc(str = '') {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function asSpinner() {
        return `<div class="as-spinner-wrap"><div class="as-spinner"></div><span>连接云端...</span></div>`;
    }

    // ==========================================
    // 路由
    // ==========================================
    if (window.openApp) {
        const orig = window.openApp;
        window.openApp = function(appName) {
            if (appName === 'appstore') {
                const phoneDiv = document.querySelector('.phone');
                phoneDiv.classList.remove('shopping-app-active', 'live-app-active');
                if (typeof window.setActivePage === 'function') {
                    window.setActivePage('appStoreScreen');
                } else {
                    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                    document.getElementById('appStoreScreen').classList.add('active');
                }
                asSwitchTab('home');
            } else { orig(appName); }
        };
    }

    window.asGoHome = function() {
        const active = document.querySelector('.as-view.active');
        if (active && ['asViewDetail','asViewPublish','asViewTutorial'].includes(active.id)) {
            const activeTab = document.querySelector('.as-tab.active');
            const match = activeTab ? activeTab.getAttribute('onclick').match(/'(.*?)'/) : null;
            asSwitchTab(match ? match[1] : 'home');
        } else {
            if (typeof window.goHome === 'function') window.goHome();
        }
    };

    window.asSwitchTab = function(tab) {
        document.getElementById('asTabBar').style.display = 'flex';
        const titles = { home: '应用商店', rank: '排行榜', me: '开发者中心' };
        document.getElementById('asNavTitle').textContent = titles[tab] || '应用商店';
        document.querySelectorAll('.as-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.as-view').forEach(v => v.classList.remove('active'));
        const idx = { home: 1, rank: 2, me: 3 }[tab] || 1;
        document.querySelector(`.as-tab:nth-child(${idx})`).classList.add('active');
        if (tab === 'home')      { document.getElementById('asViewHome').classList.add('active');  asRenderHome(); }
        else if (tab === 'rank') { document.getElementById('asViewRank').classList.add('active'); asRenderRank(); }
        else if (tab === 'me')   { document.getElementById('asViewMe').classList.add('active');   asRenderMe(); }
    };

    // ==========================================
    // 搜索
    // ==========================================
    let _allApps      = [];
    let _isSearchMode = false;

    window.asOnSearchInput = function() {
        const val = document.getElementById('asSearchInput').value;
        document.getElementById('asSearchClear').style.display = val ? 'block' : 'none';
    };

    window.asClearSearch = function() {
        document.getElementById('asSearchInput').value = '';
        document.getElementById('asSearchClear').style.display = 'none';
        document.getElementById('asSearchStatus').style.display = 'none';
        _isSearchMode = false;
        asRenderAppList(_allApps);
    };

    window.asDoSearch = async function() {
        const kw = document.getElementById('asSearchInput').value.trim();
        if (!kw) { asClearSearch(); return; }
        const container = document.getElementById('asHomeList');
        const status    = document.getElementById('asSearchStatus');
        container.innerHTML = asSpinner();
        status.style.display = 'none';
        _isSearchMode = true;
        try {
            const results = await CloudDB.searchApps(kw);
            status.style.display  = 'block';
            status.textContent    = `搜索"${kw}"，共找到 ${results.length} 个结果`;
            if (!results.length) { container.innerHTML = `<div class="as-loading">没有找到相关应用</div>`; return; }
            asRenderAppList(results);
        } catch(e) {
            container.innerHTML = `<div class="as-loading">搜索失败：${_esc(e.message)}</div>`;
        }
    };

    // ==========================================
    // 渲染首页（每次进入都刷新）
    // ==========================================
    async function asRenderHome() {
        if (_isSearchMode) return;
        const container = document.getElementById('asHomeList');
        container.innerHTML = asSpinner();
        document.getElementById('asSearchStatus').style.display = 'none';
        try {
            _allApps = await CloudDB.getApps('created_at', 50);
            if (!_allApps.length) {
                container.innerHTML = '<div class="as-loading">商店空空如也，快去发布第一个 App 吧</div>';
                return;
            }
            asRenderAppList(_allApps);
        } catch(e) {
            container.innerHTML = `<div class="as-loading">加载失败：${_esc(e.message)}<br><br><span style="color:#007aff;cursor:pointer;" onclick="asRenderHome()">点击重试</span></div>`;
        }
    }

    function asRenderAppList(apps) {
        const container = document.getElementById('asHomeList');
        const myIds = new Set(myApps.map(a => a.id));
        if (!apps.length) { container.innerHTML = '<div class="as-loading">没有找到相关应用</div>'; return; }
        container.innerHTML = apps.map(app => `
            <div class="as-app-item" onclick="asOpenDetail('${app.id}')">
                <img src="${app.icon||''}" class="as-app-icon">
                <div class="as-app-info">
                    <div class="as-app-title">${_esc(app.name)}</div>
                    <div class="as-app-desc">${_esc(app.desc)}</div>
                </div>
                <button class="as-app-get-btn">${myIds.has(app.id)?'打开':'获取'}</button>
            </div>
        `).join('');
    }

    // ==========================================
    // 渲染排行榜（前15）
    // ==========================================
    async function asRenderRank() {
        const container = document.getElementById('asRankList');
        container.innerHTML = asSpinner();
        try {
            const apps = await CloudDB.getApps('downloads', 15);
            if (!apps.length) { container.innerHTML = '<div class="as-loading">暂无数据</div>'; return; }
            container.innerHTML = apps.map((app,i) => `
                <div class="as-app-item" onclick="asOpenDetail('${app.id}')">
                    <div class="as-rank-num as-rank-${i+1}">${i+1}</div>
                    <img src="${app.icon||''}" class="as-app-icon">
                    <div class="as-app-info">
                        <div class="as-app-title">${_esc(app.name)}</div>
                        <div class="as-app-desc">${app.downloads||0} 次下载 · ${_esc(app.author)}</div>
                    </div>
                </div>
            `).join('');
        } catch(e) {
            container.innerHTML = `<div class="as-loading">加载失败：${_esc(e.message)}</div>`;
        }
    }

    // ==========================================
    // 渲染我的
    // ==========================================
    function asRenderMe() {
        const avatarEl = document.getElementById('asMyAvatar');
        avatarEl.src = asProfile.avatar ||
            `https://via.placeholder.com/150/000000/ffffff?text=${encodeURIComponent((asProfile.name||'?').charAt(0))}`;
        document.getElementById('asMyName').textContent = asProfile.name;
        const grid = document.getElementById('asMyAppsGrid');
        if (!myApps.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#999;font-size:12px;padding:20px;">暂无下载的应用</div>';
        } else {
            grid.innerHTML = myApps.map(app => `
                <div class="as-myapps-item" onclick="asOpenDetail('${app.id}')">
                    <img src="${app.icon||''}" class="as-myapps-icon">
                    <div class="as-myapps-name">${_esc(app.name)}</div>
                </div>
            `).join('');
        }
    }

    // ==========================================
    // 头像上传（压缩）
    // ==========================================
    window.asHandleAvatarUpload = function(e) {
        const file = e.target.files[0]; if (!file) return;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const max = 150;
            const ratio = Math.min(max / img.width, max / img.height, 1);
            canvas.width  = img.width  * ratio;
            canvas.height = img.height * ratio;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            asProfile.avatar = canvas.toDataURL('image/jpeg', 0.7);
            asSaveLocal();
            const el = document.getElementById('asMyAvatar');
            if (el) el.src = asProfile.avatar;
            showVisualToast('头像已更新');
            URL.revokeObjectURL(url);
        };
        img.src = url;
        e.target.value = '';
    };

    // ==========================================
    // 详情页
    // ==========================================
    window.asOpenDetail = async function(appId) {
        document.querySelectorAll('.as-view').forEach(v => v.classList.remove('active'));
        document.getElementById('asViewDetail').classList.add('active');
        document.getElementById('asTabBar').style.display = 'none';
        document.getElementById('asNavTitle').textContent = '应用详情';
        document.getElementById('asDetailContent').innerHTML = asSpinner();
        try {
            await _initFirebase();
            const app        = await CloudDB.getApp(appId);
            const isDownloaded = myApps.some(a => a.id === appId);
            const isAuthor     = _currentUser && (app.authorUid === _currentUser.uid);

            document.getElementById('asDetailContent').innerHTML = `
                <div style="padding:24px 20px;background:#fff;display:flex;gap:16px;align-items:flex-start;border-bottom:1px solid #f0f0f0;">
                    <img src="${app.icon||''}" style="width:90px;height:90px;border-radius:20px;border:1px solid #eee;object-fit:cover;flex-shrink:0;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:20px;font-weight:900;margin-bottom:6px;">${_esc(app.name)}</div>
                        <div style="font-size:13px;color:#888;margin-bottom:14px;">开发者：${_esc(app.author)}</div>
                        ${isDownloaded
                            ? `<button class="as-btn-black" onclick="asRunApp('${appId}')">打开应用</button>`
                            : `<button class="as-btn-black" id="asGetBtn_${appId}" onclick="asDownloadApp('${appId}')">获取</button>`}
                    </div>
                </div>
                <div style="padding:20px;background:#fff;">
                    <div style="font-size:17px;font-weight:800;margin-bottom:10px;">简介</div>
                    <div style="font-size:14px;color:#444;line-height:1.7;white-space:pre-wrap;">${_esc(app.desc)}</div>
                    <div style="margin-top:16px;font-size:12px;color:#bbb;">下载量：${app.downloads||0} 次</div>
                    ${isDownloaded ? `<button class="as-btn-danger" onclick="asUninstallApp('${appId}')">卸载该应用</button>` : ''}
                    ${isAuthor     ? `<button class="as-btn-danger" onclick="asDeleteFromCloud('${appId}')">从云端永久下架此应用</button>` : ''}
                </div>
            `;
        } catch(e) {
            document.getElementById('asDetailContent').innerHTML = `<div class="as-loading">加载失败：${_esc(e.message)}</div>`;
        }
    };

    // ==========================================
    // 下载（设备去重）
    // ==========================================
    window.asDownloadApp = async function(appId) {
        const btn = document.getElementById(`asGetBtn_${appId}`);
        if (btn) { btn.disabled = true; btn.textContent = '下载中...'; }
        try {
            const app = await CloudDB.getApp(appId);
            if (!myApps.some(a => a.id === appId)) {
                myApps.push({ id: app.id, name: app.name, icon: app.icon, author: app.author, code: app.code });
                asSaveLocal();
            }
            let deviceId = localStorage.getItem('JRSY_DEVICE_ID');
            if (!deviceId) {
                deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('JRSY_DEVICE_ID', deviceId);
            }
            await _initFirebase();
            const recordId  = `${appId}_${deviceId}`;
            const recordRef = _db.collection('downloadRecords').doc(recordId);
            const record    = await recordRef.get();
            if (!record.exists) {
                await recordRef.set({ appId, deviceId, time: firebase.firestore.FieldValue.serverTimestamp() });
                CloudDB.incrementDownload(appId).catch(()=>{});
            }
            showVisualToast('下载成功');
            asOpenDetail(appId);
        } catch(e) {
            if (btn) { btn.disabled = false; btn.textContent = '获取'; }
            showVisualToast('下载失败：' + e.message);
        }
    };

    window.asUninstallApp = function(appId) {
        if (!confirm('确定从本地卸载此应用吗？')) return;
        myApps = myApps.filter(a => a.id !== appId);
        asSaveLocal();
        showVisualToast('已卸载');
        asSwitchTab('me');
    };

    window.asDeleteFromCloud = async function(appId) {
        if (!confirm('确定从云端永久下架此应用吗？')) return;
        try {
            await CloudDB.deleteApp(appId);
            myApps = myApps.filter(a => a.id !== appId);
            asSaveLocal();
            showVisualToast('已从云端下架');
            asSwitchTab('me');
        } catch(e) {
            showVisualToast('下架失败：没有权限或网络错误');
        }
    };

    // ==========================================
    // 发布（图标压缩 + 代码大小检测）
    // ==========================================
    let tempIcon = '';

    window.asOpenPublish = function() {
        document.querySelectorAll('.as-view').forEach(v => v.classList.remove('active'));
        document.getElementById('asViewPublish').classList.add('active');
        document.getElementById('asTabBar').style.display = 'none';
        document.getElementById('asNavTitle').textContent = '发布应用';
        document.getElementById('asPubName').value = '';
        document.getElementById('asPubDesc').value = '';
        document.getElementById('asPubCode').value = '';
        tempIcon = '';
        document.getElementById('asPubIconPreview').src = 'https://via.placeholder.com/150/f0f0f0/cccccc?text=ICON';
        const btn = document.getElementById('asSubmitBtn');
        if (btn) { btn.disabled = false; btn.textContent = '发布到云端'; }
    };

    // 图标上传：压缩到 200x200 / jpeg 0.6，保证体积很小
    window.asHandleIconUpload = function(e) {
        const file = e.target.files[0]; if (!file) return;
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d');
        const img    = new Image();
        const url    = URL.createObjectURL(file);
        img.onload = () => {
            const max   = 200;
            const ratio = Math.min(max / img.width, max / img.height, 1);
            canvas.width  = img.width  * ratio;
            canvas.height = img.height * ratio;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            tempIcon = canvas.toDataURL('image/jpeg', 0.6);
            document.getElementById('asPubIconPreview').src = tempIcon;
            URL.revokeObjectURL(url);
        };
        img.src = url;
        e.target.value = '';
    };

    window.asHandleCodeUpload = function(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => { document.getElementById('asPubCode').value = ev.target.result; };
        reader.readAsText(file);
        e.target.value = '';
    };

    window.asSubmitApp = async function() {
        const name = document.getElementById('asPubName').value.trim();
        const desc = document.getElementById('asPubDesc').value.trim();
        const code = document.getElementById('asPubCode').value.trim();
        if (!name || !desc) { showVisualToast('名称和简介不能为空'); return; }
        if (!code)          { showVisualToast('请粘贴应用源码'); return; }

        // 检测代码大小，超过 700KB 警告
        const codeSizeKB = new Blob([code]).size / 1024;
        if (codeSizeKB > 700) {
            showVisualToast(`代码过大（${Math.round(codeSizeKB)}KB），请精简到700KB以内`);
            return;
        }

        const btn = document.getElementById('asSubmitBtn');
        btn.disabled = true; btn.textContent = '发布中...';
        try {
            await _initFirebase();
            if (!_currentUser) {
                await new Promise((resolve, reject) => {
                    const unsub = _auth.onAuthStateChanged(user => {
                        unsub(); _currentUser = user;
                        user ? resolve() : reject(new Error('登录失败，请重试'));
                    });
                    setTimeout(() => reject(new Error('登录超时，请重试')), 4000);
                });
            }
            const newApp = await CloudDB.publishApp({
                name, desc, code,
                icon: tempIcon || `https://via.placeholder.com/150/000000/ffffff?text=${encodeURIComponent(name.charAt(0))}`,
                author: asProfile.name
            });
            myApps.push({ id: newApp.id, name: newApp.name, icon: newApp.icon, author: newApp.author, code: newApp.code });
            asSaveLocal();
            showVisualToast('发布成功，所有人都能看到了');
            asSwitchTab('home');
        } catch(e) {
            btn.disabled = false; btn.textContent = '发布到云端';
            showVisualToast('发布失败：' + e.message);
        }
    };

    window.asEditProfile = function() {
        const name = prompt('请输入开发者昵称：', asProfile.name);
        if (name && name.trim()) { asProfile.name = name.trim(); asSaveLocal(); asRenderMe(); }
    };

    // ==========================================
    // 运行应用
    // ==========================================
    window.asRunApp = function(appId) {
        const app = myApps.find(a => a.id === appId);
        if (!app || !app.code) { showVisualToast('找不到应用代码，请重新下载'); return; }
        const runContainer = document.getElementById('asRunContainer');
        const iframe       = document.getElementById('asAppIframe');
        runContainer.style.display = 'flex';
        const bridge = `<script>window.JRSY_API={getFriends:async()=>window.parent.friends||[],getChatHistories:async()=>window.parent.chatHistories||{},getApiSettings:async()=>{if(window.parent.dbManager)return await window.parent.dbManager.get('apiSettings','settings')||{};return {};}}<\/script>`;
        iframe.srcdoc = bridge + app.code;
    };

    window.asCloseApp = function() {
        document.getElementById('asRunContainer').style.display = 'none';
        document.getElementById('asAppIframe').srcdoc = '';
    };

    // ==========================================
    // 教程模板
    // ==========================================
    const TPL_CODE = `<!DOCTYPE html>
<html>
<head>
<style>
  body{font-family:sans-serif;padding:20px;background:#f5f5f5;}
  .card{background:#fff;padding:20px;border-radius:12px;}
  select,button{width:100%;padding:10px;margin-bottom:12px;border-radius:6px;border:1px solid #ccc;}
  button{background:#000;color:#fff;border:none;font-weight:bold;cursor:pointer;}
</style>
</head>
<body>
<div class="card">
  <h3 style="margin-top:0;">AI 打招呼模板</h3>
  <select id="charSelect"><option>连接中...</option></select>
  <button onclick="sayHello()">向TA打个招呼</button>
  <p id="output" style="padding:15px;background:#f9f9f9;border-radius:8px;">等待操作...</p>
</div>
<script>
async function fetchData() {
  return new Promise(resolve => {
    const req = indexedDB.open('JRSY_DB_V2');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction(['friends','apiSettings'],'readonly');
      let d = {friends:[],api:{}};
      tx.objectStore('friends').getAll().onsuccess = r => d.friends = r.target.result||[];
      tx.objectStore('apiSettings').get('settings').onsuccess = r => d.api = r.target.result||{};
      tx.oncomplete = () => resolve(d);
    };
  });
}
let sys;
window.onload = async () => {
  sys = await fetchData();
  const sel = document.getElementById('charSelect');
  sel.innerHTML = sys.friends.filter(f=>!f.isGroup).map(f=>\`<option value="\${f.id}">\${f.remark||f.name}</option>\`).join('');
};
async function sayHello() {
  const f = sys.friends.find(f=>f.id===document.getElementById('charSelect').value);
  const out = document.getElementById('output');
  out.innerText = 'AI 思考中...';
  try {
    const r = await fetch(\`\${sys.api.apiUrl}/chat/completions\`,{
      method:'POST',
      headers:{'Authorization':\`Bearer \${sys.api.apiKey}\`,'Content-Type':'application/json'},
      body:JSON.stringify({model:sys.api.modelName,messages:[{role:'user',content:\`你叫"\${f.name}"，人设：\${f.role}。向我打个招呼（30字内）。\`}]})
    });
    const data = await r.json();
    out.innerHTML = \`<b>\${f.name}</b>：\${data.choices[0].message.content}\`;
  } catch(e){ out.innerText='失败:'+e.message; }
}
</script >
</body>
</html>`;


    // ==========================================
    // 测试 App
    // ==========================================
    window.asOpenTestLab = function() {
        document.querySelectorAll('.as-view').forEach(v => v.classList.remove('active'));
        document.getElementById('asViewTestLab').classList.add('active');
        document.getElementById('asTabBar').style.display = 'none';
        document.getElementById('asNavTitle').textContent = '测试 App';
    };

    window.asHandleTestCodeUpload = function(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => { document.getElementById('asTestCode').value = ev.target.result; };
        reader.readAsText(file);
        e.target.value = '';
    };

    window.asRunTestCode = function() {
        const code = document.getElementById('asTestCode').value.trim();
        if (!code) { showVisualToast('请先粘贴或上传代码'); return; }
        const runContainer = document.getElementById('asRunContainer');
        const iframe       = document.getElementById('asAppIframe');
        runContainer.style.display = 'flex';
        const bridge = `<script>window.JRSY_API={getFriends:async()=>window.parent.friends||[],getChatHistories:async()=>window.parent.chatHistories||{},getApiSettings:async()=>{if(window.parent.dbManager)return await window.parent.dbManager.get('apiSettings','settings')||{};return {};}}<\/script>`;
        iframe.srcdoc = bridge + code;
    };

    window.asOpenTutorial = function() {
        document.querySelectorAll('.as-view').forEach(v => v.classList.remove('active'));
        document.getElementById('asViewTutorial').classList.add('active');
        document.getElementById('asTabBar').style.display = 'none';
        document.getElementById('asNavTitle').textContent = '开发者指南';
        document.getElementById('asTplCode').textContent = TPL_CODE;
    };

    window.asCopyTemplate = function() {
        const fallback = text => {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); showVisualToast('模板代码已复制'); } catch { showVisualToast('请手动复制'); }
            document.body.removeChild(ta);
        };
        navigator.clipboard
            ? navigator.clipboard.writeText(TPL_CODE).then(()=>showVisualToast('模板代码已复制')).catch(()=>fallback(TPL_CODE))
            : fallback(TPL_CODE);
    };

})();
