/* =====================================================
   YESUNIM — DASHBOARD PAGE LOGIC
   Reads from the same localStorage the other pages
   already write to:
     - yesunim_transactions   (Sales page)
     - yesunim_inventoryItems (Inventory page)
     - yesunim_inventoryLogs  (Inventory page)

   Populates every [data-stat] span, the Sales Overview
   SVG chart, the Best Selling / Low Stock panels, and
   the Recent Activities table that are already sitting
   in Dashboard.html waiting for content.
===================================================== */

(function () {

    const TRANSACTIONS_KEY = "yesunim_transactions";
    const INVENTORY_ITEMS_KEY = "yesunim_inventoryItems";
    const INVENTORY_LOGS_KEY = "yesunim_inventoryLogs";
    const LOW_STOCK_THRESHOLD = 5; // must match Inventory.js

    // How many previous days to average when working out the
    // "vs. previous" percentage on the stat cards. Averaging over a
    // week stops one quiet day from producing a 1600% swing.
    const BASELINE_DAYS = 7;

    // ---------- ELEMENTS ----------

    const statEls = {
        sales: document.querySelector('[data-stat="sales"]'),
        salesChange: document.querySelector('[data-stat="sales-change"]'),
        orders: document.querySelector('[data-stat="orders"]'),
        ordersChange: document.querySelector('[data-stat="orders-change"]'),
        items: document.querySelector('[data-stat="items"]'),
        lowStock: document.querySelector('[data-stat="low-stock"]')
    };

    const salesLine = document.getElementById("sales-line");
    const chartYAxis = document.querySelector(".chart-y-axis");
    const chartXAxis = document.querySelector(".chart-x-axis");

    const bestSellingListEl = document.getElementById("best-selling-list");
    const lowStockListEl = document.getElementById("low-stock-list");
    const activitiesBodyEl = document.getElementById("activities-body");

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

    function startOfDay(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    }

    function endOfDay(d) {
        const x = new Date(d);
        x.setHours(23, 59, 59, 999);
        return x;
    }

    function isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    /* Inventory items have been saved under a few different shapes over
       time (stock/quantity/qty, unit/unitType). Reading them through
       these two helpers is what stops the Low Stock panel printing
       "undefined undefined left". */

    function getStock(item) {
        const raw = item.stock ?? item.quantity ?? item.qty ?? 0;
        const n = Number(raw);
        return isNaN(n) ? 0 : n;
    }

    function getUnit(item) {
        const raw = item.unit ?? item.unitType ?? item.measurement ?? "";
        const trimmed = String(raw).trim();
        return trimmed || "pcs";
    }

    function getItemQty(lineItem) {
        return Number(lineItem.qty ?? lineItem.quantity ?? 1) || 1;
    }

    /* Turns a current-vs-baseline pair into something a human can read.
       Returns { text, direction } where direction is 1, -1 or 0. */
    function formatChange(current, baseline) {
        // Nothing to compare against — a percentage would be meaningless
        // (dividing by zero), so say so plainly instead of inventing 100%.
        if (!baseline || baseline <= 0) {
            return {
                text: current > 0 ? "New" : "—",
                direction: current > 0 ? 1 : 0
            };
        }

        const pct = ((current - baseline) / baseline) * 100;
        const direction = pct > 0 ? 1 : (pct < 0 ? -1 : 0);

        return {
            text: Math.round(Math.abs(pct)) + "%",
            direction: direction
        };
    }

    // ---------- STAT CARDS ----------

    function renderStatChange(el, change) {
        if (!el) return;

        el.textContent = change.text;

        // Flip the arrow icon to match the direction of the change
        const iconEl = el.previousElementSibling; // the <i> arrow icon sits right before the span
        if (iconEl && iconEl.tagName === "I") {
            if (change.direction < 0) {
                iconEl.className = "bx bx-down-arrow-alt";
            } else if (change.direction > 0) {
                iconEl.className = "bx bx-up-arrow-alt";
            } else {
                iconEl.className = "bx bx-minus";
            }
        }
    }

    /* Average daily figure across the BASELINE_DAYS days *before* today. */
    function computeBaseline(transactions, valueFn) {
        const now = new Date();
        let total = 0;

        for (let i = 1; i <= BASELINE_DAYS; i++) {
            const day = new Date(now);
            day.setDate(day.getDate() - i);

            const dayStart = startOfDay(day);
            const dayEnd = endOfDay(day);

            const dayTx = transactions.filter(t => {
                const d = new Date(t.date);
                return d >= dayStart && d <= dayEnd;
            });

            total += valueFn(dayTx);
        }

        return total / BASELINE_DAYS;
    }

    function renderStatCards(items, transactions) {
        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);

        const todaysTx = transactions.filter(t => {
            const d = new Date(t.date);
            return d >= todayStart && d <= todayEnd;
        });

        const sumTotals = list => list.reduce((s, t) => s + (Number(t.total) || 0), 0);
        const countOrders = list => list.length;

        const todaySales = sumTotals(todaysTx);
        const todayOrders = countOrders(todaysTx);

        // Compare today against the 7-day daily average rather than
        // against yesterday alone.
        const baselineSales = computeBaseline(transactions, sumTotals);
        const baselineOrders = computeBaseline(transactions, countOrders);

        if (statEls.sales) statEls.sales.textContent = currency(todaySales);
        renderStatChange(statEls.salesChange, formatChange(todaySales, baselineSales));

        if (statEls.orders) statEls.orders.textContent = todayOrders;
        renderStatChange(statEls.ordersChange, formatChange(todayOrders, baselineOrders));

        const availableItems = items.filter(i => getStock(i) > 0).length;
        if (statEls.items) statEls.items.textContent = availableItems;

        const lowStockCount = items.filter(i => {
            const stock = getStock(i);
            return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
        }).length;
        if (statEls.lowStock) statEls.lowStock.textContent = lowStockCount;
    }

    // ---------- SALES OVERVIEW CHART (last 7 days) ----------

    function renderSalesChart(transactions) {
        const days = [];
        const now = new Date();

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            days.push(d);
        }

        const dailyTotals = days.map(d => {
            return transactions
                .filter(t => isSameDay(new Date(t.date), d))
                .reduce((s, t) => s + (Number(t.total) || 0), 0);
        });

        const maxValue = Math.max(...dailyTotals, 1);
        // Round the axis ceiling up to a "nice" number so labels aren't jagged
        const niceMax = Math.ceil(maxValue / 5) * 5 || 5;

        // ---- Y AXIS LABELS (7 labels, top = niceMax, bottom = 0) ----
        if (chartYAxis) {
            const ySpans = chartYAxis.querySelectorAll("span");
            const steps = ySpans.length - 1 || 1;
            ySpans.forEach((span, idx) => {
                const value = niceMax - (niceMax / steps) * idx;
                span.textContent = currency(value).replace(".00", "");
            });
        }

        // ---- X AXIS LABELS (weekday + date for each of the 7 days) ----
        if (chartXAxis) {
            const xSpans = chartXAxis.querySelectorAll("span");
            xSpans.forEach((span, idx) => {
                if (!days[idx]) return;
                span.textContent = days[idx].toLocaleDateString("en-US", { weekday: "long" });
            });
        }

        // ---- POLYLINE POINTS (viewBox is 600 x 250) ----
        if (salesLine) {
            const width = 600;
            const height = 250;
            const stepX = width / (dailyTotals.length - 1 || 1);

            const points = dailyTotals.map((val, idx) => {
                const x = idx * stepX;
                const y = height - (val / niceMax) * height;
                return `${x},${Math.max(0, Math.min(height, y))}`;
            }).join(" ");

            salesLine.setAttribute("points", points);
        }
    }

    // ---------- BEST SELLING PRODUCTS ----------

    function computeBestSelling(transactions) {
        const counts = {};
        transactions.forEach(t => {
            (t.items || []).forEach(li => {
                const name = li.name || "Unknown Item";
                counts[name] = (counts[name] || 0) + getItemQty(li);
            });
        });

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, qty]) => ({ name, qty }));
    }

    function renderBestSelling(transactions) {
        if (!bestSellingListEl) return;

        const bestSelling = computeBestSelling(transactions);

        if (bestSelling.length === 0) {
            bestSellingListEl.innerHTML = `<p style="padding:12px 0;color:#999;font-size:12px;">No sales recorded yet.</p>`;
            return;
        }

        bestSellingListEl.innerHTML = bestSelling.map((p, idx) => `
            <div class="product-item">
                <span class="product-number">${idx + 1}</span>
                <div class="product-image"></div>
                <div class="product-info">
                    <span>${p.name}</span>
                    <span>${p.qty} sold</span>
                </div>
            </div>
        `).join("");
    }

    // ---------- LOW STOCK ALERT ----------

    function renderLowStock(items) {
        if (!lowStockListEl) return;

        const lowItems = items
            .filter(i => getStock(i) <= LOW_STOCK_THRESHOLD)
            .sort((a, b) => getStock(a) - getStock(b))
            .slice(0, 5);

        if (lowItems.length === 0) {
            lowStockListEl.innerHTML = `<p style="padding:12px 0;color:#999;font-size:12px;">Everything is well stocked.</p>`;
            return;
        }

        lowStockListEl.innerHTML = lowItems.map(i => {
            const stock = getStock(i);
            const label = stock === 0 ? "Out of stock" : `${stock} ${getUnit(i)} left`;

            return `
                <div class="stock-item">
                    <div class="stock-image"></div>
                    <div class="stock-info">
                        <div>${i.name || "Unnamed item"}</div>
                        <div class="stock-quantity">${label}</div>
                    </div>
                </div>
            `;
        }).join("");
    }

    // ---------- RECENT ACTIVITIES ----------

    function getCurrentUserName() {
        // Best-effort: reuse whatever the profile popup already stores,
        // falling back to a generic label if nothing has been saved yet.
        try {
            const saved = localStorage.getItem("yesunim_profile");
            if (saved) {
                const profile = JSON.parse(saved);
                return profile.fullname || profile.username || "Admin";
            }
        } catch (e) { /* ignore malformed data */ }
        return "Admin";
    }

    function formatActivityTime(dateObj) {
        const now = new Date();
        if (isSameDay(dateObj, now)) {
            return dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        }
        return dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
            " " + dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    function buildActivityFeed(transactions, logs) {
        const userName = getCurrentUserName();
        const feed = [];

        transactions.forEach(t => {
            feed.push({
                date: new Date(t.date),
                user: userName,
                action: "New Order",
                module: "Sales",
                details: `Order total ${currency(Number(t.total) || 0)}`
            });
        });

        logs.forEach(l => {
            const change = Number(l.change) || 0;
            const changeText = change > 0 ? `+${change}` : `${change}`;
            const resulting = l.resultingStock ?? "—";

            feed.push({
                date: new Date(l.date),
                user: userName,
                action: l.action,
                module: "Inventory",
                details: `${l.itemName} (${changeText}, now ${resulting})`
            });
        });

        return feed.sort((a, b) => b.date - a.date).slice(0, 8);
    }

    function renderActivities(transactions, logs) {
        if (!activitiesBodyEl) return;

        const feed = buildActivityFeed(transactions, logs);

        if (feed.length === 0) {
            activitiesBodyEl.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#999;">No recent activity yet.</td></tr>`;
            return;
        }

        activitiesBodyEl.innerHTML = feed.map(entry => `
            <tr>
                <td>${formatActivityTime(entry.date)}</td>
                <td>${entry.user}</td>
                <td>${entry.action}</td>
                <td>${entry.module}</td>
                <td>${entry.details}</td>
            </tr>
        `).join("");
    }

    // ---------- VIEW ALL BUTTON NAVIGATION ----------

    function wireViewAllButtons() {
        document.querySelectorAll(".view-all-button").forEach(btn => {
            // The Low Stock stat card's button jumps to Inventory;
            // the Recent Activities button jumps to Reports.
            const goesToInventory = btn.closest(".stat-card");
            btn.addEventListener("click", () => {
                window.location.href = goesToInventory ? "Inventory.html" : "Reports.html";
            });
        });
    }

    // ---------- INIT ----------

    function refresh() {
        const items = loadInventoryItems();
        const transactions = loadTransactions();
        const logs = loadInventoryLogs();

        renderStatCards(items, transactions);
        renderSalesChart(transactions);
        renderBestSelling(transactions);
        renderLowStock(items);
        renderActivities(transactions, logs);
    }

    function init() {
        refresh();
        wireViewAllButtons();
    }

    document.addEventListener("DOMContentLoaded", init);

})();