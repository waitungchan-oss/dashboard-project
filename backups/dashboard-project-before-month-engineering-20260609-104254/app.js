// 核心對抗性審查：全局字串安全編碼 (防範 XSS 攻擊)
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '-';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
};

let DataStore = {};
window.DataStore = DataStore;

const DATA_PATH = './data/';
const DEFAULT_MONTH = '202605';
let currentMonthKey = DEFAULT_MONTH;

const normalizeMonthValue = (monthVal) => {
    const raw = String(monthVal || DEFAULT_MONTH).trim();
    const compact = raw.replace(/\D/g, '');
    if (/^\d{6}$/.test(compact)) return compact;

    const match = raw.match(/(20\d{2}).*?(\d{1,2})/);
    if (match) return `${match[1]}${match[2].padStart(2, '0')}`;

    return DEFAULT_MONTH;
};

const formatMonthLabel = (monthKey) => {
    const normalized = normalizeMonthValue(monthKey);
    return `${normalized.slice(0, 4)}年 ${normalized.slice(4, 6)}月`;
};

const showLoadingOverlay = (titleText, descText) => {
    const overlay = document.getElementById('loadingOverlay');
    const title = document.getElementById('loading-title');
    const desc = document.getElementById('loading-desc');
    if (title) title.innerText = titleText || '正在載入數據庫...';
    if (desc) desc.innerText = descText || '正在執行 API 數據提取與圖表重繪，請稍候...';
    if (overlay) overlay.style.display = 'flex';
};

const hideLoadingOverlay = () => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
};

const showDashboardError = (message) => {
    const errorBoundary = document.getElementById('js-error-boundary');
    const errorMsg = document.getElementById('js-error-msg');
    if (errorMsg) errorMsg.innerText = message || '部分圖表或資源加載緩慢，系統已自動修復並呈現可用數據。';
    if (errorBoundary) errorBoundary.classList.remove('hidden');
};

const clearDashboardError = () => {
    const errorBoundary = document.getElementById('js-error-boundary');
    if (errorBoundary) errorBoundary.classList.add('hidden');
};

const updateMonthHeader = (monthKey) => {
    const headerDesc = document.getElementById('header-data-source');
    if (headerDesc) headerDesc.innerText = `當前視圖：${formatMonthLabel(monthKey)} | 數據源：問卷匯總`;
};

const setHTML = (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== null && value !== undefined && value !== '') element.innerHTML = value;
};

const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== null && value !== undefined && value !== '') element.innerText = value;
};

const rememberFallback = (id) => {
    const element = document.getElementById(id);
    if (element && element.dataset.fallbackHtml === undefined) {
        element.dataset.fallbackHtml = element.innerHTML;
    }
};

const restoreFallback = (id) => {
    const element = document.getElementById(id);
    if (element && element.dataset.fallbackHtml !== undefined) {
        element.innerHTML = element.dataset.fallbackHtml;
    }
};

const renderListHTML = (items) => {
    if (!Array.isArray(items)) return '';
    return items.map(item => `<li>${item}</li>`).join('');
};

const getValidTourDays = (tour) => {
    const explicitDays = Number(tour?.days);
    if (Number.isFinite(explicitDays) && explicitDays > 0 && explicitDays <= 30) return explicitDays;
    if (!tour?.start || !tour?.end) return null;
    const start = new Date(tour.start);
    const end = new Date(tour.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (start.getFullYear() !== 2026 || end.getFullYear() !== 2026) return null;
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return days > 0 && days <= 30 ? days : null;
};

const destroyAllCharts = () => {
    if (typeof Chart === 'undefined' || typeof Chart.getChart !== 'function') return;
    document.querySelectorAll('canvas').forEach((canvas) => {
const chart = Chart.getChart(canvas);
if (chart) chart.destroy();
    });
};

const fetchMonthData = async (monthVal) => {
    const monthKey = normalizeMonthValue(monthVal);
    const response = await fetch(`${DATA_PATH}${encodeURIComponent(monthKey)}.json`, { cache: 'no-store' });
    if (!response.ok) {
throw new Error(`無法載入 ${monthKey}.json（HTTP ${response.status}）`);
    }

    const nextDataStore = await response.json();
    DataStore = nextDataStore;
    window.DataStore = DataStore;
    currentMonthKey = monthKey;
    updateMonthHeader(monthKey);
    return DataStore;
};



const DashboardApp = (function() {
    let satCrossChart = null;

    // 核心對抗性審查：CSV 匯出安全引擎 (防範 DDE Injection 與亂碼)
    const exportCSV = (dataArray, filename, headers) => {
        let csvContent = "\uFEFF"; 
        csvContent += headers.join(",") + "\n";
        dataArray.forEach(row => {
            let rowStr = row.map(item => {
                let field = item === null || item === undefined ? "" : item.toString();
                
                // 防範 CSV DDE 注入漏洞 (Excel 公式自動執行漏洞)
                if (/^[=\+\-@]/.test(field)) {
                    field = "'" + field;
                }
                
                // 處理內容中的逗號與換行符
                if (field.includes(",") || field.includes('"') || field.includes("\n")) {
                    field = '"' + field.replace(/"/g, '""') + '"'; 
                }
                return field;
            }).join(",");
            csvContent += rowStr + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return {
        init: function() {
            try {
                this.renderDashboardText();
                this.renderLeadersTable();
                this.renderTourDetailsTable();
                this.renderBranchLeaderboard();
                this.renderBranchFeedbacks(); // 修復：補上門市長評渲染函數
                this.renderFeedbackFilters();
                this.renderWordCloud();
                this.filterFeedback();
                this.initCharts();
                this.setupEventListeners();
            } catch (e) {
                console.error("Dashboard Initialization Critical Error:", e);
            }
        },

        exportLeadersCSV: function() {
            const headers = ["排名", "領隊姓名", "出團地點", "平均評分", "樣本數(N)"];
            const sorted = [...DataStore.leadersRaw].sort((a, b) => parseFloat(b.score) - parseFloat(a.score) || parseInt(b.n) - parseInt(a.n));
            const data = sorted.map((l, i) => [i+1, escapeHTML(l.name), escapeHTML(l.loc), l.score, l.n]);
            exportCSV(data, "領隊服務評分排行榜", headers);
        },

        exportToursCSV: function() {
            const headers = ["旅遊目的地", "負責領隊", "旅程開始日期", "旅程結束日期", "總天數"];
            const data = DataStore.uniqueTours.map(t => {
                const days = getValidTourDays(t);
                return [escapeHTML(t.dest), escapeHTML(t.leader), t.start || '-', t.end || '-', days || '-'];
            });
            exportCSV(data, "最新出團明細", headers);
        },

        exportBranchesCSV: function() {
            const headers = ["排名", "門店分社", "平均服務態度評分", "樣本數(N)"];
            const sorted = [...DataStore.branchLeaderboardData].sort((a, b) => b.score - a.score);
            const data = sorted.map((b, i) => [i+1, escapeHTML(b.name), b.score, b.n]);
            exportCSV(data, "門市服務滿意度排行榜", headers);
        },

        setupEventListeners: function() {
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('tabFilterMenu');
                if (menu && !e.target.closest('#tabFilterMenu') && !e.target.closest('button[onclick="DashboardApp.toggleFilterMenu()"]')) {
                    menu.classList.add('hidden');
                }
                if(e.target.classList.contains('word-tag')) {
                    document.querySelectorAll('.word-tag').forEach(el => el.classList.remove('active'));
                    e.target.classList.add('active');
                }
            });
        },

        renderDashboardText: function() {
            const summary = DataStore.dashboardSummary;
            const labels = DataStore.dashboardTextLabels || {};
            const insights = DataStore.dashboardInsights || {};
            const monthLabel = `${currentMonthKey.slice(0, 4)}年${Number(currentMonthKey.slice(4, 6))}月`;
            ['duration-legend', 'records-cross-insights', 'records-average-days', 'records-total-samples', 'records-top-destination'].forEach(rememberFallback);
            setText('leaderboard-source-label', `數據來源：${monthLabel}領隊服務評分排行榜`);
            setHTML('leaderboard-title', `<i class="fas fa-trophy text-yellow-500 mr-2"></i> ${escapeHTML(monthLabel)}領隊服務評分排行榜`);
            setText('leaderboard-footnote', `* 數據來源：${monthLabel}份最新領隊服務評分全量數據。`);
            const branchTotal = Array.isArray(DataStore.branchLeaderboardData)
                ? DataStore.branchLeaderboardData.reduce((sum, branch) => sum + (Number(branch.n) || 0), 0)
                : null;
            const branchFeedbackTotal = Array.isArray(DataStore.branchRawFeedbacks) ? DataStore.branchRawFeedbacks.length : null;
            if (branchTotal !== null) setText('branch-leaderboard-total', `N=${branchTotal} (最新統計)`);
            if (branchFeedbackTotal !== null) setText('branch-feedback-total', `共提取 ${branchFeedbackTotal} 條門市意見`);

            if (summary) {
                setHTML('kpi-total-respondents', escapeHTML(summary.totalRespondents));
                if (summary.promoConsent) {
                    setHTML('kpi-promo-consent', `${escapeHTML(summary.promoConsent.count)} <span class="text-sm font-normal text-gray-400">/ ${escapeHTML(summary.promoConsent.pct)}</span>`);
                }
                if (summary.nps) {
                    setHTML('kpi-nps-score', `${escapeHTML(summary.nps.score)} 分 <span class="text-sm font-normal text-gray-400">/ 推薦者 ${escapeHTML(summary.nps.promoterPct)}</span>`);
                }
                if (summary.storeSignup) {
                    setHTML('kpi-store-signup', `${escapeHTML(summary.storeSignup.count)}<span class="text-sm font-normal text-gray-400">人 / ${escapeHTML(summary.storeSignup.pct)}</span>`);
                }
            }

            setText('profile-title', labels.profileTitle);
            setText('member-source-label', labels.memberSource);
            setText('satisfaction-title', labels.satisfactionTitle);
            setText('source-reply-label', labels.sourceReply);
            setText('channel-reply-label', labels.channelReply);

            if (Array.isArray(insights.member)) {
                setHTML('member-insight-1', insights.member[0]);
                setHTML('member-insight-2', insights.member[1]);
            }
            if (Array.isArray(insights.satisfaction)) {
                setHTML('satisfaction-insight-1', insights.satisfaction[0]);
                setHTML('satisfaction-insight-2', insights.satisfaction[1]);
            }
            if (Array.isArray(insights.destAge)) {
                setHTML('dest-age-insight-1', insights.destAge[0]);
                setHTML('dest-age-insight-2', insights.destAge[1]);
            }
            if (Array.isArray(insights.channels)) {
                insights.channels.slice(0, 3).forEach((item, index) => {
                    const seq = index + 1;
                    setText(`channel-insight-title-${seq}`, item.title);
                    setHTML(`channel-insight-text-${seq}`, item.text);
                });
            }
            if (insights.nps) {
                setHTML('nps-zone-description', insights.nps.description);
                setHTML('nps-zone-indicator', `${escapeHTML(insights.nps.indicatorText)} <span class="text-sm font-normal text-gray-500">${escapeHTML(insights.nps.indicatorSuffix)}</span>`);
            }

            const future = DataStore.futureTrendInsights;
            if (future) {
                if (Array.isArray(future.destinations)) {
                    setHTML('future-dest-table-body', future.destinations.map((row, index) => `
                        <tr class="${index % 2 ? 'bg-[#faf9f8]' : 'bg-white'} hover:bg-[#f3f2f1]">
                            <td class="px-4 py-2 font-bold text-[#118DFF]">${escapeHTML(row.region)}</td>
                            <td class="px-4 py-2 text-right font-bold">${escapeHTML(row.mentions)}</td>
                            <td class="px-4 py-2 text-right">${escapeHTML(row.pct)}</td>
                            <td class="px-4 py-2">${row.meaning}</td>
                        </tr>
                    `).join(''));
                }
                setHTML('future-product-guide-list', renderListHTML(future.productGuide));
                setHTML('loyalty-recommendation-list', renderListHTML(future.loyaltyRecommendations));
                if (Array.isArray(future.drivers)) {
                    setHTML('nps-driver-table-body', future.drivers.map(row => `
                        <tr>
                            <td class="py-1 font-bold text-[#118DFF]">${escapeHTML(row.item)}</td>
                            <td class="py-1 text-right">${escapeHTML(row.score)}</td>
                            <td class="py-1 pl-3">${row.meaning}</td>
                        </tr>
                    `).join(''));
                }
            }

            const opinion = DataStore.opinionMiningInsights;
            if (opinion) {
                if (Array.isArray(opinion.keywordCards)) {
                    setHTML('opinion-keyword-grid', opinion.keywordCards.map(card => `
                        <div class="border border-[#e1dfdd] rounded-[2px] p-3 shadow-sm bg-[#faf9f8]" style="border-left: 4px solid ${escapeHTML(card.color || '#118DFF')}">
                            <p class="font-bold text-[#252423] text-sm mb-1">「${escapeHTML(card.title)}」</p>
                            <p class="text-xs text-[#605e5c]">${escapeHTML(card.text)}</p>
                        </div>
                    `).join(''));
                }
                setText('opinion-optimization-title', opinion.optimizationTitle);
                setHTML('opinion-optimization-list', renderListHTML(opinion.optimizationItems));
            }

            const records = DataStore.recordsSummary;
            if (records) {
                setText('records-top-destination', records.topDestination);
                setHTML('records-average-days', `${escapeHTML(records.averageDays)} <span class="text-sm text-gray-400 font-normal">天</span>`);
                setHTML('records-total-samples', `${escapeHTML(records.totalSamples)} <span class="text-sm text-gray-400 font-normal">份</span>`);
            } else {
                ['records-top-destination', 'records-average-days', 'records-total-samples'].forEach(restoreFallback);
            }

            const recordsInsights = DataStore.recordsInsights;
            if (recordsInsights) {
                const colors = ['bg-teal-500', 'bg-blue-500', 'bg-indigo-500'];
                if (Array.isArray(recordsInsights.durationRows)) {
                    setHTML('duration-legend', recordsInsights.durationRows.map((row, index) => `
                        <div class="flex items-center justify-between text-sm">
                            <span class="flex items-center"><span class="w-3 h-3 ${colors[index % colors.length]} rounded-full mr-2"></span>${escapeHTML(row.label)} (${escapeHTML(row.range).replace(/\\s/g, '')})</span>
                            <span class="font-bold text-gray-700">${escapeHTML(row.pct)}</span>
                        </div>
                    `).join(''));
                }
                if (Array.isArray(recordsInsights.satisfactionCross)) {
                    setHTML('records-cross-insights', recordsInsights.satisfactionCross.map(text => `
                        <div class="bg-white p-4 rounded-lg shadow-sm border border-indigo-50">
                            <p class="text-sm text-gray-700 leading-relaxed">${text}</p>
                        </div>
                    `).join(''));
                }
            } else {
                ['duration-legend', 'records-cross-insights'].forEach(restoreFallback);
            }
        },

        changeMonth: async function(monthVal) {
            const monthKey = normalizeMonthValue(monthVal);
            showLoadingOverlay(`正在載入 ${formatMonthLabel(monthKey)} 數據...`, '正在讀取本地 JSON 並重繪圖表，請稍候...');
            clearDashboardError();

            try {
                await fetchMonthData(monthKey);
                destroyAllCharts();
                this.renderLeadersTable();
                this.renderTourDetailsTable();
                this.renderBranchLeaderboard();
                this.renderBranchFeedbacks();
                this.renderFeedbackFilters();
                this.renderWordCloud();
                this.filterFeedback();
                this.renderDashboardText();
                this.initCharts();
                console.log(`本地月份數據已切換: ${monthKey}`);
            } catch (error) {
                console.error('Month data loading failed:', error);
                showDashboardError(error.message);
            } finally {
                hideLoadingOverlay();
            }
        },

        switchTab: function(tabId, btnElement) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            const target = document.getElementById(tabId);
            if (target) target.classList.add('active');
            
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active-tab', 'bg-blue-50', 'text-blue-700', 'shadow-sm');
                btn.classList.add('text-gray-600');
            });
            
            const btn = btnElement || document.querySelector(`button[data-tab-id="${escapeHTML(tabId)}"]`);
            if(btn) {
                btn.classList.remove('text-gray-600');
                btn.classList.add('active-tab', 'bg-blue-50', 'text-blue-700', 'shadow-sm');
            }
        },
        
        toggleFilterMenu: function() {
            const menu = document.getElementById('tabFilterMenu');
            if(!menu) return;
            if(menu.classList.contains('hidden')) {
                menu.classList.remove('hidden');
                if(document.getElementById('filterCheckboxes')?.children.length === 0) {
                    this.generateFilterCheckboxes();
                }
            } else {
                menu.classList.add('hidden');
            }
        },
        
        generateFilterCheckboxes: function() {
            const container = document.getElementById('filterCheckboxes');
            if(!container) return;
            const tabs = [
                {id: 'dashboard', name: '旅行團數據儀表板'}, {id: 'sales_forecast', name: 'AI 銷售預測'},
                {id: 'nps_zone', name: '推薦意願專區'}, {id: 'tourleader', name: '領隊表現專區'},
                {id: 'records', name: '出團記錄分析'}, {id: 'feedback_analysis', name: '出團長評回饋'},
                {id: 'branch_feedback', name: '門市服務意見'}, {id: 'analysis', name: '綜合意見'}
            ];
            container.innerHTML = tabs.map(tab => `
                <label class="flex items-center px-3 py-2 hover:bg-gray-50 rounded cursor-pointer transition-colors">
                    <input type="checkbox" checked class="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" 
                        onchange="DashboardApp.toggleTabVisibility('${escapeHTML(tab.id)}', this.checked)">
                    <span class="ml-3 text-sm text-gray-700 font-medium">${escapeHTML(tab.name)}</span>
                </label>
            `).join('');
        },
        
        toggleTabVisibility: function(tabId, isChecked) {
            const btn = document.querySelector(`button[data-tab-id="${escapeHTML(tabId)}"]`);
            if(!btn) return;
            isChecked ? btn.classList.remove('hidden') : btn.classList.add('hidden');
            if(!isChecked && btn.classList.contains('active-tab')) {
                const firstVisible = document.querySelector('.tab-btn:not(.hidden)');
                if(firstVisible) this.switchTab(firstVisible.getAttribute('data-tab-id'), firstVisible);
            }
        },

        renderLeadersTable: function() {
            const tableBody = document.getElementById('fullLeadersTable');
            if(!tableBody || !DataStore.leadersRaw) return;
            const sorted = [...DataStore.leadersRaw].sort((a, b) => parseFloat(b.score) - parseFloat(a.score) || parseInt(b.n) - parseInt(a.n));
            tableBody.innerHTML = sorted.map((l, i) => {
                let badgeClass = 'bg-gray-100 text-gray-600'; let trClass = 'bg-white hover:bg-gray-50';
                if (i === 0) { badgeClass = 'bg-yellow-100 text-yellow-800'; trClass = 'bg-yellow-50/30 hover:bg-yellow-50'; } 
                else if (i === 1) { badgeClass = 'bg-gray-200 text-gray-800'; } else if (i === 2) { badgeClass = 'bg-orange-100 text-orange-800'; }
                
                let scoreNum = parseFloat(l.score);
                let scoreColorHex = scoreNum >= 9.8 ? '#00B8AA' : (scoreNum >= 9 ? '#118DFF' : '#605e5c');
                // 資料棒基於10分滿分計算
                let barWidth = (scoreNum / 10) * 100;
                
                return `<tr class="border-b border-gray-100 ${trClass}">
                    <td class="px-6 py-4"><span class="w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${badgeClass}">${i+1}</span></td>
                    <td class="px-6 py-4 font-medium text-gray-900">${escapeHTML(l.name)}</td>
                    <td class="px-6 py-4 text-gray-500 text-sm">${escapeHTML(l.loc)}</td>
                    <td class="px-6 py-4 relative min-w-[100px]">
                        <div class="absolute left-0 top-2 bottom-2 rounded-r-[2px]" style="width: calc(${barWidth}% - 24px); background-color: ${scoreColorHex}; opacity: 0.15;"></div>
                        <div class="text-right font-bold relative z-10" style="color: ${scoreColorHex};">${l.score}</div>
                    </td>
                    <td class="px-6 py-4 text-right text-gray-500">${l.n || 0}</td>
                </tr>`;
            }).join('');
        },

        renderTourDetailsTable: function() {
            const el = document.getElementById('tourDetailBody');
            if(!el || !DataStore.uniqueTours) return;

            const grouped = {};
            DataStore.uniqueTours.forEach(t => {
                const days = getValidTourDays(t);

                if(!grouped[t.dest]) {
                    grouped[t.dest] = [];
                }
                grouped[t.dest].push({ leader: t.leader, daysLabel: days ? `${days}天` : '-' });
            });

            const rows = Object.keys(grouped).sort().map(dest => {
                const leadersHtml = grouped[dest].map(l => 
                    `<span class="inline-flex items-center px-2.5 py-1 rounded-[2px] text-xs font-semibold bg-[#e6f3ff] text-[#118DFF] mr-2 mb-2 border border-[#118DFF]/20 shadow-sm">${escapeHTML(l.leader)} <span class="ml-1.5 px-1.5 py-0.5 bg-[#118DFF]/10 rounded-sm text-[#0c6ac2]">${escapeHTML(l.daysLabel)}</span></span>`
                ).join('');

                return `<tr class="border-b border-[#e1dfdd] hover:bg-[#f3f2f1] transition-colors">
                    <td class="px-6 py-4 font-bold text-[#252423] border-r border-[#e1dfdd]/50 align-top w-1/4">${escapeHTML(dest)}</td>
                    <td class="px-6 py-4">${leadersHtml}</td>
                </tr>`;
            });

            el.innerHTML = rows.join('');
        },

        renderBranchLeaderboard: function() {
             const branchLB = document.getElementById('branchLeaderboard');
             if(!branchLB || !DataStore.branchLeaderboardData) return;
             
             const leaderboard = DataStore.branchLeaderboardData.sort((a, b) => b.score - a.score);
             
             branchLB.innerHTML = leaderboard.map((b, i) => {
                let rankClass = i === 0 ? "rank-1" : (i === 1 ? "rank-2" : (i === 2 ? "rank-3" : "bg-white"));
                let medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `<span class="text-gray-400 font-bold ml-2">#${i+1}</span>`));
                let trendIcon = i === 0 ? '<i class="fas fa-caret-up text-green-500"></i>' : (parseFloat(b.score) < 4.45 ? '<i class="fas fa-caret-down text-red-500"></i>' : '<i class="fas fa-minus text-gray-300"></i>');
                
                let scoreNum = parseFloat(b.score);
                // 適配 5 分制的高亮邏輯
                let scoreColorHex = scoreNum >= 4.6 ? '#00B8AA' : (scoreNum >= 4.45 ? '#118DFF' : '#E66C37');
                // 資料底色棒寬度基於 5 分滿分計算
                let barWidth = (scoreNum / 5) * 100;

                return `
                <div class="relative flex items-center justify-between p-3 rounded-sm mb-2 border border-gray-100 ${rankClass} overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0" style="width: ${barWidth}%; background-color: ${scoreColorHex}; opacity: 0.1;"></div>
                    
                    <div class="flex items-center relative z-10">
                        <div class="w-10 text-xl text-center">${medal}</div>
                        <div><span class="font-medium text-gray-800 text-sm block">${escapeHTML(b.name)}</span><span class="text-xs text-gray-500">樣本數: ${b.n}</span></div>
                    </div>
                    <div class="text-right flex items-center space-x-3 relative z-10">
                        <span class="text-xl font-bold" style="color: ${scoreColorHex};">${b.score.toFixed(2)}</span>
                        <span class="text-xs">${trendIcon}</span>
                    </div>
                </div>`;
            }).join('');
        },

        renderBranchFeedbacks: function() {
            const container = document.getElementById('branchFeedbackGrid');
            if (!container || !DataStore.branchRawFeedbacks) return;
            
            container.innerHTML = DataStore.branchRawFeedbacks.map(f => {
                const borderClass = f.type === 'positive' ? 'border-l-4 border-l-[#00B8AA]' : (f.type === 'suggestion' ? 'border-l-4 border-l-[#F2C80F]' : 'border-l-4 border-l-[#FD625E]');
                const icon = f.type === 'positive' ? '<i class="fas fa-thumbs-up text-[#00B8AA]"></i>' : (f.type === 'suggestion' ? '<i class="fas fa-lightbulb text-[#F2C80F]"></i>' : '<i class="fas fa-exclamation-triangle text-[#FD625E]"></i>');
                const typeText = f.type === 'positive' ? '表揚' : (f.type === 'suggestion' ? '建議' : '投訴');
                const typeColor = f.type === 'positive' ? 'text-[#00B8AA] bg-[#00B8AA]/10' : (f.type === 'suggestion' ? 'text-[#E66C37] bg-[#F2C80F]/20' : 'text-[#FD625E] bg-[#FD625E]/10');
                
                return `
                <div class="bg-[#faf9f8] rounded-[2px] p-4 shadow-sm border border-gray-200 ${borderClass} card-hover h-full flex flex-col justify-between">
                    <div class="flex justify-between items-start mb-2">
                        <span class="font-bold text-gray-800 text-sm"><i class="fas fa-store-alt text-gray-400 mr-1"></i>${escapeHTML(f.branch)}</span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColor}">${icon}</span>
                    </div>
                    <p class="text-gray-700 text-sm leading-relaxed mt-2 whitespace-pre-wrap flex-grow">"${escapeHTML(f.content)}"</p>
                </div>`;
            }).join('');
        },

        renderWordCloud: function() {
            const wc = document.getElementById('wordCloudContainer');
            if(wc) {
                const fallbackKeywords = [
                    { text: "領隊經驗豐富", weight: 50, color: "text-[#00B8AA]" },
                    { text: "強行推銷購物", weight: 48, color: "text-[#FD625E]" },
                    { text: "門市出錯導遊搭救", weight: 45, color: "text-[#118DFF]" },
                    { text: "退款速度太慢", weight: 42, color: "text-[#FD625E]" },
                    { text: "行程太趕/節奏快", weight: 38, color: "text-[#F2C80F]" },
                    { text: "旅遊巴太舊/損壞", weight: 35, color: "text-[#FD625E]" },
                    { text: "醫療隨行好安心", weight: 32, color: "text-[#00B8AA]" },
                    { text: "帶團僵化無解釋", weight: 30, color: "text-[#FD625E]" },
                    { text: "司機幫忙搬行李", weight: 28, color: "text-[#00B8AA]" },
                    { text: "自費項目不合理", weight: 25, color: "text-[#E66C37]" },
                    { text: "膳食需介紹/改善", weight: 24, color: "text-[#E66C37]" },
                    { text: "彈性與資訊透明", weight: 20, color: "text-[#118DFF]" }
                ];
                const keywords = Array.isArray(DataStore.feedbackKeywordCloud) && DataStore.feedbackKeywordCloud.length
                    ? DataStore.feedbackKeywordCloud
                    : fallbackKeywords;
                wc.innerHTML = keywords.map(k => `<span class="word-tag ${k.color}" style="font-size: ${k.weight}px; font-weight: bold;">${escapeHTML(k.text)}</span>`).join('');
            }
        },

        renderFeedbackFilters: function() {
            const destEl = document.getElementById('destFilter');
            const leaderEl = document.getElementById('leaderFilter');
            const feedbacks = Array.isArray(DataStore.rawFeedbacks) ? DataStore.rawFeedbacks : [];

            const uniqueValues = (key) => {
                const seen = new Set();
                const values = [];
                feedbacks.forEach(item => {
                    const value = item && item[key] ? String(item[key]).trim() : '';
                    if (!value || seen.has(value)) return;
                    seen.add(value);
                    values.push(value);
                });
                return values.sort((a, b) => a.localeCompare(b, 'zh-Hant'));
            };

            const rebuildSelect = (selectEl, allLabel, values) => {
                if (!selectEl) return;
                const previousValue = selectEl.value || 'all';
                selectEl.innerHTML = `<option value="all">${allLabel}</option>` + values.map(value =>
                    `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
                ).join('');
                selectEl.value = values.includes(previousValue) ? previousValue : 'all';
            };

            rebuildSelect(destEl, '所有目的地', uniqueValues('dest'));
            rebuildSelect(leaderEl, '所有領隊', uniqueValues('leader'));
        },

        filterFeedback: function() {
            const destEl = document.getElementById('destFilter'); 
            const typeEl = document.getElementById('typeFilter');
            const leaderEl = document.getElementById('leaderFilter');
            const container = document.getElementById('feedbackGrid');
            const statusBar = document.getElementById('sentimentStatusBar'); 
            
            if (!container || !DataStore.rawFeedbacks) return;
            
            const dest = destEl ? destEl.value : 'all'; 
            const type = typeEl ? typeEl.value : 'all';
            const leader = leaderEl ? leaderEl.value : 'all';
            
            const filtered = DataStore.rawFeedbacks.filter(f => 
                (dest === 'all' || (f.dest && f.dest.includes(dest))) &&
                (type === 'all' || f.type === type) &&
                (leader === 'all' || f.leader === leader)
            );

            if(statusBar) {
                if (filtered.length === 0) {
                    statusBar.innerHTML = '';
                } else {
                    let posCount = 0, sugCount = 0, negCount = 0;
                    filtered.forEach(f => {
                        if(f.type === 'positive') posCount++;
                        else if(f.type === 'suggestion') sugCount++;
                        else if(f.type === 'negative') negCount++;
                    });
                    const total = filtered.length;
                    const posPct = ((posCount/total)*100).toFixed(1);
                    const sugPct = ((sugCount/total)*100).toFixed(1);
                    const negPct = ((negCount/total)*100).toFixed(1);

                    statusBar.innerHTML = `
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-bold text-[#252423]">情緒佔比結構分析 (Total: ${total} 則)</span>
                        </div>
                        <div class="w-full h-3 bg-[#e1dfdd] rounded-[2px] flex overflow-hidden mb-3 shadow-inner">
                            <div style="width: ${posPct}%; background-color: #00B8AA;" class="h-full transition-all duration-500"></div>
                            <div style="width: ${sugPct}%; background-color: #F2C80F;" class="h-full transition-all duration-500"></div>
                            <div style="width: ${negPct}%; background-color: #FD625E;" class="h-full transition-all duration-500"></div>
                        </div>
                        <div class="flex space-x-4 text-xs font-semibold">
                            <span style="color: #00B8AA;"><i class="fas fa-thumbs-up mr-1"></i>表揚 ${posPct}% (${posCount})</span>
                            <span style="color: #E66C37;"><i class="fas fa-lightbulb mr-1"></i>建議 ${sugPct}% (${sugCount})</span>
                            <span style="color: #FD625E;"><i class="fas fa-exclamation-triangle mr-1"></i>投訴 ${negPct}% (${negCount})</span>
                        </div>
                    `;
                }
            }

            if (filtered.length === 0) { 
                container.innerHTML = '<div class="col-span-full text-center text-gray-400 py-10">沒有符合條件的留言記錄</div>'; 
                return; 
            }
            
            container.innerHTML = filtered.map(f => {
                const borderClass = f.type === 'positive' ? 'border-l-4 border-l-[#00B8AA]' : (f.type === 'suggestion' ? 'border-l-4 border-l-[#F2C80F]' : 'border-l-4 border-l-[#FD625E]');
                const icon = f.type === 'positive' ? '<i class="fas fa-thumbs-up text-[#00B8AA]"></i>' : (f.type === 'suggestion' ? '<i class="fas fa-lightbulb text-[#F2C80F]"></i>' : '<i class="fas fa-exclamation-triangle text-[#FD625E]"></i>');
                const typeText = f.type === 'positive' ? '表揚' : (f.type === 'suggestion' ? '建議' : '投訴');
                const typeColor = f.type === 'positive' ? 'text-[#00B8AA] bg-[#00B8AA]/10' : (f.type === 'suggestion' ? 'text-[#E66C37] bg-[#F2C80F]/20' : 'text-[#FD625E] bg-[#FD625E]/10');
                const tourLabel = f.tourNo ? `<div class="text-xs font-semibold text-gray-500 mt-1"><i class="fas fa-ticket-alt mr-1"></i> 團號: ${escapeHTML(f.tourNo)}</div>` : '';
                return `
                <div class="bg-[#faf9f8] rounded-[2px] shadow-sm border border-gray-200 p-5 ${borderClass} card-hover">
                    <div class="flex justify-between items-start mb-3">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-[2px] text-xs font-medium ${typeColor}">${icon} <span class="ml-1">${typeText}</span></span>
                        <div class="text-right"><div class="text-xs font-bold text-gray-500">${escapeHTML(f.dest || '未知')}</div></div>
                    </div>
                    <p class="text-[#252423] text-sm italic leading-relaxed mb-4 whitespace-pre-wrap">"${escapeHTML(f.content)}"</p>
                    <div class="flex items-center justify-between pt-3 border-t border-[#e1dfdd]">
                        <div class="flex items-center text-xs text-gray-500"><i class="fas fa-user-circle mr-1"></i> 領隊: ${escapeHTML(f.leader || '未提供')}</div>
                        ${tourLabel}
                    </div>
                </div>`;
            }).join('');
        },

        filterSatChart: function(destinationName) {
            if(!satCrossChart || !DataStore.satisfactionCrossData) return;
            const index = DataStore.satisfactionCrossData.labels.indexOf(destinationName);
            if(index === -1) return;
            satCrossChart.data.labels = [destinationName];
            satCrossChart.data.datasets.forEach(dataset => {
                const originalDataset = DataStore.satisfactionCrossData.datasets.find(d => d.label === dataset.label);
                if (originalDataset) dataset.data = [originalDataset.data[index]];
            });
            satCrossChart.update();
            const resetBtn = document.getElementById('resetBtn'); const subtitle = document.getElementById('crossChartSubtitle');
            if(resetBtn) resetBtn.classList.remove('hidden');
            if(subtitle) subtitle.innerText = `分析：單一目的地 [${escapeHTML(destinationName)}] 在各年齡層的平均滿意度得分`;
        },

        resetDrillDown: function() {
            if(!satCrossChart || !DataStore.satisfactionCrossData) return;
            satCrossChart.data.labels = DataStore.satisfactionCrossData.labels;
            satCrossChart.data.datasets.forEach((dataset, i) => { dataset.data = DataStore.satisfactionCrossData.datasets[i]?.data || []; });
            satCrossChart.update();
            const resetBtn = document.getElementById('resetBtn'); const subtitle = document.getElementById('crossChartSubtitle');
            if(resetBtn) resetBtn.classList.add('hidden');
            if(subtitle) subtitle.innerText = "分析：不同年齡層在各目的地的平均滿意度得分 (Score: 0-10)";
        },

        setSatCrossChart: function(chart) { satCrossChart = chart; },

        initCharts: function() {
            // 核心對抗性審查：防止 Chart.js Canvas 記憶體洩漏 (Memory Leak / Overlapping)
            const initChartSafe = (canvasId, config) => {
                const canvas = document.getElementById(canvasId);
                if(canvas) { 
                    try { 
                        // 若已存在舊圖表，則必須先銷毀，避免疊加與佔用資源
                        const existingChart = Chart.getChart(canvas);
                        if (existingChart) existingChart.destroy();
                        return new Chart(canvas, config); 
                    } catch(e) { 
                        console.warn(`Chart failed to init on ${canvasId}:`, e); 
                    } 
                }
                return null;
            };

            const pbi1 = '#118DFF'; // Blue
            const pbi2 = '#12239E'; // Dark Blue
            const pbi3 = '#E66C37'; // Orange
            const pbi4 = '#00B8AA'; // Teal
            const pbi5 = '#6B007B'; // Purple
            const pbi6 = '#E044A7'; // Pink
            const pbi7 = '#F2C80F'; // Yellow
            const pbi8 = '#FD625E'; // Red (Negative)
            const pbiPalette = [pbi1, pbi2, pbi3, pbi4, pbi5, pbi6, pbi7];
            const softGrey = '#c8c6c4';
            const maxFrom = (values, fallback) => Math.max(fallback, ...(values || []).filter(v => Number.isFinite(v)));
            const npsThreshold = DataStore.npsCorrelationData?.threshold || { x: 0.380, y: 4.45 };

            const crosshairPlugin = {
                id: 'quadrantCrosshair',
                beforeDraw: (chart) => {
                    if (chart.config.options.plugins.quadrantCrosshair === false) return;
                    const {ctx, chartArea: {top, bottom, left, right}, scales: {x, y}} = chart;
                    ctx.save();
                    ctx.strokeStyle = '#a19f9d';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);

                    const xPos = x.getPixelForValue(npsThreshold.x);
                    const yPos = y.getPixelForValue(npsThreshold.y);

                    if (!isNaN(xPos)) {
                        ctx.beginPath(); ctx.moveTo(xPos, top); ctx.lineTo(xPos, bottom); ctx.stroke();
                    }
                    if (!isNaN(yPos)) {
                        ctx.beginPath(); ctx.moveTo(left, yPos); ctx.lineTo(right, yPos); ctx.stroke();
                    }
                    ctx.restore();
                }
            };
            Chart.register(crosshairPlugin);

            const genderData = DataStore.genderData || { labels: ['女 (Female)', '男 (Male)'], values: [114, 93] };
            initChartSafe('genderChart', { type: 'pie', data: { labels: genderData.labels, datasets: [{ data: genderData.values, backgroundColor: [pbi6, pbi1, softGrey], borderWidth: 1, borderColor: '#fff', datalabels: { formatter: (val) => val + " 人" } }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' }, quadrantCrosshair: false } } });

            const ageData = DataStore.ageData || { labels: ['18歲或以下', '19-25', '26-35', '36-45', '46-55', '56-65', '66+'], values: [4, 2, 8, 25, 45, 56, 52] };
            initChartSafe('ageChart', { type: 'bar', data: { labels: ageData.labels, datasets: [{ label: '人數', data: ageData.values, backgroundColor: pbi1, borderRadius: 0, datalabels: { anchor: 'end', align: 'top', color: '#605e5c', font: { weight: 'bold', size: 12 }, formatter: (val) => val > 0 ? val + " 人" : "" } }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, quadrantCrosshair: false }, scales: { y: { display: false, max: maxFrom(ageData.values, 70) }, x: { grid: { display: false } } } } });

            const memberConsentCrossData = DataStore.memberConsentCrossData || { labels: ['是會員', '非會員'], datasets: [{ label: '同意', data: [11, 59] }, { label: '不同意', data: [5, 144] }] };
            initChartSafe('memberConsentCrossChart', { type: 'bar', data: { labels: memberConsentCrossData.labels, datasets: memberConsentCrossData.datasets.map((dataset, idx) => ({ ...dataset, backgroundColor: idx === 0 ? pbi4 : softGrey, stack: 'Stack 0', borderRadius: 0 })) }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { position: 'top' }, quadrantCrosshair: false, datalabels: { color: function(ctx) { return ctx.datasetIndex === 0 ? '#fff' : '#252423'; }, font: { weight: 'bold' }, formatter: (val, ctx) => { let total = ctx.chart.data.datasets.reduce((sum, dataset) => sum + (Number(dataset.data[ctx.dataIndex]) || 0), 0); return total ? val + "人 (" + ((val/total)*100).toFixed(1) + "%)" : ""; } } }, scales: { x: { stacked: true, grid: { display: false }, max: maxFrom(memberConsentCrossData.labels.map((_, idx) => memberConsentCrossData.datasets.reduce((sum, dataset) => sum + (Number(dataset.data[idx]) || 0), 0)), 250) }, y: { stacked: true, grid: { display: false } } } } });

            const satisfactionDistributionData = DataStore.satisfactionDistributionData || { labels: ['旅車司機', '交通', '隨團領隊', '當地導遊', '觀光節目安排', '酒店', '餐廳及膳食', '購物安排', '自費活動安排'], datasets: [{ label: '非常滿意/滿意', data: [222, 218, 217, 213, 206, 199, 181, 161, 140] }, { label: '普通', data: [1, 5, 6, 8, 16, 18, 38, 30, 28] }, { label: '非常不滿意/不滿意', data: [0, 0, 0, 0, 0, 0, 0, 0, 0] }] };
            const satisfactionMax = maxFrom(satisfactionDistributionData.labels.map((_, idx) => satisfactionDistributionData.datasets.reduce((sum, dataset) => sum + (Number(dataset.data[idx]) || 0), 0)), 250);
            initChartSafe('satisfactionChart', { type: 'bar', data: { labels: satisfactionDistributionData.labels, datasets: satisfactionDistributionData.datasets.map((dataset, idx) => ({ ...dataset, backgroundColor: idx === 0 ? pbi1 : (idx === 1 ? '#e1dfdd' : pbi8), borderRadius: 0, datalabels: idx === 0 ? { align: 'center', anchor: 'center', color: '#fff' } : (idx === 1 ? { color: '#252423', align: 'center', anchor: 'center', formatter: (val) => val > 0 ? val : '' } : { display: false }) })) }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, quadrantCrosshair: false }, scales: { x: { stacked: true, grid: { display: false }, max: satisfactionMax }, y: { stacked: true, grid: { display: false } } } } });

            const destAgeCrossData = DataStore.destAgeCrossData || { labels: ['韓國', '張家界', '桂林', '雲南', '北京'], datasets: [{ label: '18歲或以下', data: [0, 0, 0, 0, 0] }, { label: '19-25歲', data: [0, 0, 0, 0, 0] }, { label: '26-35歲', data: [0, 1, 1, 0, 1] }, { label: '36-45歲', data: [10, 3, 1, 0, 3] }, { label: '46-55歲', data: [11, 6, 9, 7, 1] }, { label: '56-65歲', data: [10, 17, 8, 6, 3] }, { label: '66歲或以上', data: [0, 0, 0, 0, 0] }] };
            const destAgeTotals = destAgeCrossData.totals || destAgeCrossData.labels.map((_, idx) => destAgeCrossData.datasets.reduce((sum, dataset) => sum + (Number(dataset.data[idx]) || 0), 0));
            initChartSafe('destAgeCrossChart', { type: 'bar', data: { labels: destAgeCrossData.labels, datasets: destAgeCrossData.datasets.map((dataset, idx) => ({ ...dataset, backgroundColor: idx === 0 ? '#323130' : (pbiPalette[idx % pbiPalette.length] || softGrey), stack: 'stack1' })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, quadrantCrosshair: false, datalabels: { display: function(ctx) { return ctx.dataset.data[ctx.dataIndex] > 0; }, anchor: 'center', align: 'center', color: '#fff' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, max: maxFrom(destAgeTotals, 35), grid: { display: true } } } } });

            if(DataStore.sourceData) { initChartSafe('sourceChart', { type: 'bar', data: { labels: DataStore.sourceData.labels, datasets: [{ data: DataStore.sourceData.values, backgroundColor: pbi1, borderRadius: 0 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 80 } }, plugins: { legend: { display: false }, quadrantCrosshair: false, datalabels: { anchor: 'end', align: 'right', color: '#252423', font: { weight: 'bold' }, formatter: (val, ctx) => val + ' (' + DataStore.sourceData.pcts[ctx.dataIndex] + ')' } }, scales: { x: { display: false, max: 110 }, y: { grid: { display: false } } } } }); }
            if(DataStore.channelData) { initChartSafe('channelChart', { type: 'doughnut', data: { labels: DataStore.channelData.labels, datasets: [{ data: DataStore.channelData.values, backgroundColor: [pbi1, pbi4, pbi3, pbi7, pbi8], borderWidth: 1, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', layout: { padding: 20 }, plugins: { legend: { position: 'bottom' }, quadrantCrosshair: false, datalabels: { color: function(ctx) { return ctx.dataIndex === 0 ? '#fff' : '#252423'; }, anchor: function(ctx) { return ctx.dataIndex === 0 ? 'center' : 'end'; }, align: function(ctx) { return ctx.dataIndex === 0 ? 'center' : 'end'; }, font: { weight: 'bold' }, formatter: (val, ctx) => val > 5 ? DataStore.channelData.pcts[ctx.dataIndex] : '' } } } }); }
            
            if(DataStore.salesData) {
                const { history_labels, history_values, forecast_labels, forecast_values } = DataStore.salesData;
                const labels = history_labels.concat(forecast_labels);
                const chartHistoryData = history_values.concat(Array(forecast_values.length).fill(null));
                const lastHistoryVal = history_values[history_values.length - 1];
                const forecastData = Array(history_values.length - 1).fill(null);
                forecastData.push(lastHistoryVal);
                forecastData.push.apply(forecastData, forecast_values);
                initChartSafe('salesForecastChart', { type: 'line', data: { labels: labels, datasets: [ { label: '歷史實際銷售額 (HKD)', data: chartHistoryData, borderColor: pbi1, backgroundColor: pbi1+'1a', fill: true, tension: 0, pointRadius: 4, datalabels: { display: true, color: '#252423', align: 'top', anchor: 'end', font: { weight: 'bold', size: 10 }, formatter: (val) => val ? (val/10000).toFixed(1) + '萬' : '' } }, { label: 'AI 預測銷售額 (HKD)', data: forecastData, borderColor: pbi4, borderDash: [5, 5], pointBackgroundColor: '#fff', pointBorderColor: pbi4, fill: false, tension: 0, pointRadius: 4, datalabels: { display: true, color: '#252423', align: 'top', anchor: 'end', font: { weight: 'bold', size: 10 }, formatter: (val) => val ? (val/10000).toFixed(1) + '萬' : '' } } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' }, quadrantCrosshair: false, tooltip: { callbacks: { label: function(ctx) { let l = ctx.dataset.label || ''; if(l) return l + ': ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'HKD' }).format(ctx.parsed.y); return null; } } } }, scales: { y: { beginAtZero: false, title: { display: true, text: '銷售金額 (HKD)' } }, x: { grid: { display: false } } } } });
            }
            
            if(DataStore.customerSegments) { initChartSafe('rfmChart', { type: 'pie', data: { labels: Object.keys(DataStore.customerSegments), datasets: [{ data: Object.values(DataStore.customerSegments), backgroundColor: [pbi1, pbi4, pbi8], borderWidth: 1, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' }, quadrantCrosshair: false, datalabels: { color: '#fff', font: { weight: 'bold' }, formatter: (val) => val + '%' } } } }); }
            
            if(DataStore.satisfactionCrossData) {
                const crossData = JSON.parse(JSON.stringify(DataStore.satisfactionCrossData));
                const pointStyles = ['circle', 'triangle', 'rect', 'rectRot', 'star', 'crossRot', 'rectRounded'];
                crossData.datasets.forEach((ds, idx) => {
                    ds.type = 'line';
                    ds.showLine = false; 
                    ds.pointRadius = 7; 
                    ds.pointHoverRadius = 10;
                    ds.backgroundColor = pbiPalette[idx % pbiPalette.length];
                    ds.pointBackgroundColor = ds.backgroundColor + '80'; 
                    ds.pointBorderColor = ds.backgroundColor; 
                    ds.pointBorderWidth = 2;
                    ds.pointStyle = pointStyles[idx % pointStyles.length]; 
                });
                const crossChart = initChartSafe('satisfactionCrossChart', { type: 'line', data: crossData, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 15 } }, datalabels: { display: false }, quadrantCrosshair: false, tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y + ' 分'; } } } }, scales: { y: { beginAtZero: false, min: 3, max: 10, grid: { display: true, color: '#f3f2f1' } }, x: { offset: true, grid: { display: true, drawOnChartArea: true, color: '#e1dfdd', borderDash: [5, 5], drawTicks: false } } } } });
                if(crossChart) DashboardApp.setSatCrossChart(crossChart);
            }

            const npsCorrelationData = DataStore.npsCorrelationData || { threshold: npsThreshold, points: [ { x: 0.521, y: 4.673, item: '隨團領隊' }, { x: 0.392, y: 4.715, item: '當地導遊' }, { x: 0.277, y: 4.776, item: '旅車司機' }, { x: 0.388, y: 4.632, item: '交通' }, { x: 0.364, y: 4.415, item: '酒店' }, { x: 0.380, y: 4.228, item: '餐廳及膳食' }, { x: 0.400, y: 4.225, item: '購物安排' }, { x: 0.350, y: 4.450, item: '觀光節目安排' }, { x: 0.293, y: 4.280, item: '自費活動安排' } ] };
            initChartSafe('npsCorrelationChart', { type: 'scatter', data: { datasets: [{ label: '服務環節', data: npsCorrelationData.points, backgroundColor: (ctx) => { const val = ctx.raw; if (!val) return '#ccc'; if (val.x > npsThreshold.x && val.y < npsThreshold.y) return pbi8; if (val.x > npsThreshold.x && val.y >= npsThreshold.y) return pbi4; if (val.x <= npsThreshold.x && val.y >= npsThreshold.y) return pbi1; return softGrey; }, pointRadius: 8, pointHoverRadius: 10 }] }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 25, right: 30, left: 15, bottom: 10 } }, plugins: { legend: { display: false }, quadrantCrosshair: true, datalabels: { display: true, align: 'top', anchor: 'end', offset: 4, color: '#252423', font: { weight: 'bold', size: 11 }, formatter: (val) => val.item }, tooltip: { callbacks: { label: (ctx) => `${ctx.raw.item}: 滿意度 ${ctx.raw.y.toFixed(2)}, 影響力 ${ctx.raw.x.toFixed(3)}` } } }, scales: { x: { title: { display: true, text: '對總分影響力 / 相關性 (Importance)', font: { weight: 'bold' } }, min: 0.2, max: 0.6 }, y: { title: { display: true, text: '平均滿意度評分 (Satisfaction: 1-5分)', font: { weight: 'bold' } }, min: 4.0, max: 5.0 } } } });
            
            const topDestData = DataStore.topDestData || { labels: ['韓國', '張家界', '桂林', '雲南', '北京'], values: [52, 39, 32, 24, 14] };
            const topDestChart = initChartSafe('topDestChart', { type: 'bar', data: { labels: topDestData.labels, datasets: [{ label: '出團數量', data: topDestData.values, backgroundColor: (ctx) => ctx.dataIndex < 3 ? pbi1 : (ctx.dataIndex < 6 ? '#71B9F5' : softGrey), borderRadius: 0, barThickness: 20 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, onClick: (e, activeEls) => { if(activeEls.length > 0) { DashboardApp.filterSatChart(topDestChart.data.labels[activeEls[0].index]); } else { DashboardApp.resetDrillDown(); } }, onHover: (e, el) => { e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; }, plugins: { legend: { display: false }, quadrantCrosshair: false, datalabels: { anchor: 'end', align: 'end', color: '#252423', formatter: (val) => val + "人" } }, scales: { x: { display: false, max: maxFrom(topDestData.values, 60) }, y: { grid: { display: false } } } } });
            
            const durationDistData = DataStore.durationDistData || { labels: ['短線 (1-4天)', '中長線 (5-7天)', '長線 (8天或以上)'], values: [33, 151, 36] };
            initChartSafe('durationDistChart', { type: 'doughnut', data: { labels: durationDistData.labels, datasets: [{ data: durationDistData.values, backgroundColor: [pbi4, pbi1, pbi2], borderWidth: 0, datalabels: { color: '#fff', font: { weight: 'bold' }, formatter: (val, ctx) => { let total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0); return total ? ((val/total)*100).toFixed(1) + "%" : ""; } } }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false }, quadrantCrosshair: false } } });

            if(DataStore.futureDestData) { initChartSafe('futureDestChart', { type: 'bar', data: { labels: DataStore.futureDestData.labels, datasets: [{ data: DataStore.futureDestData.values, backgroundColor: (ctx) => { return ctx.dataIndex < 3 ? pbi1 : (ctx.dataIndex < 6 ? pbi4 : '#c8c6c4'); }, borderRadius: 0 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 40 } }, plugins: { legend: { display: false }, quadrantCrosshair: false, datalabels: { anchor: 'end', align: 'right', color: '#252423', font: { weight: 'bold' }, formatter: (val) => val } }, scales: { x: { display: false, max: 60 }, y: { grid: { display: false } } } } }); }
            if(DataStore.npsDistData) { initChartSafe('npsDistChart', { type: 'doughnut', data: { labels: DataStore.npsDistData.labels, datasets: [{ data: DataStore.npsDistData.values, backgroundColor: [pbi1, pbi8], borderWidth: 1, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right', labels: { boxWidth: 12 } }, quadrantCrosshair: false, datalabels: { display: false } } } }); }
            if(DataStore.npsScoreData) { initChartSafe('npsScoreChart', { type: 'bar', data: { labels: DataStore.npsScoreData.labels, datasets: [{ data: DataStore.npsScoreData.values, backgroundColor: pbi4, borderRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, quadrantCrosshair: false, datalabels: { anchor: 'end', align: 'top', color: '#252423', font: { weight: 'bold' }, formatter: (val) => val } }, scales: { y: { display: false, max: 180 }, x: { grid: { display: false } } } } }); }
        }
    };
})();


window.DashboardApp = DashboardApp;

// 智能啟動器
async function bootApp() {
    showLoadingOverlay('正在載入數據庫...', '正在讀取本地 JSON 數據源並初始化圖表引擎，請稍候...');

    if (typeof Chart === 'undefined' || typeof ChartDataLabels === 'undefined') {
        console.warn("資源尚未就緒，500ms 後重試...");
        setTimeout(bootApp, 500);
        return;
    }

    try {
        const selector = document.getElementById('globalMonthSelector');
        await fetchMonthData(selector ? selector.value : currentMonthKey);

        Chart.register(ChartDataLabels);
        Chart.defaults.font.family = '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';
        Chart.defaults.color = '#605e5c';
        Chart.defaults.set('plugins.datalabels', { color: '#ffffff', font: { weight: '600', size: 11 }, display: 'auto' });
        Chart.defaults.set('plugins.tooltip', { backgroundColor: '#252423', titleColor: '#ffffff', bodyColor: '#ffffff', cornerRadius: 2, padding: 10 });

        DashboardApp.init();
    } catch (error) {
        console.error('Dashboard boot failed:', error);
        showDashboardError(error.message);
    } finally {
        hideLoadingOverlay();
    }
}

// 捕捉全局 JS 錯誤並顯示提示
window.onerror = function(msg) {
    const errorBoundary = document.getElementById('js-error-boundary');
    if (errorBoundary) {
        errorBoundary.classList.remove('hidden');
    }
    console.error("Dashboard Global Error: ", msg);
};

if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
}
