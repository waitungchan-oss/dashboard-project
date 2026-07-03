// Shared DOM and string helpers used by the dashboard entrypoint.
export const escapeHTML = (str) => {
    if (str === null || str === undefined) return '-';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
};

export const showLoadingOverlay = (titleText, descText) => {
    const overlay = document.getElementById('loadingOverlay');
    const title = document.getElementById('loading-title');
    const desc = document.getElementById('loading-desc');
    if (title) title.innerText = titleText || '正在載入數據庫...';
    if (desc) desc.innerText = descText || '正在執行 API 數據提取與圖表重繪，請稍候...';
    if (overlay) overlay.style.display = 'flex';
};

export const hideLoadingOverlay = () => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
};

export const showDashboardError = (message) => {
    const errorBoundary = document.getElementById('js-error-boundary');
    const errorMsg = document.getElementById('js-error-msg');
    if (errorMsg) errorMsg.innerText = message || '部分圖表或資源加載緩慢，系統已自動修復並呈現可用數據。';
    if (errorBoundary) errorBoundary.classList.remove('hidden');
};

export const clearDashboardError = () => {
    const errorBoundary = document.getElementById('js-error-boundary');
    if (errorBoundary) errorBoundary.classList.add('hidden');
};

export const setHTML = (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== null && value !== undefined && value !== '') element.innerHTML = value;
};

export const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== null && value !== undefined && value !== '') element.innerText = value;
};

export const rememberFallback = (id) => {
    const element = document.getElementById(id);
    if (element && element.dataset.fallbackHtml === undefined) {
        element.dataset.fallbackHtml = element.innerHTML;
    }
};

export const restoreFallback = (id) => {
    const element = document.getElementById(id);
    if (element && element.dataset.fallbackHtml !== undefined) {
        element.innerHTML = element.dataset.fallbackHtml;
    }
};

export const renderListHTML = (items) => {
    if (!Array.isArray(items)) return '';
    return items.map(item => `<li>${item}</li>`).join('');
};
