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
    const DISMISSED_NOTIFICATIONS_KEY = "yesunim_dismissedNotifications";
    const CURRENT_USER_KEY = "banchetoCurrentUser"; // set by User.js at Sign In
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

        // The percentage compares today against this same weekday one
        // week ago — a direct "since last week" comparison.
        const lastWeekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        const lastWeek = totalsInRange(transactions, startOfDay(lastWeekDate), endOfDay(lastWeekDate));

        if (statEls.sales) statEls.sales.textContent = currency(today.sales);
        renderStatChange(statEls.salesChange, formatChange(today.sales, lastWeek.sales));

        if (statEls.orders) statEls.orders.textContent = today.orders;
        renderStatChange(statEls.ordersChange, formatChange(today.orders, lastWeek.orders));

        const availableItems = items.filter(i => getStock(i) > 0).length;
        if (statEls.items) statEls.items.textContent = availableItems;

        const lowStockCount = items.filter(i => {
            const stock = getStock(i);
            return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
        }).length;
        if (statEls.lowStock) statEls.lowStock.textContent = lowStockCount;
    }

    // ---------- SALES CHART TOOLTIP ----------

    function showSalesTooltip(targetEl, dayDate, value) {
        if (!salesTooltipEl || !chartEl) return;

        const targetRect = targetEl.getBoundingClientRect();
        const containerRect = chartEl.getBoundingClientRect();

        const x = targetRect.left + targetRect.width / 2 - containerRect.left;
        // Never let the tooltip's anchor point go above the space it needs
        // to draw upward into — otherwise it gets clipped off the top of
        // the card when the point itself is near the chart's ceiling.
        const y = Math.max(targetRect.top - containerRect.top, 34);

        const dayLabel = dayDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

        salesTooltipEl.innerHTML = `<strong>${currency(value)}</strong><span>${dayLabel}</span>`;
        salesTooltipEl.style.left = `${x}px`;
        salesTooltipEl.style.top = `${y}px`;
        salesTooltipEl.classList.add("show");
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

            const coords = dailyTotals.map((val, idx) => {
                const x = idx * stepX;
                const y = height - (val / niceMax) * height;
                return { x, y: Math.max(0, Math.min(height, y)) };
            });

            const pointsAttr = coords.map(p => `${p.x},${p.y}`).join(" ");
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
                salesPointsGroup.innerHTML = coords.map((p, idx) => `
                    <circle class="sales-point" data-index="${idx}" cx="${p.x}" cy="${p.y}" r="4"></circle>
                    <circle class="sales-point-hit" data-index="${idx}" cx="${p.x}" cy="${p.y}" r="12"></circle>
                `).join("");

                salesPointsGroup.querySelectorAll(".sales-point-hit").forEach(hitEl => {
                    const idx = Number(hitEl.dataset.index);
                    const dotEl = salesPointsGroup.querySelector(`.sales-point[data-index="${idx}"]`);

                    hitEl.addEventListener("mouseenter", () => {
                        if (dotEl) dotEl.classList.add("sales-point-active");
                        showSalesTooltip(hitEl, days[idx], dailyTotals[idx]);
                    });

                    hitEl.addEventListener("mouseleave", () => {
                        if (dotEl) dotEl.classList.remove("sales-point-active");
                        hideSalesTooltip();
                    });
                });
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
        const userRole = getCurrentUserRole();
        const feed = [];

        transactions.forEach(t => {
            feed.push({
                date: new Date(t.date),
                user: userName,
                role: userRole,
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
                role: userRole,
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

    // Remembers which alerts the user has already acted on/seen, so they
    // don't keep reappearing every time the dashboard reloads. Keyed by
    // "itemId:stock" — if the stock level changes again (drops further,
    // or gets restocked and goes low again later), that's a new signature
    // and the alert will resurface, which is what you'd actually want.
    let lastKnownItems = [];

    function loadDismissedSignatures() {
        try {
            const saved = localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY);
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch (e) {
            return new Set();
        }
    }

    function markNotificationDismissed(signature) {
        const dismissed = loadDismissedSignatures();
        dismissed.add(signature);
        localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify([...dismissed]));
    }

    function notificationSignature(item) {
        const id = item.id != null ? String(item.id) : (item.name || "");
        return `${id}:${getStock(item)}`;
    }

    /* The bell surfaces the same low-stock/out-of-stock situation the
       Low Stock panel already shows — it's the one thing on this
       dashboard that's actually actionable and worth interrupting for. */
    function renderNotifications(items) {
        if (!notificationBadgeEl || !notificationListEl) return;

        lastKnownItems = items;

        const dismissed = loadDismissedSignatures();

        const alerts = items
            .filter(i => getStock(i) <= LOW_STOCK_THRESHOLD)
            .filter(i => !dismissed.has(notificationSignature(i)))
            .sort((a, b) => getStock(a) - getStock(b));

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

        if (alerts.length === 0) {
            notificationListEl.innerHTML = `<div class="notification-empty">No alerts right now — everything is well stocked.</div>`;
            return;
        }

        notificationListEl.innerHTML = alerts.map(i => {
            const stock = getStock(i);
            const isOut = stock === 0;
            const message = isOut ? "is out of stock" : `is low — ${stock} ${getUnit(i)} left`;
            const id = i.id != null ? String(i.id) : "";
            const category = i.category || "";

            return `
                <div class="notification-item" role="button" tabindex="0"
                     data-item-id="${id}" data-category="${category}" data-signature="${notificationSignature(i)}">
                    <i class='bx ${isOut ? "bxs-error-circle" : "bxs-error"}'></i>
                    <div class="notification-item-text">
                        <strong>${i.name || "Unnamed item"}</strong>
                        <span>${message}</span>
                    </div>
                    <button type="button" class="notification-dismiss-btn" title="Mark as read">
                        <i class='bx bx-check'></i>
                    </button>
                </div>
            `;
        }).join("");

        // Clicking (or pressing Enter/Space on) an alert marks it read and
        // jumps to that product's category in Inventory, highlighting the
        // exact row/card so it's easy to find.
        notificationListEl.querySelectorAll(".notification-item[data-item-id]").forEach(el => {
            const goToItem = () => {
                markNotificationDismissed(el.dataset.signature);

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
                    el.addEventListener("transitionend", () => {
                        renderNotifications(lastKnownItems);
                    }, { once: true });
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
        renderNotifications(items);
        renderActivities(transactions, logs);
    }

    function wireChartResize() {
        let resizeTimer = null;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(positionSalesPeakLabel, 100);
        });
    }

    function init() {
        refresh();
        wireViewAllButtons();
        wireNotificationBell();
        wireChartResize();
    }

    document.addEventListener("DOMContentLoaded", init);

})();