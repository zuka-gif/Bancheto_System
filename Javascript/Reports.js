/* =====================================================
   YESUNIM — REPORTS PAGE LOGIC
   Builds the filter bar + table + footer inside #sales
   and #inventory separately (each keeps its own date
   range state). showReport() is global since the tab
   buttons call it via inline onclick.
===================================================== */

(function () {

    const TRANSACTIONS_KEY = "yesunim_transactions";
    const INVENTORY_LOGS_KEY = "yesunim_inventoryLogs";
    const INVENTORY_ITEMS_KEY = "yesunim_inventoryItems";
    const LOW_STOCK_THRESHOLD = 5; // must match Inventory.js

    // Each tab keeps its own filter selection
    const state = {
        sales: { mode: "last7", customStart: "", customEnd: "" },
        inventory: { mode: "last7", customStart: "", customEnd: "" }
    };

    // ---------- DATA ----------

    function loadTransactions() {
        const saved = localStorage.getItem(TRANSACTIONS_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    function loadInventoryLogs() {
        const saved = localStorage.getItem(INVENTORY_LOGS_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    function loadInventoryItems() {
        const saved = localStorage.getItem(INVENTORY_ITEMS_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    // ---------- STOCK STATUS DECISION (same rule as Inventory.js) ----------

    function getStatus(stock) {
        if (stock === 0) return { label: "Out of Stock", className: "status-out" };
        if (stock <= LOW_STOCK_THRESHOLD) return { label: "Low on Stock", className: "status-low" };
        return { label: "In Stock", className: "status-in" };
    }

    // ---------- DATE HELPERS ----------

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

    function formatDateDisplay(d) {
        return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }

    function dateKey(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    function computeRange(tabId) {
        const s = state[tabId];
        const now = new Date();

        if (s.mode === "today") {
            return { start: startOfDay(now), end: endOfDay(now) };
        }

        if (s.mode === "last7") {
            const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
            return { start, end: endOfDay(now) };
        }

        if (s.mode === "thisMonth") {
            const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
            return { start, end: endOfDay(now) };
        }

        if (s.mode === "all") {
            return { start: null, end: null };
        }

        if (s.mode === "custom") {
            const start = s.customStart ? startOfDay(new Date(s.customStart)) : null;
            const end = s.customEnd ? endOfDay(new Date(s.customEnd)) : null;
            return { start, end };
        }

        return { start: null, end: null };
    }

    function inRange(d, start, end) {
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
    }

    function currency(n) {
        return "₱" + (isNaN(n) ? 0 : n).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // ---------- MARKUP ----------

    function buildTabMarkup(tabId) {
        const reportTitle = tabId === "sales" ? "Sales Report" : "Inventory Report";

        return `
            <div class="print-header" id="${tabId}-printHeader">
                <div class="print-header-brand">Yesunim Korean Grill House</div>
                <div class="print-header-title">${reportTitle}</div>
                <div class="print-header-meta" id="${tabId}-printMeta"></div>
            </div>

            <div class="report-filters">

                <div class="range-select-box">
                    <select id="${tabId}-dateRangeSelect">
                        <option value="today">Today</option>
                        <option value="last7" selected>Last 7 Days</option>
                        <option value="thisMonth">This Month</option>
                        <option value="all">All Time</option>
                        <option value="custom">Custom Range</option>
                    </select>
                </div>

                <div class="date-range-display" id="${tabId}-dateRangeDisplay">
                    <i class='bx bx-calendar'></i>
                    <span id="${tabId}-dateRangeText">—</span>
                </div>

                <div class="custom-date-inputs" id="${tabId}-customDateInputs">
                    <input type="date" id="${tabId}-customStartDate">
                    <span>to</span>
                    <input type="date" id="${tabId}-customEndDate">
                </div>

                <button type="button" class="generate-btn" id="${tabId}-generateBtn">Generate</button>

                <div class="export-dropdown" id="${tabId}-exportDropdown">
                    <button type="button" class="export-btn" id="${tabId}-exportBtn">
                        Export <i class='bx bx-chevron-down'></i>
                    </button>
                    <div class="export-menu" id="${tabId}-exportMenu">
                        <button type="button" id="${tabId}-exportCsvBtn">Export CSV</button>
                    </div>
                </div>

            </div>

            <div class="report-table-container">
                <table class="report-table" id="${tabId}-reportTable">
                    <thead id="${tabId}-reportTableHead"></thead>
                    <tbody id="${tabId}-reportTableBody"></tbody>
                    <tfoot id="${tabId}-reportTableFoot"></tfoot>
                </table>
            </div>

            <div class="report-footer-actions">
                <button type="button" class="print-btn" id="${tabId}-printBtn">Print</button>
                <button type="button" class="export-pdf-btn" id="${tabId}-exportPdfBtn">Export PDF</button>
            </div>
        `;
    }

    // ---------- RENDER: SALES ----------

    function renderSalesTable(tabId) {
        const { start, end } = computeRange(tabId);
        const transactions = loadTransactions().filter(t => inRange(new Date(t.date), start, end));

        const grouped = {};
        transactions.forEach(t => {
            const key = dateKey(new Date(t.date));
            if (!grouped[key]) grouped[key] = { key, totalSales: 0, totalOrders: 0, totalPax: 0 };
            grouped[key].totalSales += t.total;
            grouped[key].totalOrders += 1;

            const transactionPax = (t.items || []).reduce((sum, item) => sum + (item.pax || 0), 0);
            grouped[key].totalPax += transactionPax;
        });

        const rows = Object.values(grouped).sort((a, b) => a.key.localeCompare(b.key));

        document.getElementById(`${tabId}-reportTableHead`).innerHTML = `
            <tr>
                <th>Date</th>
                <th>Total Sales</th>
                <th>Total Orders</th>
                <th>Total Pax</th>
                <th>Average Sale</th>
            </tr>
        `;

        const bodyEl = document.getElementById(`${tabId}-reportTableBody`);
        const footEl = document.getElementById(`${tabId}-reportTableFoot`);

        if (rows.length === 0) {
            bodyEl.innerHTML = `<tr><td colspan="5" class="empty-row">No sales recorded for this range.</td></tr>`;
            footEl.innerHTML = "";
            return;
        }

        bodyEl.innerHTML = rows.map(r => {
            const avg = r.totalOrders ? r.totalSales / r.totalOrders : 0;
            return `
                <tr>
                    <td>${formatDateDisplay(new Date(r.key))}</td>
                    <td>${currency(r.totalSales)}</td>
                    <td>${r.totalOrders}</td>
                    <td>${r.totalPax}</td>
                    <td>${currency(avg)}</td>
                </tr>
            `;
        }).join("");

        const totalSales = rows.reduce((s, r) => s + r.totalSales, 0);
        const totalOrders = rows.reduce((s, r) => s + r.totalOrders, 0);
        const totalPax = rows.reduce((s, r) => s + r.totalPax, 0);
        const avgAll = totalOrders ? totalSales / totalOrders : 0;

        footEl.innerHTML = `
            <tr class="total-row">
                <td>Total</td>
                <td>${currency(totalSales)}</td>
                <td>${totalOrders}</td>
                <td>${totalPax}</td>
                <td>${currency(avgAll)}</td>
            </tr>
        `;
    }

    // ---------- RENDER: INVENTORY ----------
    // Mirrors the Inventory page's own table (Product Name / Category /
    // Stock / Unit / Price / Status) and reads straight from the same
    // localStorage items the Inventory page manages, so this report
    // always reflects the live inventory. Only items that had at least
    // one recorded stock movement within the selected date range are
    // included, so the date filter still means something here.
    //
    // Footer total row: Stock totals the Stock column, and Price totals
    // just the Price column (sum of each item's unit price) — not
    // stock × price — so the footer always adds up to what's shown
    // above it.

    function renderInventoryTable(tabId) {
        const { start, end } = computeRange(tabId);
        const items = loadInventoryItems();
        const logs = loadInventoryLogs().filter(l => inRange(new Date(l.date), start, end));

        const activeNames = new Set(logs.map(l => l.itemName));
        const isAllTime = state[tabId].mode === "all";

        const rows = isAllTime
            ? items
            : items.filter(i => activeNames.has(i.name));

        document.getElementById(`${tabId}-reportTableHead`).innerHTML = `
            <tr>
                <th>Product Name</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Unit</th>
                <th>Price</th>
                <th>Status</th>
            </tr>
        `;

        const bodyEl = document.getElementById(`${tabId}-reportTableBody`);
        const footEl = document.getElementById(`${tabId}-reportTableFoot`);

        if (rows.length === 0) {
            bodyEl.innerHTML = `<tr><td colspan="6" class="empty-row">No inventory activity for this range.</td></tr>`;
            footEl.innerHTML = "";
            return;
        }

        bodyEl.innerHTML = rows.map(item => {
            const stock = Number(item.stock) || 0;
            const price = Number(item.price) || 0;
            const status = getStatus(stock);
            return `
                <tr>
                    <td>${item.name}</td>
                    <td>${item.category}</td>
                    <td>${stock}</td>
                    <td>${item.unit}</td>
                    <td>${currency(price)}</td>
                    <td class="status-cell ${status.className}">${status.label}</td>
                </tr>
            `;
        }).join("");

        const totalStock = rows.reduce((s, i) => s + (Number(i.stock) || 0), 0);
        const totalPrice = rows.reduce((s, i) => s + (Number(i.price) || 0), 0);

        footEl.innerHTML = `
            <tr class="total-row">
                <td>Total</td>
                <td></td>
                <td>${totalStock}</td>
                <td></td>
                <td>${currency(totalPrice)}</td>
                <td></td>
            </tr>
        `;
    }

    function generateReport(tabId) {
        if (tabId === "sales") {
            renderSalesTable(tabId);
        } else {
            renderInventoryTable(tabId);
        }
    }

    function updateDateRangeText(tabId) {
        const textEl = document.getElementById(`${tabId}-dateRangeText`);
        const s = state[tabId];

        if (s.mode === "all") {
            textEl.textContent = "All Time";
            return;
        }

        const { start, end } = computeRange(tabId);

        if (start && end) {
            textEl.textContent = `${formatDateDisplay(start)} - ${formatDateDisplay(end)}`;
        } else {
            textEl.textContent = "Select a date range";
        }
    }

    // ---------- PRINT HEADER ----------
    // Fills in the printed-only header (range covered + when it was
    // printed) right before the print dialog opens, so a printed page
    // is self-explanatory even without the on-screen filter bar.

    function preparePrintHeader(tabId) {
        const metaEl = document.getElementById(`${tabId}-printMeta`);
        const s = state[tabId];

        let rangeText;
        if (s.mode === "all") {
            rangeText = "All Time";
        } else {
            const { start, end } = computeRange(tabId);
            rangeText = (start && end)
                ? `${formatDateDisplay(start)} - ${formatDateDisplay(end)}`
                : "—";
        }

        const now = new Date();
        const printedText = now.toLocaleString("en-US", {
            month: "long", day: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: true
        });

        metaEl.textContent = `Range: ${rangeText}  •  Printed: ${printedText}`;

        // Some browsers print their own header/footer showing the page
        // title (a setting the person controls, not something CSS can
        // remove) — give it something more useful than the bare app
        // name while the print dialog is open, then put it back after.
        const reportTitle = tabId === "sales" ? "Sales Report" : "Inventory Report";
        window.__previousTitle = document.title;
        document.title = `Yesunim - ${reportTitle} (${rangeText})`;
    }

    window.addEventListener("afterprint", () => {
        if (window.__previousTitle) {
            document.title = window.__previousTitle;
        }
    });

    // ---------- EXPORT CSV ----------

    function exportCsv(tabId) {
        const head = document.getElementById(`${tabId}-reportTableHead`).querySelectorAll("tr");
        const body = document.getElementById(`${tabId}-reportTableBody`).querySelectorAll("tr");
        const foot = document.getElementById(`${tabId}-reportTableFoot`).querySelectorAll("tr");

        const rows = [...head, ...body, ...foot];

        const csvLines = rows.map(row =>
            Array.from(row.children)
                .map(cell => `"${cell.textContent.trim().replace(/"/g, '""')}"`)
                .join(",")
        );

        const csvContent = csvLines.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `${tabId}-report-${dateKey(new Date())}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        document.getElementById(`${tabId}-exportMenu`).classList.remove("show");
    }

    // ---------- SET UP ONE TAB ----------

    function setupTab(tabId) {
        const container = document.getElementById(tabId);
        container.innerHTML = buildTabMarkup(tabId);

        const dateRangeSelect = document.getElementById(`${tabId}-dateRangeSelect`);
        const dateRangeDisplay = document.getElementById(`${tabId}-dateRangeDisplay`);
        const customDateInputs = document.getElementById(`${tabId}-customDateInputs`);
        const customStartInput = document.getElementById(`${tabId}-customStartDate`);
        const customEndInput = document.getElementById(`${tabId}-customEndDate`);

        const generateBtn = document.getElementById(`${tabId}-generateBtn`);

        const exportDropdown = document.getElementById(`${tabId}-exportDropdown`);
        const exportBtn = document.getElementById(`${tabId}-exportBtn`);
        const exportMenu = document.getElementById(`${tabId}-exportMenu`);
        const exportCsvBtn = document.getElementById(`${tabId}-exportCsvBtn`);

        const printBtn = document.getElementById(`${tabId}-printBtn`);
        const exportPdfBtn = document.getElementById(`${tabId}-exportPdfBtn`);

        customDateInputs.style.display = "none";

        dateRangeSelect.addEventListener("change", () => {
            state[tabId].mode = dateRangeSelect.value;

            if (state[tabId].mode === "custom") {
                customDateInputs.style.display = "flex";
                dateRangeDisplay.style.display = "none";
            } else {
                customDateInputs.style.display = "none";
                dateRangeDisplay.style.display = "flex";
                updateDateRangeText(tabId);
            }
        });

        generateBtn.addEventListener("click", () => {
            if (state[tabId].mode === "custom") {
                state[tabId].customStart = customStartInput.value;
                state[tabId].customEnd = customEndInput.value;

                if (!state[tabId].customStart || !state[tabId].customEnd) {
                    alert("Please select both a start and end date.");
                    return;
                }
            }

            generateReport(tabId);
        });

        exportBtn.addEventListener("click", () => {
            exportMenu.classList.toggle("show");
        });

        document.addEventListener("click", (e) => {
            if (!exportDropdown.contains(e.target)) {
                exportMenu.classList.remove("show");
            }
        });

        exportCsvBtn.addEventListener("click", () => exportCsv(tabId));

        printBtn.addEventListener("click", () => {
            preparePrintHeader(tabId);
            window.print();
        });

        exportPdfBtn.addEventListener("click", () => {
            preparePrintHeader(tabId);
            window.print();
        });

        updateDateRangeText(tabId);
        generateReport(tabId);
    }

    // ---------- TAB SWITCHING (called from the HTML's inline onclick) ----------

    window.showReport = function (tabId, btnEl) {
        document.querySelectorAll(".report-tab").forEach(b => b.classList.remove("active"));
        btnEl.classList.add("active");

        document.querySelectorAll(".report-content").forEach(el => {
            el.style.display = el.id === tabId ? "block" : "none";
        });
    };

    // ---------- INIT ----------

    function init() {
        setupTab("sales");
        setupTab("inventory");
    }

    document.addEventListener("DOMContentLoaded", init);

    // Catches Ctrl+P / browser menu printing too, not just our own
    // Print/Export PDF buttons, so the printed header is always fresh.
    window.addEventListener("beforeprint", () => {
        const visibleTab = document.querySelector(".report-content[style*='block'], .report-content:not([style*='display'])");
        const tabId = visibleTab ? visibleTab.id : "sales";
        if (document.getElementById(`${tabId}-printMeta`)) {
            preparePrintHeader(tabId);
        }
    });

})();