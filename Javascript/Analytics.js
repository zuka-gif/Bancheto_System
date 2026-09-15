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
        return Number(lineItem.qty ?? lineItem.quantity ?? 1) || 1;
    }

    // ---------- METRIC COMPUTATION ----------

    function computeSalesMetrics(transactions) {
        const totalSales = transactions.reduce((s, t) => s + (Number(t.total) || 0), 0);
        const totalOrders = transactions.length;
        return { totalSales, totalOrders };
    }

    function computeLowStockCount(items) {
        return items.filter(i => {
            const stock = Number(i.stock) || 0;
            return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
        }).length;
    }

    // Estimated cost: value of stock restocked ("Stock In") during the
    // period, priced using each product's CURRENT price (see note above).
    function computeCostEstimate(logs, items) {
        const priceByName = {};
        items.forEach(i => { priceByName[i.name] = Number(i.price) || 0; });

        return logs
            .filter(l => l.action === "Stock In" && l.change > 0)
            .reduce((sum, l) => sum + l.change * (priceByName[l.itemName] || 0), 0);
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

    // ---------- RENDER: SALES TREND CHART ----------

    function renderSalesTrendChart(trendData) {
        const ctx = document.getElementById("salesTrendChart").getContext("2d");

        if (salesChart) salesChart.destroy();

        if (trendData.labels.length === 0) {
            salesChart = null;
            return;
        }

        salesChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: trendData.labels,
                datasets: [{
                    label: "Sales",
                    data: trendData.values,
                    borderColor: "#8b0000",
                    backgroundColor: "rgba(139, 0, 0, 0.08)",
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (v) => currency(v) }
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
        renderSalesTrendChart(trendData);
        renderBestSelling(bestSelling);
        renderSlowMoving(slowMoving);
        renderRevenueSummary(metrics);
    }

    // ---------- INIT ----------

    function init() {
        const now = new Date();
        const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        monthInput.value = defaultMonth;

        filterBtn.addEventListener("click", refresh);
        trendGranularitySelect.addEventListener("change", refresh);
        periodSelect.addEventListener("change", refresh);

        refresh();
    }

    document.addEventListener("DOMContentLoaded", init);

})();