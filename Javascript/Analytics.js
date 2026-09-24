/* =====================================================
   YESUNIM — DATA ANALYTICS PAGE LOGIC
   Reads from the same localStorage the other pages
   already write to:
     - yesunim_transactions   (Sales page)
     - yesunim_inventoryItems (Inventory page)
     - yesunim_inventoryLogs  (Inventory page)

   NOTE ON "COST": there is currently no separate cost
   price stored anywhere (Inventory items only track a
   selling `price`). "Total Cost" here is an ESTIMATE:
   the value of stock restocked ("Stock In" logs) during
   the period, priced at each item's current price. If a
   real purchase-cost field gets added later, swap the
   calculation in computeCostEstimate() for the real one.
===================================================== */

(function () {

    const TRANSACTIONS_KEY = "yesunim_transactions";
    const INVENTORY_ITEMS_KEY = "yesunim_inventoryItems";
    const INVENTORY_LOGS_KEY = "yesunim_inventoryLogs";
    const LOW_STOCK_THRESHOLD = 5; // must match Inventory.js

    const DONUT_COLORS = ["#2e8b57", "#4a90d9", "#f0c14b", "#c0564f", "#8e6fc9"];

    let salesChart = null;
    let bestSellingChart = null;

    // ---------- ELEMENTS ----------

    const periodSelect = document.getElementById("analyticsPeriodSelect");
    const monthInput = document.getElementById("analyticsMonthInput");
    const filterBtn = document.getElementById("analyticsFilterBtn");
    const trendGranularitySelect = document.getElementById("trendGranularitySelect");

    const totalSalesValueEl = document.getElementById("totalSalesValue");
    const totalOrdersValueEl = document.getElementById("totalOrdersValue");
    const totalCostValueEl = document.getElementById("totalCostValue");
    const lowStockValueEl = document.getElementById("lowStockValue");

    const bestSellingLegendEl = document.getElementById("bestSellingLegend");
    const slowMovingListEl = document.getElementById("slowMovingList");

    const grossRevenueValueEl = document.getElementById("grossRevenueValue");
    const totalCostSummaryValueEl = document.getElementById("totalCostSummaryValue");
    const netRevenueValueEl = document.getElementById("netRevenueValue");
    const profitMarginValueEl = document.getElementById("profitMarginValue");

    const trendSummaryTotalEl = document.getElementById("trendSummaryTotal");
    const trendSummaryPeakEl = document.getElementById("trendSummaryPeak");
    const trendSummaryAvgEl = document.getElementById("trendSummaryAvg");

    // ---------- DATA LOADERS ----------

    function loadTransactions() {
        const saved = localStorage.getItem(TRANSACTIONS_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    function loadInventoryItems() {
        const saved = localStorage.getItem(INVENTORY_ITEMS_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    function loadInventoryLogs() {
        const saved = localStorage.getItem(INVENTORY_LOGS_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    // ---------- HELPERS ----------

    function currency(n) {
        return "₱" + (isNaN(n) ? 0 : n).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function dateKey(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function inRange(d, start, end) {
        return d >= start && d <= end;
    }

    // Range for the currently selected month/year period
    function getSelectedRange() {
        const period = periodSelect.value;
        const [yearStr, monthStr] = monthInput.value.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;

        if (period === "yearly") {
            const start = new Date(year, 0, 1, 0, 0, 0, 0);
            const end = new Date(year, 11, 31, 23, 59, 59, 999);
            return { start, end, year, month };
        }

        // monthly (default)
        const start = new Date(year, month, 1, 0, 0, 0, 0);
        const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
        return { start, end, year, month };
    }

    function getItemQty(lineItem) {
        // Sales.js stores each order line as { name, price, pax, lineTotal } —
        // "pax" IS the quantity for that item (e.g. price 279, pax 2 = 2 orders
        // of that item). Older/other shapes may use qty or quantity instead,
        // so check pax first since that's what this app actually writes.
        return Number(lineItem.pax ?? lineItem.qty ?? lineItem.quantity ?? 1) || 1;
    }

    // ---------- METRIC COMPUTATION ----------

    function computeSalesMetrics(transactions) {
        const totalSales = transactions.reduce((s, t) => s + (Number(t.total) || 0), 0);
        // Total Orders now counts every individual item quantity sold across
        // all transactions, instead of just the number of transactions/receipts.
        // Previously a single checkout containing 2+ items (or one item with
        // qty > 1) still only counted as 1 toward this stat.
        const totalOrders = transactions.reduce((sum, t) => {
            return sum + (t.items || []).reduce((s, li) => s + getItemQty(li), 0);
        }, 0);
        return { totalSales, totalOrders };
    }

    function computeLowStockCount(items) {
        return items.filter(i => {
            const stock = Number(i.stock) || 0;
            return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
        }).length;
    }

    // Total Cost for the currently selected period — mirrors the
    // Reports page's Inventory Report exactly: items with at least one
    // logged inventory action (any type — Added, Edited, Stock In/Out,
    // Deleted) within the selected month/year are considered "active"
    // for that period, and their unit Price is summed (NOT stock ×
    // price, just the Price column itself, same as the Total row on
    // that report). A period with no inventory activity correctly reads
    // ₱0.00 instead of repeating the same all-time number regardless of
    // which filter is picked. This is the single source of "Total Cost"
    // used everywhere on this page (the stat card above AND the Revenue
    // Summary panel below), so both always agree with each other and
    // with Reports → Inventory Reports for the same range.
    function computeCostEstimate(logs, items) {
        const activeNames = new Set(logs.map(l => l.itemName));

        return items
            .filter(i => activeNames.has(i.name))
            .reduce((sum, i) => sum + (Number(i.price) || 0), 0);
    }

    function computeItemSalesCounts(transactions) {
        const counts = {}; // name -> qty sold
        transactions.forEach(t => {
            (t.items || []).forEach(li => {
                const name = li.name || "Unknown Item";
                counts[name] = (counts[name] || 0) + getItemQty(li);
            });
        });
        return counts;
    }

    function computeBestSelling(transactions) {
        const counts = computeItemSalesCounts(transactions);
        const totalQty = Object.values(counts).reduce((s, v) => s + v, 0);

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, qty]) => ({
                name,
                qty,
                pct: totalQty ? Math.round((qty / totalQty) * 100) : 0
            }));
    }

    // Products that sold the least (or not at all) this period, out of
    // everything currently in inventory.
    function computeSlowMoving(items, transactions) {
        const counts = computeItemSalesCounts(transactions);

        return items
            .map(i => ({ name: i.name, qty: counts[i.name] || 0 }))
            .sort((a, b) => a.qty - b.qty)
            .slice(0, 5);
    }

    // ---------- SALES TREND DATA ----------

    function buildSalesTrendData(transactions, range, granularity) {
        const grouped = {};

        transactions.forEach(t => {
            const d = new Date(t.date);
            const key = granularity === "weekly"
                ? weekKey(d)
                : dateKey(d);
            grouped[key] = (grouped[key] || 0) + (Number(t.total) || 0);
        });

        const labels = Object.keys(grouped).sort();
        const values = labels.map(k => grouped[k]);

        const displayLabels = labels.map(k => {
            if (granularity === "weekly") return k;
            const d = new Date(k);
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        });

        return { labels: displayLabels, values };
    }

    function weekKey(d) {
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
    }

    // ---------- RENDER: STAT CARDS ----------

    function renderStatCards(metrics, lowStockCount) {
        totalSalesValueEl.textContent = currency(metrics.totalSales);
        totalOrdersValueEl.textContent = metrics.totalOrders;
        totalCostValueEl.textContent = currency(metrics.totalCost);
        lowStockValueEl.textContent = lowStockCount;
    }

    // ---------- RENDER: SALES TREND SUMMARY STRIP ----------

    function renderTrendSummary(trendData, granularity) {
        const values = trendData.values;
        const total = values.reduce((s, v) => s + v, 0);
        const avg = values.length ? total / values.length : 0;

        let peakIdx = -1;
        values.forEach((v, i) => {
            if (peakIdx === -1 || v > values[peakIdx]) peakIdx = i;
        });

        if (trendSummaryTotalEl) trendSummaryTotalEl.textContent = currency(total);
        if (trendSummaryAvgEl) trendSummaryAvgEl.textContent = currency(avg);

        if (trendSummaryPeakEl) {
            if (peakIdx === -1 || total <= 0) {
                trendSummaryPeakEl.textContent = "—";
            } else {
                const unit = granularity === "weekly" ? "" : "";
                trendSummaryPeakEl.textContent = `${trendData.labels[peakIdx]}${unit} · ${currency(values[peakIdx])}`;
            }
        }

        return peakIdx;
    }

    // ---------- RENDER: SALES TREND CHART ----------

    function renderSalesTrendChart(trendData, granularity) {
        const canvas = document.getElementById("salesTrendChart");
        const ctx = canvas.getContext("2d");

        if (salesChart) salesChart.destroy();

        const peakIdx = renderTrendSummary(trendData, granularity);

        if (trendData.labels.length === 0) {
            salesChart = null;
            return;
        }

        // One dot per data point, styled white-on-red like the Dashboard's
        // chart — except the single best day/week, which is drawn bigger
        // and gold so the peak is identifiable without hovering.
        const pointRadii = trendData.values.map((v, i) => (i === peakIdx && v > 0 ? 7 : 4));
        const pointColors = trendData.values.map((v, i) => (i === peakIdx && v > 0 ? "#d9a400" : "#ffffff"));
        const pointHoverRadii = pointRadii.map(r => r + 2);

        salesChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: trendData.labels,
                datasets: [{
                    label: "Sales",
                    data: trendData.values,
                    borderColor: "#8b0000",
                    borderWidth: 3,
                    // A vertical gradient fill instead of a flat tint —
                    // needs the chart's own rendering context, so it's
                    // built as a function rather than a fixed color.
                    backgroundColor: (context) => {
                        const { ctx: c, chartArea } = context.chart;
                        if (!chartArea) return "rgba(139, 0, 0, 0.08)";
                        const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, "rgba(139, 0, 0, 0.30)");
                        gradient.addColorStop(1, "rgba(139, 0, 0, 0)");
                        return gradient;
                    },
                    fill: true,
                    tension: 0.3,
                    pointRadius: pointRadii,
                    pointHoverRadius: pointHoverRadii,
                    pointBackgroundColor: pointColors,
                    pointBorderColor: "#8b0000",
                    pointBorderWidth: 2,
                    pointHoverBackgroundColor: "#8b0000",
                    pointHoverBorderColor: "#ffffff",
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "nearest", intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        backgroundColor: "#262626",
                        titleColor: "rgba(255, 255, 255, 0.7)",
                        titleFont: { size: 10, weight: "600" },
                        bodyColor: "#ffffff",
                        bodyFont: { size: 13, weight: "800" },
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: (item) => currency(item.parsed.y)
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: "#888", font: { size: 11, weight: "600" } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: "#f0f0f0" },
                        ticks: {
                            color: "#888",
                            font: { size: 11, weight: "600" },
                            callback: (v) => currency(v).replace(".00", "")
                        }
                    }
                }
            }
        });
    }

    // ---------- RENDER: BEST SELLING DONUT + LEGEND ----------

    function renderBestSelling(bestSelling) {
        const ctx = document.getElementById("bestSellingChart").getContext("2d");

        if (bestSellingChart) bestSellingChart.destroy();

        bestSellingLegendEl.innerHTML = "";

        if (bestSelling.length === 0) {
            bestSellingChart = null;
            bestSellingLegendEl.innerHTML = `<li class="empty-note">No sales recorded for this period.</li>`;
            return;
        }

        bestSellingChart = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: bestSelling.map(b => b.name),
                datasets: [{
                    data: bestSelling.map(b => b.qty),
                    backgroundColor: DONUT_COLORS,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                cutout: "62%"
            }
        });

        bestSellingLegendEl.innerHTML = bestSelling.map((b, i) => `
            <li>
                <span class="legend-dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>
                <span class="legend-name">${b.name}</span>
                <span class="legend-pct">${b.pct}%</span>
            </li>
        `).join("");
    }

    // ---------- RENDER: SLOW MOVING / TOP CUSTOMERS / REVENUE SUMMARY ----------

    function renderSlowMoving(slowMoving) {
        if (slowMoving.length === 0) {
            slowMovingListEl.innerHTML = `<li class="empty-note">No inventory items yet.</li>`;
            return;
        }
        slowMovingListEl.innerHTML = slowMoving.map(p => `<li>${p.name}</li>`).join("");
    }

    function renderRevenueSummary(metrics) {
        const netRevenue = metrics.totalSales - metrics.totalCost;
        const margin = metrics.totalSales ? (netRevenue / metrics.totalSales) * 100 : 0;

        grossRevenueValueEl.textContent = currency(metrics.totalSales);
        totalCostSummaryValueEl.textContent = currency(metrics.totalCost);
        netRevenueValueEl.textContent = currency(netRevenue);
        profitMarginValueEl.textContent = `${margin.toFixed(1)}%`;
    }

    // ---------- MAIN REFRESH ----------

    function refresh() {
        const { start, end } = getSelectedRange();
        const granularity = trendGranularitySelect.value;

        const items = loadInventoryItems();
        const allTransactions = loadTransactions();
        const allLogs = loadInventoryLogs();

        const transactions = allTransactions.filter(t => inRange(new Date(t.date), start, end));
        const logs = allLogs.filter(l => inRange(new Date(l.date), start, end));

        const salesMetrics = computeSalesMetrics(transactions);
        const totalCost = computeCostEstimate(logs, items);
        const metrics = { ...salesMetrics, totalCost };

        const lowStockCount = computeLowStockCount(items);
        const bestSelling = computeBestSelling(transactions);
        const slowMoving = computeSlowMoving(items, transactions);
        const trendData = buildSalesTrendData(transactions, { start, end }, granularity);

        renderStatCards(metrics, lowStockCount);
        renderSalesTrendChart(trendData, granularity);
        renderBestSelling(bestSelling);
        renderSlowMoving(slowMoving);
        renderRevenueSummary(metrics);
    }

    // ---------- DATE PICKER BOX — WHOLE-BOX CLICK ----------
    // Makes the entire .date-picker-box act as one button: clicking the
    // icon, the label text, the chevron, or the empty padding all open
    // the native month picker the same way. The mousedown handler stops
    // a click-and-slight-drag from highlighting text inside the box
    // first (which used to swallow the click and leave the picker
    // unopened) — paired with `user-select: none` in the CSS.
    function setupDatePickerBox() {
        const datePickerBox = document.querySelector(".date-picker-box");
        if (!datePickerBox) return;

        datePickerBox.addEventListener("mousedown", (e) => {
            if (e.target !== monthInput) {
                e.preventDefault();
            }
        });

        datePickerBox.addEventListener("click", (e) => {
            // Avoid double-firing if the user clicked the native input directly
            if (e.target === monthInput) return;

            if (typeof monthInput.showPicker === "function") {
                monthInput.showPicker();
            } else {
                // Fallback for browsers without showPicker() support
                monthInput.focus();
                monthInput.click();
            }
        });
    }

    // ---------- INIT ----------

    function init() {
        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        monthInput.value = defaultMonth;

        setupDatePickerBox();

        filterBtn.addEventListener("click", refresh);
        trendGranularitySelect.addEventListener("change", refresh);
        periodSelect.addEventListener("change", refresh);

        refresh();
    }

    document.addEventListener("DOMContentLoaded", init);

})();