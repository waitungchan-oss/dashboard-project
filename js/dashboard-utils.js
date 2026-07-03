export const getValidTourDays = (tour) => {
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

export const destroyAllCharts = () => {
    if (typeof Chart === 'undefined' || typeof Chart.getChart !== 'function') return;
    document.querySelectorAll('canvas').forEach((canvas) => {
        const chart = Chart.getChart(canvas);
        if (chart) chart.destroy();
    });
};
