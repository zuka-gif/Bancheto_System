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

    const TRANSACTIONS_KEY = "yesunim_transactions"; // unused now, kept only as a comment anchor
    const DISMISSED_NOTIFICATIONS_KEY = "yesunim_dismissedNotifications";
    const SETTINGS_KEY = "banchetoSettings"; // written by Profile_Setting.js
    const CURRENT_USER_KEY = "banchetoCurrentUser"; // set by script.js at Sign In
    const LOW_STOCK_THRESHOLD = 5; // must match Inventory.js

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
    const salesArea = document.getElementById("sales-area");
    const salesPointsGroup = document.getElementById("sales-points");
    const chartYAxis = document.querySelector(".chart-y-axis");
    const chartXAxis = document.querySelector(".chart-x-axis");
    const chartEl = document.querySelector(".chart");
    const salesTooltipEl = document.getElementById("salesTooltip");
    const salesPeakLabelEl = document.getElementById("salesPeakLabel");

    const salesSummaryTotalEl = document.getElementById("salesSummaryTotal");
    const salesSummaryBestDayEl = document.getElementById("salesSummaryBestDay");
    const salesSummaryAvgEl = document.getElementById("salesSummaryAvg");

    const bestSellingListEl = document.getElementById("best-selling-list");
    const lowStockListEl = document.getElementById("low-stock-list");
    const activitiesBodyEl = document.getElementById("activities-body");

    const notificationWrapEl = document.getElementById("notificationWrap");
    const notificationBtnEl = document.getElementById("notificationBtn");
    const notificationBadgeEl = document.getElementById("notificationBadge");
    const notificationDropdownEl = document.getElementById("notificationDropdown");
    const notificationListEl = document.getElementById("notificationList");
    const notificationCountTextEl = document.getElementById("notificationCountText");
    const notificationViewAllEl = document.getElementById("notificationViewAll");

    // ---------- DATA LOADERS ----------

    // Each loader below fetches from the real table and maps every row
    // into the SAME field names the localStorage version used
    // (date/total/items, date/action/itemName/resultingStock, etc.) —
    // that's what lets every render function further down the file stay
    // completely untouched.

    async function loadTransactions() {
        // Capped at the most recent 500 — plenty for the 7-day chart,
        // today/yesterday stat comparison, and the recent-activity feed,
        // without pulling a permanently-growing table into the browser
        // on every dashboard load.
        const { data, error } = await sb
            .from("transactions")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(500);

        if (error) {
            console.error("Could not load transactions:", error.message);
            return [];
        }

        return (data || []).map(row => ({
            id: row.id,
            date: row.created_at,
            role: row.role,
            items: row.items || [],
            subtotal: Number(row.subtotal) || 0,
            discount: Number(row.discount) || 0,
            total: Number(row.total) || 0,
            cashReceived: Number(row.cash_received) || 0,
            change: Number(row.change) || 0
        }));
    }

    async function loadInventoryItems() {
        const { data, error } = await sb
            .from("inventory_items")
            .select("*");

        if (error) {
            console.error("Could not load inventory:", error.message);
            return [];
        }

        return (data || []).map(row => ({
            id: row.id,
            name: row.name,
            category: row.category,
            stock: row.stock,
            unit: row.unit,
            price: Number(row.price) || 0
        }));
    }

    async function loadInventoryLogs() {
        const { data, error } = await sb
            .from("inventory_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) {
            console.error("Could not load inventory logs:", error.message);
            return [];
        }

        return (data || []).map(row => ({
            id: row.id,
            date: row.created_at,
            role: row.role,
            action: row.action,
            itemName: row.item_name,
            category: row.category,
            change: row.change,
            resultingStock: row.resulting_stock
        }));
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
        // Sales.js stores each order line as { name, price, pax, lineTotal } —
        // "pax" IS the quantity for that item (e.g. price 279, pax 2 = 2
        // orders of that item). Check pax first since that's what this app
        // actually writes; qty/quantity are kept as fallbacks for any other
        // transaction shape.
        return Number(lineItem.pax ?? lineItem.qty ?? lineItem.quantity ?? 1) || 1;
    }

    // Total number of individual orders (line-item quantities, i.e. pax)
    // across a whole transaction, not just "1 receipt = 1 order".
    function countOrders(transaction) {
        return (transaction.items || []).reduce((s, li) => s + getItemQty(li), 0);
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
            text: Math.abs(pct).toFixed(1) + "%",
            direction: direction
        };
    }

    // ---------- STAT CARDS ----------

    function renderStatChange(el, change) {
        if (!el) return;

        el.textContent = change.text;

        // The pill that wraps the arrow, the percentage and the label
        const pillEl = el.parentElement;
        if (pillEl) {
            pillEl.classList.remove("change-up", "change-down", "change-flat");
            pillEl.classList.add(
                change.direction > 0 ? "change-up" :
                change.direction < 0 ? "change-down" :
                "change-flat"
            );
        }

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

    /* Sum/count over a whole date range, not just a single day —
       used to build the comparison window below. */
    function totalsInRange(transactions, rangeStart, rangeEnd) {
        const inRange = transactions.filter(t => {
            const d = new Date(t.date);
            return d >= rangeStart && d <= rangeEnd;
        });

        return {
            sales: inRange.reduce((s, t) => s + (Number(t.total) || 0), 0),
            // Count every order (pax) on every receipt, not just the
            // number of receipts — a receipt with 2 pax on one item
            // now counts as 2 orders instead of 1.
            orders: inRange.reduce((s, t) => s + countOrders(t), 0)
        };
    }

    function renderStatCards(items, transactions) {
        const now = new Date();

        // The card itself shows TODAY's total, refreshed daily.
        const today = totalsInRange(transactions, startOfDay(now), endOfDay(now));

        // The percentage compares today against yesterday, matching the
        // "Since yesterday" label on the cards.
        const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const yesterday = totalsInRange(transactions, startOfDay(yesterdayDate), endOfDay(yesterdayDate));

        if (statEls.sales) statEls.sales.textContent = currency(today.sales);
        renderStatChange(statEls.salesChange, formatChange(today.sales, yesterday.sales));

        if (statEls.orders) statEls.orders.textContent = today.orders;
        renderStatChange(statEls.ordersChange, formatChange(today.orders, yesterday.orders));

        const availableItems = items.filter(i => getStock(i) > 0).length;
        if (statEls.items) statEls.items.textContent = availableItems;

        const lowStockCount = items.filter(i => {
            const stock = getStock(i);
            return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
        }).length;
        if (statEls.lowStock) statEls.lowStock.textContent = lowStockCount;
    }

    // ---------- SALES CHART TOOLTIP ----------

    function showSalesTooltip(targetEl, idx) {
        if (!salesTooltipEl || !chartEl) return;

        const dayDate = currentDays[idx];
        const value = currentDailyTotals[idx];
        const orders = currentDailyOrders[idx] || 0;
        if (!dayDate) return;

        const targetRect = targetEl.getBoundingClientRect();
        const containerRect = chartEl.getBoundingClientRect();

        const x = targetRect.left + targetRect.width / 2 - containerRect.left;
        // Never let the tooltip's anchor point go above the space it needs
        // to draw upward into — otherwise it gets clipped off the top of
        // the card when the point itself is near the chart's ceiling.
        const y = Math.max(targetRect.top - containerRect.top, 62);

        const dayLabel = dayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        const orderLabel = `${orders} order${orders === 1 ? "" : "s"}`;

        // Change vs the day before (the first day has nothing to compare to)
        let changeHtml = "";
        if (idx > 0) {
            const change = formatChange(value, currentDailyTotals[idx - 1]);

            if (change.text !== "—") {
                if (change.direction > 0) {
                    changeHtml = `<span class="tt-change tt-up">▲ ${change.text} vs prev day</span>`;
                } else if (change.direction < 0) {
                    changeHtml = `<span class="tt-change tt-down">▼ ${change.text} vs prev day</span>`;
                } else {
                    changeHtml = `<span class="tt-change">No change vs prev day</span>`;
                }
            }
        }

        salesTooltipEl.innerHTML =
            `<strong>${currency(value)}</strong>` +
            `<span>${dayLabel} · ${orderLabel}</span>` +
            changeHtml;
        placeGliding(salesTooltipEl, x, y);
    }

    // Moves a hover element (tooltip / guide line) to a new spot. When it's
    // already visible it glides there via the CSS transition; when it's
    // just appearing it jumps into place first and only fades in, so it
    // never swoops in from the top-left corner.
    function placeGliding(el, x, y) {
        const setPosition = () => {
            el.style.left = `${x}px`;
            if (y !== undefined) el.style.top = `${y}px`;
        };

        if (el.classList.contains("show")) {
            setPosition();
            return;
        }

        el.classList.add("no-glide");
        setPosition();
        void el.offsetWidth; // apply the jump before the transition comes back
        el.classList.add("show");

        requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.remove("no-glide"));
        });
    }

    function hideSalesTooltip() {
        if (salesTooltipEl) salesTooltipEl.classList.remove("show");
    }

    // Cache of the current best-day point so the callout badge can be
    // re-aligned on window resize (the SVG reflows, but the underlying
    // data hasn't changed) without needing a full chart re-render.
    let currentPeakIndex = -1;
    let currentPeakDay = null;
    let currentPeakValue = 0;

    // Latest chart data, so the hover handler always reads the current
    // week without needing a full re-render.
    let currentDays = [];
    let currentDailyTotals = [];
    let currentDailyOrders = [];

    function positionSalesPeakLabel() {
        if (!salesPeakLabelEl || !chartEl) return;

        if (currentPeakIndex < 0 || currentPeakValue <= 0) {
            salesPeakLabelEl.classList.remove("show");
            return;
        }

        const hitEl = document.querySelector(`.sales-point-hit[data-index="${currentPeakIndex}"]`);
        if (!hitEl) {
            salesPeakLabelEl.classList.remove("show");
            return;
        }

        const targetRect = hitEl.getBoundingClientRect();
        const containerRect = chartEl.getBoundingClientRect();

        const x = targetRect.left + targetRect.width / 2 - containerRect.left;
        const y = targetRect.top - containerRect.top;

        salesPeakLabelEl.textContent = currency(currentPeakValue);
        salesPeakLabelEl.style.left = `${x}px`;
        salesPeakLabelEl.style.top = `${y}px`;
        salesPeakLabelEl.classList.add("show");
    }

    // ---------- SMOOTH LINE ----------
    // Turns the 7 straight-line points into a smooth curve, the same
    // kind of curve Chart.js draws with tension 0.3 on the Analytics page.
    // It samples each curved segment into many tiny steps so the existing
    // <polyline> can draw it without any HTML changes.
    function buildSmoothPoints(coords, tension, height) {
        if (coords.length < 3) return coords.map(p => ({ x: p.x, y: p.y }));

        const controls = coords.map((p, i) => {
            const prev = coords[i - 1];
            const next = coords[i + 1];

            if (!prev || !next) return { before: p, after: p };

            const d01 = Math.hypot(p.x - prev.x, p.y - prev.y);
            const d12 = Math.hypot(next.x - p.x, next.y - p.y);
            const total = (d01 + d12) || 1;

            const fa = tension * d01 / total;
            const fb = tension * d12 / total;

            return {
                before: { x: p.x - fa * (next.x - prev.x), y: p.y - fa * (next.y - prev.y) },
                after: { x: p.x + fb * (next.x - prev.x), y: p.y + fb * (next.y - prev.y) }
            };
        });

        const steps = 16;
        const out = [];

        for (let i = 0; i < coords.length - 1; i++) {
            const p0 = coords[i];
            const p1 = controls[i].after;
            const p2 = controls[i + 1].before;
            const p3 = coords[i + 1];

            for (let s = 0; s < steps; s++) {
                const t = s / steps;
                const u = 1 - t;

                out.push({
                    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
                    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
                });
            }
        }

        const last = coords[coords.length - 1];
        out.push({ x: last.x, y: last.y });

        // Keep the curve inside the chart so it never dips below the baseline
        return out.map(p => ({ x: p.x, y: Math.max(0, Math.min(height, p.y)) }));
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

        const dailyOrders = days.map(d => {
            return transactions
                .filter(t => isSameDay(new Date(t.date), d))
                .reduce((s, t) => s + countOrders(t), 0);
        });

        const maxValue = Math.max(...dailyTotals, 1);
        // Round the axis ceiling up to a "nice" number, with ~15% headroom
        // built in above the actual highest value. Without this, the
        // tallest point sits flush against the very top of the chart with
        // nowhere for its dot (or the peak-day callout) to breathe.
        const niceMax = Math.ceil((maxValue * 1.15) / 5) * 5 || 5;

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
            // Same denominator the SVG uses for stepX below (days.length - 1),
            // so each label's "left" percentage lands on the exact same
            // coordinate as its point on the line — not on flexbox's own
            // (text-width-dependent) idea of "evenly spaced".
            const lastIdx = xSpans.length - 1 || 1;
            xSpans.forEach((span, idx) => {
                if (!days[idx]) return;
                span.textContent = days[idx].toLocaleDateString("en-US", { weekday: "long" });
                span.style.left = `${(idx / lastIdx) * 100}%`;
                // Today (the last day) gets a stronger label
                span.classList.toggle("chart-x-today", idx === days.length - 1);
            });
        }

        // ---- POLYLINE POINTS (viewBox is 600 x 250) ----
        if (salesLine) {
            const width = 600;
            const height = 250;
            const stepX = width / (dailyTotals.length - 1 || 1);

            const coords = dailyTotals.map((val, idx) => {
                const x = idx * stepX;
                const y = height - (val / niceMax) * height;
                return { x, y: Math.max(0, Math.min(height, y)) };
            });

            const smooth = buildSmoothPoints(coords, 0.3, height);
            const pointsAttr = smooth.map(p => `${p.x},${p.y}`).join(" ");
            salesLine.setAttribute("points", pointsAttr);

            // The area fill closes the shape by dropping down to the
            // baseline at the last point and back along the bottom edge.
            if (salesArea) {
                const areaPoints = `${pointsAttr} ${width},${height} 0,${height}`;
                salesArea.setAttribute("points", areaPoints);
            }

            // A small dot at each day makes individual values legible
            // instead of leaving people to guess from the line alone.
            // Each dot is paired with a larger, invisible "hit" circle —
            // the visible dot alone is too small a target to hover
            // reliably — which drives the tooltip and the dot's grow
            // effect together.
            if (salesPointsGroup) {
                // The best day gets its own class so it can be drawn
                // bigger and gold, like the peak dot on Analytics.
                const peakIdx = dailyTotals.some(v => v > 0)
                    ? dailyTotals.indexOf(Math.max(...dailyTotals))
                    : -1;

                salesPointsGroup.innerHTML = coords.map((p, idx) => `
                    <circle class="sales-point${idx === peakIdx ? " sales-point-peak" : ""}" data-index="${idx}" cx="${p.x}" cy="${p.y}" r="4"></circle>
                    <circle class="sales-point-hit" data-index="${idx}" cx="${p.x}" cy="${p.y}" r="12"></circle>
                `).join("");
            }
        }

        // ---- SUMMARY STRIP: This Week / Best Day / Daily Avg ----
        const weekTotal = dailyTotals.reduce((s, v) => s + v, 0);
        const dailyAvg = weekTotal / (dailyTotals.length || 1);

        let bestIdx = 0;
        dailyTotals.forEach((v, idx) => {
            if (v > dailyTotals[bestIdx]) bestIdx = idx;
        });

        if (salesSummaryTotalEl) salesSummaryTotalEl.textContent = currency(weekTotal);

        if (salesSummaryBestDayEl) {
            salesSummaryBestDayEl.textContent = weekTotal > 0
                ? `${days[bestIdx].toLocaleDateString("en-US", { weekday: "short" })} · ${currency(dailyTotals[bestIdx])}`
                : "—";
        }

        if (salesSummaryAvgEl) salesSummaryAvgEl.textContent = currency(dailyAvg);

        currentDays = days;
        currentDailyTotals = dailyTotals;
        currentDailyOrders = dailyOrders;

        currentPeakIndex = weekTotal > 0 ? bestIdx : -1;
        currentPeakDay = weekTotal > 0 ? days[bestIdx] : null;
        currentPeakValue = weekTotal > 0 ? dailyTotals[bestIdx] : 0;

        // Position after the browser has actually laid out the new
        // points — otherwise getBoundingClientRect can read stale
        // coordinates from before this render.
        requestAnimationFrame(positionSalesPeakLabel);
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
                    <div class="stock-name">${i.name || "Unnamed item"}</div>
                    <div class="stock-quantity">${label}</div>
                </div>
            `;
        }).join("");
    }

    // ---------- RECENT ACTIVITIES ----------

    // Reads the account that's actually signed in right now — the same
    // object User.js writes to sessionStorage (or localStorage, if
    // "Remember me" was checked) when Sign In succeeds. This is what
    // holds the real "Owner" / "Manager" / "Cashier" role, as opposed
    // to getCurrentUserName() below, which only has a display name.
    function getCurrentSession() {
        try {
            const raw =
                sessionStorage.getItem(CURRENT_USER_KEY) ||
                localStorage.getItem(CURRENT_USER_KEY);

            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function getCurrentUserName() {
        const session = getCurrentSession();
        if (session && (session.fullname || session.username)) {
            return session.fullname || session.username;
        }

        // Best-effort fallback: reuse whatever the profile popup already
        // stores, in case the session object above isn't available.
        try {
            const saved = localStorage.getItem("yesunim_profile");
            if (saved) {
                const profile = JSON.parse(saved);
                return profile.fullname || profile.username || "Admin";
            }
        } catch (e) { /* ignore malformed data */ }

        return "Admin";
    }

    // The Role column shows this — the account's actual role
    // (Owner / Manager / Cashier), not their name.
    function getCurrentUserRole() {
        const session = getCurrentSession();
        if (session && session.role) {
            return session.role;
        }

        try {
            const saved = localStorage.getItem("yesunim_profile");
            if (saved) {
                const profile = JSON.parse(saved);
                if (profile.role) return profile.role;
            }
        } catch (e) { /* ignore malformed data */ }

        return "Unknown";
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
                role: t.role || "Unknown",
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
                role: l.role || "Unknown",
                action: l.action,
                module: "Inventory",
                details: `${l.itemName} (${changeText}, now ${resulting})`
            });
        });

        return feed.sort((a, b) => b.date - a.date).slice(0, 8);
    }

    const ACTION_BADGE_CLASS = {
        "New Order": "action-badge-order",
        "Stock In": "action-badge-in",
        "Stock Out": "action-badge-out",
        "Added": "action-badge-in",
        "Edited": "action-badge-edit",
        "Deleted": "action-badge-out"
    };

    function renderActivities(transactions, logs) {
        if (!activitiesBodyEl) return;

        const feed = buildActivityFeed(transactions, logs);

        if (feed.length === 0) {
            activitiesBodyEl.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#999;">No recent activity yet.</td></tr>`;
            return;
        }

        activitiesBodyEl.innerHTML = feed.map(entry => {
            const badgeClass = ACTION_BADGE_CLASS[entry.action] || "action-badge-default";
            return `
                <tr>
                    <td>${formatActivityTime(entry.date)}</td>
                    <td>${entry.role}</td>
                    <td><span class="action-badge ${badgeClass}">${entry.action}</span></td>
                    <td>${entry.module}</td>
                    <td>${entry.details}</td>
                </tr>
            `;
        }).join("");
    }

    // ---------- NOTIFICATION BELL ----------

    let lastKnownItems = [];

    // Today's date as YYYY-MM-DD in the user's local time zone.
    // A dismissed alert is only hidden while this still matches the
    // date it was dismissed on — so the next day it comes back.
    function todayKey() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${mm}-${dd}`;
    }

    // Alerts marked as read TODAY by anyone (Owner, Manager, ...), kept in
    // the shared "dismissed_alerts" table so everyone sees the same state.
    // Signature format: "itemId:stock".
    // Map of signature -> role of whoever marked it read (e.g. "Manager").
    let dismissedToday = new Map();

    async function loadDismissedFromDb() {
        try {
            const { data, error } = await sb
                .from("dismissed_alerts")
                .select("item_id, stock, dismissed_role")
                .eq("dismissed_on", todayKey());

            if (error) {
                console.error("Could not load dismissed alerts:", error.message);
                return;
            }

            dismissedToday = new Map((data || []).map(r => [`${r.item_id}:${r.stock}`, r.dismissed_role || ""]));
        } catch (e) { /* keep whatever we already had */ }
    }

    async function markNotificationDismissed(signature) {
        // Already marked read (by anyone) — keep the original reader's name
        if (dismissedToday.has(signature)) return;

        // Show it as read right away on this screen...
        dismissedToday.set(signature, getCurrentUserRole());

        // ...then save it so every other account sees it as read too.
        try {
            const cut = signature.lastIndexOf(":");
            const itemId = signature.slice(0, cut);
            const stock = Number(signature.slice(cut + 1));

            const { data: { user } } = await sb.auth.getUser();

            const { error } = await sb.from("dismissed_alerts").upsert({
                item_id: itemId,
                stock: stock,
                dismissed_on: todayKey(),
                dismissed_by: user ? user.id : null,
                dismissed_role: getCurrentUserRole()
            }, { onConflict: "item_id,stock,dismissed_on", ignoreDuplicates: true });

            if (error) {
                console.error("Could not save dismissed alert:", error.message);
            }
        } catch (e) {
            console.error("Could not save dismissed alert:", e);
        }
    }

    function isDismissedToday(signature) {
        return dismissedToday.has(signature);
    }

    function notificationSignature(item) {
        const id = item.id != null ? String(item.id) : (item.name || "");
        return `${id}:${getStock(item)}`;
    }

    // Reads the "Notifications" switch saved by Profile_Setting.js.
    // Defaults to ON when nothing has been saved yet.
    function notificationsEnabled() {
        try {
            const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            return settings ? settings.notifications !== false : true;
        } catch (e) {
            return true;
        }
    }

    // ---------- AUTO ALERT (toast popup + bell ring + background refresh) ----------

    const AUTO_ALERT_INTERVAL_MS = 30000; // re-check stock every 30 seconds

    // Alerts already announced with a popup, keyed by "date|itemId:stock",
    // so the same alert doesn't pop up again on every refresh — but it
    // does pop up again on a new day, matching the daily reset above.
    const announcedAlerts = new Set();

    function injectAlertStyles() {
        if (document.getElementById("stockToastStyles")) return;

        const style = document.createElement("style");
        style.id = "stockToastStyles";
        style.textContent = `
            .stock-toast-stack {
                position: fixed; top: 15px; left: 50%; right: auto;
                transform: translateX(-50%); z-index: 10000;
                display: flex; flex-direction: column; align-items: center; gap: 10px;
                pointer-events: none;
            }
            .stock-toast {
                pointer-events: auto; cursor: pointer;
                display: flex; align-items: flex-start; gap: 10px;
                width: 350px; max-width: calc(100vw - 40px);
                padding: 12px 14px; box-sizing: border-box;
                background: #ffffff;
                border: 1px solid #f0dcdc; border-left: 5px solid #cc292d;
                border-radius: 10px;
                box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
                animation: stockToastIn 0.3s ease;
            }
            .stock-toast.toast-low { border-left-color: #f0a500; }
            .stock-toast.toast-low .stock-toast-icon { color: #f0a500; }
            .stock-toast.leaving {
                opacity: 0; transform: translateY(-16px);
                transition: opacity 0.25s ease, transform 0.25s ease;
            }
            .stock-toast-icon { font-size: 22px; color: #cc292d; flex-shrink: 0; }
            .stock-toast-text { min-width: 0; }
            .stock-toast-text strong { display: block; font-size: 13px; color: #222; }
            .stock-toast-text span { font-size: 12px; color: #666; }
            .stock-toast-close {
                margin-left: auto; border: none; background: transparent;
                color: #999; font-size: 18px; line-height: 1; cursor: pointer;
            }
            .stock-toast-close:hover { color: #333; }
            @keyframes stockToastIn {
                from { opacity: 0; transform: translateY(-16px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes bellRing {
                0%, 100% { transform: rotate(0); }
                20% { transform: rotate(-14deg); }
                40% { transform: rotate(12deg); }
                60% { transform: rotate(-8deg); }
                80% { transform: rotate(6deg); }
            }
            .notification-item-read { opacity: 0.6; }
            .notification-item-read:hover { opacity: 0.9; }
            .notification-read-label {
                display: block; margin-top: 2px;
                font-size: 11px; font-weight: 700; color: #2e7d32;
            }
            #notificationBtn.bell-ring i {
                transform-origin: top center;
                animation: bellRing 0.8s ease;
            }
        `;
        document.head.appendChild(style);
    }

    function showStockToast(title, message, isOut) {
        injectAlertStyles();

        let stack = document.getElementById("stockToastStack");
        if (!stack) {
            stack = document.createElement("div");
            stack.id = "stockToastStack";
            stack.className = "stock-toast-stack";
            document.body.appendChild(stack);
        }

        const toast = document.createElement("div");
        toast.className = "stock-toast" + (isOut ? "" : " toast-low");

        const icon = document.createElement("i");
        icon.className = "bx " + (isOut ? "bxs-error-circle" : "bxs-error") + " stock-toast-icon";

        const text = document.createElement("div");
        text.className = "stock-toast-text";
        const strong = document.createElement("strong");
        strong.textContent = title;
        const span = document.createElement("span");
        span.textContent = message;
        text.appendChild(strong);
        text.appendChild(span);

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "stock-toast-close";
        closeBtn.textContent = "×";
        closeBtn.setAttribute("aria-label", "Close");

        toast.appendChild(icon);
        toast.appendChild(text);
        toast.appendChild(closeBtn);
        stack.appendChild(toast);

        let removed = false;
        const removeToast = () => {
            if (removed) return;
            removed = true;
            toast.classList.add("leaving");
            setTimeout(() => toast.remove(), 260);
        };

        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            removeToast();
        });

        // Clicking the popup opens the bell so the alert can be acted on
        toast.addEventListener("click", () => {
            toggleNotificationDropdown(true);
            removeToast();
        });

        setTimeout(removeToast, 7000);
    }

    function ringBell() {
        if (!notificationBtnEl) return;
        injectAlertStyles();
        notificationBtnEl.classList.remove("bell-ring");
        void notificationBtnEl.offsetWidth; // restart the animation
        notificationBtnEl.classList.add("bell-ring");
    }

    // Pops up a message for any alert that hasn't been announced yet today.
    function announceNewAlerts(alerts) {
        const today = todayKey();
        const fresh = alerts.filter(i => !announcedAlerts.has(today + "|" + notificationSignature(i)));

        alerts.forEach(i => announcedAlerts.add(today + "|" + notificationSignature(i)));

        if (fresh.length === 0) return;

        ringBell();

        if (fresh.length === 1) {
            const item = fresh[0];
            const stock = getStock(item);
            const isOut = stock === 0;
            showStockToast(
                item.name || "Unnamed item",
                isOut ? "is out of stock" : `is low — ${stock} ${getUnit(item)} left`,
                isOut
            );
        } else {
            showStockToast(
                `${fresh.length} stock alerts`,
                "Some items are low or out of stock. Click to view.",
                fresh.some(i => getStock(i) === 0)
            );
        }
    }

    // Lightweight background check: only re-reads inventory, then redraws
    // the Low Stock panel and the bell (which pops up any new alerts).
    let autoAlertBusy = false;

    async function refreshAlerts() {
        if (autoAlertBusy) return;
        autoAlertBusy = true;

        try {
            const items = await loadInventoryItems();

            // loadInventoryItems() returns [] when the request fails —
            // keep showing what we had instead of wrongly clearing alerts.
            if (items.length === 0 && lastKnownItems.length > 0) return;

            // Pick up alerts other accounts have marked as read meanwhile
            await loadDismissedFromDb();

            renderLowStock(items);
            renderNotifications(items);
        } finally {
            autoAlertBusy = false;
        }
    }

    function startAutoAlerts() {
        setInterval(refreshAlerts, AUTO_ALERT_INTERVAL_MS);

        // Also check right away when the user comes back to this tab
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) refreshAlerts();
        });
    }

    /* The bell surfaces the same low-stock/out-of-stock situation the
       Low Stock panel already shows — it's the one thing on this
       dashboard that's actually actionable and worth interrupting for. */
    function renderNotifications(items) {
        if (!notificationBadgeEl || !notificationListEl) return;

        lastKnownItems = items;

        // Notifications switched off in System Setting
        if (!notificationsEnabled()) {
            notificationBadgeEl.style.display = "none";
            if (notificationCountTextEl) notificationCountTextEl.textContent = "";
            notificationListEl.innerHTML = `<div class="notification-empty">Notifications are turned off in System Setting.</div>`;
            return;
        }

        injectAlertStyles();

        const lowItems = items
            .filter(i => getStock(i) <= LOW_STOCK_THRESHOLD)
            .sort((a, b) => getStock(a) - getStock(b));

        // Unread first, then the ones already marked read (dimmed, with who read them)
        const alerts = lowItems.filter(i => !isDismissedToday(notificationSignature(i)));
        const readAlerts = lowItems.filter(i => isDismissedToday(notificationSignature(i)));

        // Auto alert: pop up anything new that hasn't been announced yet today
        announceNewAlerts(alerts);

        if (notificationBadgeEl) {
            if (alerts.length > 0) {
                notificationBadgeEl.textContent = alerts.length > 9 ? "9+" : String(alerts.length);
                notificationBadgeEl.style.display = "flex";
            } else {
                notificationBadgeEl.style.display = "none";
            }
        }

        if (notificationCountTextEl) {
            notificationCountTextEl.textContent = alerts.length > 0 ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"}` : "";
        }

        if (lowItems.length === 0) {
            notificationListEl.innerHTML = `<div class="notification-empty">No alerts right now — everything is well stocked.</div>`;
            return;
        }

        const buildItemHtml = (i, isRead) => {
            const stock = getStock(i);
            const isOut = stock === 0;
            const message = isOut ? "is out of stock" : `is low — ${stock} ${getUnit(i)} left`;
            const id = i.id != null ? String(i.id) : "";
            const category = i.category || "";
            const signature = notificationSignature(i);

            let readLabel = "";
            if (isRead) {
                const who = dismissedToday.get(signature);
                readLabel = `<span class="notification-read-label">✓ Marked read${who ? " by " + who : ""}</span>`;
            }

            return `
                <div class="notification-item${isRead ? " notification-item-read" : ""}" role="button" tabindex="0"
                     data-item-id="${id}" data-category="${category}" data-signature="${signature}">
                    <i class='bx ${isOut ? "bxs-error-circle" : "bxs-error"}'></i>
                    <div class="notification-item-text">
                        <strong>${i.name || "Unnamed item"}</strong>
                        <span>${message}</span>
                        ${readLabel}
                    </div>
                    ${isRead ? "" : `
                    <button type="button" class="notification-dismiss-btn" title="Mark as read">
                        <i class='bx bx-check'></i>
                    </button>`}
                </div>
            `;
        };

        notificationListEl.innerHTML =
            alerts.map(i => buildItemHtml(i, false)).join("") +
            readAlerts.map(i => buildItemHtml(i, true)).join("");

        // Clicking (or pressing Enter/Space on) an alert marks it read and
        // jumps to that product's category in Inventory, highlighting the
        // exact row/card so it's easy to find.
        notificationListEl.querySelectorAll(".notification-item[data-item-id]").forEach(el => {
            const goToItem = async () => {
                await markNotificationDismissed(el.dataset.signature);

                const params = new URLSearchParams();
                if (el.dataset.category) params.set("category", el.dataset.category);
                if (el.dataset.itemId) params.set("highlight", el.dataset.itemId);
                window.location.href = "Inventory.html" + (params.toString() ? `?${params.toString()}` : "");
            };

            el.addEventListener("click", goToItem);
            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goToItem();
                }
            });

            // The check button dismisses the alert in place, without
            // leaving the dashboard — "I've already seen this."
            const dismissBtn = el.querySelector(".notification-dismiss-btn");
            if (dismissBtn) {
                dismissBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    markNotificationDismissed(el.dataset.signature);

                    el.classList.add("notification-item-removing");

                    // Re-render once the fade-out finishes. The timeout is a
                    // fallback in case no CSS transition exists to fire
                    // "transitionend"; whichever happens first wins.
                    let done = false;
                    const finish = () => {
                        if (done) return;
                        done = true;
                        renderNotifications(lastKnownItems);
                    };
                    el.addEventListener("transitionend", finish, { once: true });
                    setTimeout(finish, 300);
                });
            }
        });
    }

    function toggleNotificationDropdown(forceState) {
        if (!notificationDropdownEl) return;
        const shouldShow = typeof forceState === "boolean" ? forceState : !notificationDropdownEl.classList.contains("show");
        notificationDropdownEl.classList.toggle("show", shouldShow);
    }

    function wireNotificationBell() {
        if (!notificationBtnEl) return;

        notificationBtnEl.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleNotificationDropdown();
        });

        document.addEventListener("click", (e) => {
            if (notificationWrapEl && !notificationWrapEl.contains(e.target)) {
                toggleNotificationDropdown(false);
            }
        });

        if (notificationViewAllEl) {
            notificationViewAllEl.addEventListener("click", () => {
                window.location.href = "Inventory.html";
            });
        }

        // Re-draw the bell the moment the Notifications switch is saved
        // in System Setting (Profile_Setting.js fires this event), so the
        // change shows up without reloading the page.
        window.addEventListener("banchetoSettingsChanged", () => {
            renderNotifications(lastKnownItems);
        });

        // Same thing if the setting was changed in another open tab.
        window.addEventListener("storage", (e) => {
            if (e.key === SETTINGS_KEY || e.key === DISMISSED_NOTIFICATIONS_KEY) {
                renderNotifications(lastKnownItems);
            }
        });
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

    // Pulls this account's saved settings from the database and copies the
    // notification switch into the local cache that notificationsEnabled()
    // reads, so the setting follows the account across browsers/devices.
    async function syncSettingsFromDb() {
        try {
            const { data: { user } } = await sb.auth.getUser();
            if (!user) return;

            const { data, error } = await sb
                .from("user_settings")
                .select("notifications, last_backup")
                .eq("user_id", user.id)
                .maybeSingle();

            if (error || !data) return;

            const cached = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};

            localStorage.setItem(SETTINGS_KEY, JSON.stringify({
                ...cached,
                notifications: data.notifications,
                lastBackup: data.last_backup ? new Date(data.last_backup).getTime() : null
            }));
        } catch (e) { /* fall back to whatever is cached locally */ }
    }

    async function refresh() {
        const [items, transactions, logs] = await Promise.all([
            loadInventoryItems(),
            loadTransactions(),
            loadInventoryLogs()
        ]);

        renderStatCards(items, transactions);
        renderSalesChart(transactions);
        renderBestSelling(transactions);
        renderLowStock(items);
        renderNotifications(items);
        renderActivities(transactions, logs);
    }

    // Hovering anywhere over the chart (not just exactly on a dot) shows
    // the tooltip for the nearest day, same as the Analytics Sales Trend.
    function wireChartHover() {
        if (!chartEl || !salesPointsGroup) return;

        let activeIndex = -1;

        // Vertical dashed guide that follows the hovered day. Inserted
        // first so the line and dots draw on top of it.
        const guideEl = document.createElement("div");
        guideEl.className = "chart-guide";
        chartEl.insertBefore(guideEl, chartEl.firstChild);

        function setActiveXLabel(idx) {
            if (!chartXAxis) return;
            chartXAxis.querySelectorAll("span").forEach((span, i) => {
                span.classList.toggle("chart-x-active", i === idx);
            });
        }

        function clearActive() {
            salesPointsGroup
                .querySelectorAll(".sales-point-active")
                .forEach(el => el.classList.remove("sales-point-active"));
            activeIndex = -1;
            guideEl.classList.remove("show");
            setActiveXLabel(-1);
            hideSalesTooltip();
        }

        chartEl.addEventListener("mousemove", (e) => {
            const count = currentDailyTotals.length;
            if (count === 0) return;

            const rect = chartEl.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / (rect.width || 1);
            const idx = Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));

            const dotEl = salesPointsGroup.querySelector(`.sales-point[data-index="${idx}"]`);
            const hitEl = salesPointsGroup.querySelector(`.sales-point-hit[data-index="${idx}"]`);
            if (!dotEl || !hitEl) return;

            if (idx !== activeIndex) {
                salesPointsGroup
                    .querySelectorAll(".sales-point-active")
                    .forEach(el => el.classList.remove("sales-point-active"));
                dotEl.classList.add("sales-point-active");
                setActiveXLabel(idx);
                activeIndex = idx;
            }

            const hitRect = hitEl.getBoundingClientRect();
            placeGliding(guideEl, hitRect.left + hitRect.width / 2 - rect.left);

            showSalesTooltip(hitEl, idx);
        });

        chartEl.addEventListener("mouseleave", clearActive);
    }

    function wireChartResize() {
        let resizeTimer = null;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(positionSalesPeakLabel, 100);
        });
    }

    async function init() {
        await syncSettingsFromDb();
        await loadDismissedFromDb();
        await refresh();
        wireViewAllButtons();
        wireNotificationBell();
        wireChartHover();
        wireChartResize();
        startAutoAlerts();
    }

    document.addEventListener("DOMContentLoaded", init);

})();