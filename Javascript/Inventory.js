/* =====================================================
   YESUNIM — INVENTORY PAGE LOGIC
   Handles: category tabs, sectioned card grid, quantity
   +/-, In Stock/Low Stock/Out of Stock status decision,
   Add/Edit/Delete Product (with confirm), search/filter,
   unit dropdown (typeable), and activity logging for the
   Reports page.
===================================================== */

(function () {

    const STORAGE_KEY = "yesunim_inventoryItems";
    const LOGS_KEY = "yesunim_inventoryLogs";
    const LOW_STOCK_THRESHOLD = 5; // stock at or below this (but above 0) = "Low on Stock"

    // Base categories that always show up first, even with no items yet.
    // The Category field on the form is now free text, so any category
    // typed there will automatically get its own tab too.
    const baseCategories = ["Meat", "Sea Food", "Vegetables", "Others"];

    // Suggested units shown in the Unit dropdown. The field is still
    // typeable, so any custom unit can be entered as well.
    const baseUnits = ["kg", "g", "pcs", "L", "mL", "pack", "box", "bottle", "can", "sack", "dozen"];

    // ---------- DEFAULT SEED DATA (used only the first time) ----------
    const defaultItems = [
        { id: "i1", name: "Pork Belly",    category: "Meat",       stock: 25, unit: "kg", price: 320, image: "" },
        { id: "i2", name: "Pork Ribs",     category: "Meat",       stock: 2,  unit: "kg", price: 280, image: "" },
        { id: "i3", name: "Chicken Thigh", category: "Meat",       stock: 0,  unit: "kg", price: 180, image: "" },
        { id: "i4", name: "Beef Slices",   category: "Meat",       stock: 15, unit: "kg", price: 380, image: "" },

        { id: "i5", name: "Shrimp",        category: "Sea Food",   stock: 10, unit: "kg", price: 420, image: "" },
        { id: "i6", name: "Squid",         category: "Sea Food",   stock: 1,  unit: "kg", price: 350, image: "" },
        { id: "i7", name: "Bangus",        category: "Sea Food",   stock: 0,  unit: "kg", price: 220, image: "" },
        { id: "i8", name: "Crab",          category: "Sea Food",   stock: 5,  unit: "kg", price: 450, image: "" },

        { id: "i9",  name: "Cabbage",      category: "Vegetables", stock: 8,  unit: "kg", price: 60,  image: "" },
        { id: "i10", name: "Carrot",       category: "Vegetables", stock: 1,  unit: "kg", price: 80,  image: "" },
        { id: "i11", name: "Potato",       category: "Vegetables", stock: 0,  unit: "kg", price: 90,  image: "" },
        { id: "i12", name: "Lettuce",      category: "Vegetables", stock: 6,  unit: "kg", price: 70,  image: "" },

        { id: "i13", name: "Cooking Oil",  category: "Others",     stock: 5,  unit: "L",  price: 110, image: "" },
        { id: "i14", name: "Rice",         category: "Others",     stock: 20, unit: "kg", price: 55,  image: "" }
    ];

    // ---------- STATE ----------
    let items = [];
    let activeCategory = "All";
    let searchQuery = "";
    let editingItemId = null; // null = adding a new product, otherwise editing this item's id
    let pendingImageDataUrl = "";
    let previousUnit = "";    // remembered so an emptied Unit field can be restored

    // ---------- ELEMENTS ----------
    const categoryTabsEl = document.getElementById("categoryTabs");
    const inventoryScrollEl = document.getElementById("inventoryScroll");
    const sectionsEl = document.getElementById("inventorySections");
    const tableEl = document.getElementById("inventoryTable");
    const tableBodyEl = document.getElementById("inventoryTableBody");
    const noResultsNoteEl = document.getElementById("noResultsNote");
    const noResultsQueryEl = document.getElementById("noResultsQuery");

    const totalItemsValueEl = document.getElementById("totalItemsValue");
    const lowStockValueEl = document.getElementById("lowStockValue");
    const outOfStockValueEl = document.getElementById("outOfStockValue");

    const searchInputEl = document.getElementById("inventorySearchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");

    const bottomBarEl = document.getElementById("inventoryBottomBar");
    const openAddProductBtn = document.getElementById("openAddProductBtn");
    const closeAddProductBtn = document.getElementById("closeAddProductBtn");
    const cancelAddProductBtn = document.getElementById("cancelAddProductBtn");
    const addProductOverlay = document.getElementById("addProductOverlay");
    const addProductForm = document.getElementById("addProductForm");
    const productPopupTitle = document.getElementById("productPopupTitle");
    const saveProductBtn = document.getElementById("saveProductBtn");

    const productImageUploadBox = document.getElementById("productImageUploadBox");
    const productImageInput = document.getElementById("productImageInput");
    const productImagePreview = document.getElementById("productImagePreview");
    const productImageUploadText = document.getElementById("productImageUploadText");

    const productNameInput = document.getElementById("productNameInput");
    const productCategoryInput = document.getElementById("productCategoryInput");
    const productStockInput = document.getElementById("productStockInput");
    const productUnitInput = document.getElementById("productUnitInput");
    const productPriceInput = document.getElementById("productPriceInput");
    const categoryListEl = document.getElementById("categoryList");
    const unitListEl = document.getElementById("unitList");
    const unitChevronEl = document.getElementById("unitChevron");

    // ---------- STORAGE ----------

    function saveItems() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }

    function getCurrentUserRole() {
        try {
            const saved = localStorage.getItem("banchetoCurrentUser") ||
                sessionStorage.getItem("banchetoCurrentUser");
            if (saved) {
                const session = JSON.parse(saved);
                return session.role || "Unknown";
            }
        } catch (e) { /* ignore malformed data */ }
        return "Unknown";
    }

    function logInventoryActivity(action, item, change) {
        const saved = localStorage.getItem(LOGS_KEY);
        const logs = saved ? JSON.parse(saved) : [];

        logs.push({
            id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            date: new Date().toISOString(),
            role: getCurrentUserRole(),
            itemName: item.name,
            category: item.category,
            action: action, // "Stock In" | "Stock Out" | "Added" | "Edited" | "Deleted"
            change: change, // positive = added, negative = removed
            resultingStock: item.stock
        });

        localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    }

    // Normalizes a stored item so missing/legacy fields (an older item
    // saved before "unit" or "price" existed, for example) never render
    // as the literal text "undefined" — they fall back to sane defaults
    // instead, without silently discarding whatever data is there.
    // A field can be missing (real undefined) or, from an older bug,
    // hold the literal text "undefined"/"null" — both need the fallback.
    function cleanText(value, fallback) {
        if (!value) return fallback;
        const trimmed = String(value).trim();
        if (!trimmed || trimmed === "undefined" || trimmed === "null") return fallback;
        return trimmed;
    }

    // Coerces a stored number that may have been saved as a string
    // (e.g. "380") into an actual number. Number.isFinite() on its own
    // returns false for numeric strings, which was silently zeroing out
    // valid prices/stock — this fixes that by converting first, then
    // checking finiteness on the converted value.
    function cleanNumber(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function normalizeItem(item) {
        return {
            id: item.id,
            name: cleanText(item.name, "Unnamed Product"),
            category: cleanText(item.category, "Others"),
            stock: cleanNumber(item.stock, 0),
            unit: cleanText(item.unit, "pcs"),
            price: cleanNumber(item.price, 0),
            image: item.image || ""
        };
    }

    function loadItems() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                items = JSON.parse(saved).map(normalizeItem);
                // Persist the normalized (type-corrected) values back so
                // a price/stock that was stored as a string is fixed for
                // good, instead of silently drifting toward 0 on every
                // future save that happens to touch these items.
                saveItems();
                return;
            } catch (e) {
                // fall through to default
            }
        }
        items = defaultItems;
        saveItems();
    }

    // ---------- FORMATTING ----------

    function formatPrice(value) {
        return "₱" + Number(value || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // Wraps the part of `text` that matches the current search query in a
    // <mark>-style highlight span, so a match is easy to spot at a glance.
    function highlightMatch(text) {
        if (!searchQuery) return text;

        const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp("(" + escaped + ")", "ig");

        return text.replace(regex, "<span class=\"search-highlight\">$1</span>");
    }

    // ---------- CATEGORY LIST (dynamic: base categories + any typed in by the user) ----------

    function getAllCategories() {
        const result = [...baseCategories];

        items.forEach(item => {
            const cat = (item.category || "").trim();
            if (cat && !result.includes(cat)) {
                result.push(cat);
            }
        });

        return result;
    }

    function refreshCategoryDatalist() {
        if (!categoryListEl) return;
        categoryListEl.innerHTML = "";
        getAllCategories().forEach(cat => {
            const option = document.createElement("option");
            option.value = cat;
            categoryListEl.appendChild(option);
        });
    }

    // ---------- UNIT DROPDOWN (base units + any custom unit already used) ----------

    function getAllUnits() {
        const result = [...baseUnits];

        items.forEach(item => {
            const u = (item.unit || "").trim();
            if (u && !result.some(x => x.toLowerCase() === u.toLowerCase())) {
                result.push(u);
            }
        });

        return result;
    }

    function refreshUnitDatalist() {
        if (!unitListEl) return;
        unitListEl.innerHTML = "";
        getAllUnits().forEach(unit => {
            const option = document.createElement("option");
            option.value = unit;
            unitListEl.appendChild(option);
        });
    }

    // Browsers only list datalist options that match the current text.
    // Clearing the field on focus shows the full list; if the user leaves
    // it empty, the previous value comes back.
    function showAllUnits() {
        if (productUnitInput.value !== "") previousUnit = productUnitInput.value;
        productUnitInput.value = "";

        if (typeof productUnitInput.showPicker === "function") {
            try { productUnitInput.showPicker(); } catch (e) { /* needs user gesture */ }
        }
    }

    function restoreUnitIfEmpty() {
        if (productUnitInput.value.trim() === "") {
            productUnitInput.value = previousUnit;
        }
    }

    // ---------- CATEGORY ICON (for "All Items" section headers) ----------

    function getCategoryIcon(category) {
        const map = {
            "Meat": "bx-restaurant",
            "Sea Food": "bx-water",
            "Vegetables": "bx-leaf",
            "Others": "bx-category-alt"
        };
        return map[category] || "bx-category";
    }

    // ---------- SEARCH FILTER ----------

    function getVisibleItems(categoryFilter) {
        const query = searchQuery.trim().toLowerCase();

        return items.filter(item => {
            const matchesCategory = categoryFilter === "All" || item.category === categoryFilter;
            const matchesSearch = !query || item.name.toLowerCase().includes(query);
            return matchesCategory && matchesSearch;
        });
    }

    // ---------- STOCK STATUS DECISION ----------

    function getStatus(stock) {
        if (stock === 0) return { label: "Out of Stock", className: "status-out" };
        if (stock <= LOW_STOCK_THRESHOLD) return { label: "Low on Stock", className: "status-low" };
        return { label: "In Stock", className: "status-in" };
    }

    // ---------- STATS ----------

    function updateStats() {
        const totalItems = items.length;
        const inStock = items.filter(i => i.stock > 0).length;
        const lowStock = items.filter(i => i.stock > 0 && i.stock <= LOW_STOCK_THRESHOLD).length;
        const outOfStock = items.filter(i => i.stock === 0).length;

        totalItemsValueEl.textContent = `${inStock}/${totalItems}`;
        lowStockValueEl.textContent = lowStock;
        outOfStockValueEl.textContent = outOfStock;
    }

    // ---------- CATEGORY TABS ----------

    function renderTabs() {
        categoryTabsEl.innerHTML = "";

        const allCategories = getAllCategories();
        const allTab = ["All Items", ...allCategories.map(c => c === "Others" ? "Others..." : c)];
        const values = ["All", ...allCategories];

        allTab.forEach((label, index) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "category-tab" + (values[index] === activeCategory ? " active" : "");
            btn.textContent = label;

            btn.addEventListener("click", () => {
                activeCategory = values[index];

                // Without this, switching to a shorter list while
                // scrolled down leaves the sticky table header pinned
                // at the old scroll offset, which looks like it jumps.
                if (inventoryScrollEl) {
                    inventoryScrollEl.scrollTop = 0;
                }

                renderTabs();
                renderView();
            });

            categoryTabsEl.appendChild(btn);
        });
    }

    // ---------- VIEW ROUTER: "All" = card sections, specific category = table ----------

    function renderView() {
        // Add Product only makes sense inside a specific category
        // (Meat / Sea Food / Vegetables / Others / custom), not on "All".
        bottomBarEl.style.display = activeCategory === "All" ? "none" : "flex";

        const visibleCount = getVisibleItems(activeCategory).length;
        const hasQuery = searchQuery.trim().length > 0;

        noResultsNoteEl.style.display = (hasQuery && visibleCount === 0) ? "block" : "none";
        if (hasQuery) noResultsQueryEl.textContent = searchQuery.trim();

        if (activeCategory === "All") {
            sectionsEl.style.display = visibleCount === 0 && hasQuery ? "none" : "flex";
            tableEl.style.display = "none";
            renderSections();
        } else {
            sectionsEl.style.display = "none";
            tableEl.style.display = visibleCount === 0 && hasQuery ? "none" : "table";
            renderTable();
        }
    }

    // ---------- SECTIONS / CARDS ----------

    function renderSections() {
        sectionsEl.innerHTML = "";

        const categoriesToShow = activeCategory === "All" ? getAllCategories() : [activeCategory];

        categoriesToShow.forEach(category => {
            const categoryItems = getVisibleItems(category);
            if (categoryItems.length === 0) return;

            const section = document.createElement("div");
            section.className = "inventory-section";

            const titleBar = document.createElement("div");
            titleBar.className = "section-title-bar";
            titleBar.innerHTML = `
                <i class='bx ${getCategoryIcon(category)}'></i>
                <span class="section-title-name">${category}</span>
                <span class="section-count">${categoryItems.length} item${categoryItems.length === 1 ? "" : "s"}</span>
            `;
            section.appendChild(titleBar);

            const grid = document.createElement("div");
            grid.className = "inventory-grid";

            categoryItems.forEach(item => {
                grid.appendChild(buildCard(item));
            });

            section.appendChild(grid);
            sectionsEl.appendChild(section);
        });

        if (sectionsEl.children.length === 0 && !searchQuery.trim()) {
            sectionsEl.innerHTML = `<p style="color:#999;font-size:13px;">No products in this category yet.</p>`;
        }
    }

    function renderTable() {
        tableBodyEl.innerHTML = "";

        const rows = getVisibleItems(activeCategory);

        if (rows.length === 0) {
            if (!searchQuery.trim()) {
                tableBodyEl.innerHTML = `<tr class="empty-row"><td colspan="7">No products in this category yet.</td></tr>`;
            }
            return;
        }

        rows.forEach(item => {
            const status = getStatus(item.stock);

            const tr = document.createElement("tr");
            tr.dataset.id = item.id;

            const thumbHtml = item.image
                ? `<img class="inventory-thumb" src="${item.image}" alt="${item.name}">`
                : `<div class="inventory-thumb"><i class='bx bx-image'></i></div>`;

            tr.innerHTML = `
                <td>
                    <div class="inventory-product-cell">
                        ${thumbHtml}
                        <span>${highlightMatch(item.name)}</span>
                    </div>
                </td>
                <td>${item.category}</td>
                <td>${item.stock}</td>
                <td>${item.unit}</td>
                <td>${formatPrice(item.price)}</td>
                <td class="status-cell ${status.className}"><span class="status-pill">${status.label}</span></td>
                <td>
                    <div class="action-cell">
                        <button type="button" class="edit-product-btn" title="Edit"><i class='bx bx-edit'></i></button>
                        <button type="button" class="delete-product-btn" title="Delete"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;

            tr.querySelector(".edit-product-btn").addEventListener("click", () => openEditProductPopup(item));
            tr.querySelector(".delete-product-btn").addEventListener("click", () => deleteProduct(item));

            tableBodyEl.appendChild(tr);
        });
    }

    function buildCard(item) {
        const status = getStatus(item.stock);

        const card = document.createElement("div");
        card.className = `inventory-card ${status.className}`;
        card.dataset.id = item.id;

        const imageHtml = item.image
            ? `<img class="inventory-image" src="${item.image}" alt="${item.name}" style="object-fit:cover;">`
            : `<div class="inventory-image"><i class='bx bx-image'></i></div>`;

        card.innerHTML = `
            <div class="card-actions">
                <button type="button" class="edit-product-btn" title="Edit"><i class='bx bx-edit'></i></button>
                <button type="button" class="delete-product-btn" title="Delete"><i class='bx bx-trash'></i></button>
            </div>
            <div class="inventory-card-top">
                ${imageHtml}
                <div class="inventory-info">
                    <div class="inventory-name" title="${item.name}">${highlightMatch(item.name)}</div>
                    <div class="inventory-qty">${item.stock} ${item.unit}</div>
                    <div class="inventory-price">${formatPrice(item.price)} / ${item.unit}</div>
                    <div class="status-tag ${status.className}">${status.label}</div>
                </div>
            </div>
            <div class="qty-controls">
                <button type="button" class="qty-btn minus-btn">−</button>
                <span class="qty-label">Quantity</span>
                <button type="button" class="qty-btn plus-btn">+</button>
            </div>
        `;

        card.querySelector(".minus-btn").addEventListener("click", () => changeStock(item.id, -1));
        card.querySelector(".plus-btn").addEventListener("click", () => changeStock(item.id, 1));

        card.querySelector(".edit-product-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            openEditProductPopup(item);
        });

        card.querySelector(".delete-product-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteProduct(item);
        });

        return card;
    }

    // Updates just the one card/row that changed, in place — instead of
    // rebuilding the whole grid/table, which was replaying every card's
    // entrance animation on every +/- click and made it look like the
    // whole list was flashing.
    function updateItemInDOM(item) {
        const status = getStatus(item.stock);

        const card = sectionsEl.querySelector(`.inventory-card[data-id="${CSS.escape(item.id)}"]`);
        if (card) {
            card.className = `inventory-card ${status.className}`;

            const qtyEl = card.querySelector(".inventory-qty");
            if (qtyEl) qtyEl.textContent = `${item.stock} ${item.unit}`;

            // Price is derived fresh from item.price every time (never
            // cleared or skipped), so it can't go missing on a stock click.
            const priceEl = card.querySelector(".inventory-price");
            if (priceEl) priceEl.textContent = `${formatPrice(item.price)} / ${item.unit}`;

            const statusTagEl = card.querySelector(".status-tag");
            if (statusTagEl) {
                statusTagEl.className = `status-tag ${status.className}`;
                statusTagEl.textContent = status.label;
            }
        }

        const row = tableBodyEl.querySelector(`tr[data-id="${CSS.escape(item.id)}"]`);
        if (row) {
            const stockCell = row.children[2];
            if (stockCell) stockCell.textContent = item.stock;

            const priceCell = row.children[4];
            if (priceCell) priceCell.textContent = formatPrice(item.price);

            const statusCell = row.querySelector(".status-cell");
            if (statusCell) {
                statusCell.className = `status-cell ${status.className}`;
                const pill = statusCell.querySelector(".status-pill");
                if (pill) pill.textContent = status.label;
            }
        }
    }

    function changeStock(itemId, delta) {
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        const previousStock = item.stock;
        item.stock = Math.max(0, item.stock + delta);
        const actualChange = item.stock - previousStock;

        if (actualChange !== 0) {
            logInventoryActivity(actualChange > 0 ? "Stock In" : "Stock Out", item, actualChange);
        }

        saveItems();
        updateItemInDOM(item);
        updateStats();
    }

    function deleteProduct(item) {
        const confirmed = confirm(`Delete "${item.name}" from Inventory? This can't be undone.`);
        if (!confirmed) return;

        if (item.stock > 0) {
            logInventoryActivity("Deleted", item, -item.stock);
        }

        items = items.filter(i => i.id !== item.id);
        saveItems();
        renderTabs();
        renderView();
        updateStats();
    }

    // ---------- SEARCH ----------

    function handleSearchInput() {
        searchQuery = searchInputEl.value;
        clearSearchBtn.style.display = searchQuery ? "flex" : "none";
        renderTabs();
        renderView();
    }

    function clearSearch() {
        searchInputEl.value = "";
        searchQuery = "";
        clearSearchBtn.style.display = "none";
        searchInputEl.focus();
        renderTabs();
        renderView();
    }

    // ---------- ADD / EDIT PRODUCT POPUP ----------

    function openAddProductPopup() {
        editingItemId = null;
        productPopupTitle.textContent = "Add Product";
        saveProductBtn.textContent = "Save Product";

        addProductForm.reset();
        productStockInput.value = 0;
        productUnitInput.value = "kg";
        previousUnit = "kg";
        productPriceInput.value = 0;

        refreshCategoryDatalist();
        refreshUnitDatalist();

        // Pre-fill the category the user is currently viewing,
        // since Add Product is now only shown inside a category tab.
        productCategoryInput.value = activeCategory !== "All" ? activeCategory : "";

        pendingImageDataUrl = "";
        productImagePreview.src = "";
        productImagePreview.style.display = "none";
        productImageUploadText.style.display = "flex";

        addProductOverlay.classList.add("show");
    }

    function openEditProductPopup(item) {
        editingItemId = item.id;
        productPopupTitle.textContent = "Edit Product";
        saveProductBtn.textContent = "Update Product";

        refreshCategoryDatalist();
        refreshUnitDatalist();

        productNameInput.value = item.name;
        productCategoryInput.value = item.category;
        productStockInput.value = item.stock;
        productUnitInput.value = item.unit;
        previousUnit = item.unit;
        productPriceInput.value = item.price || 0;

        pendingImageDataUrl = item.image || "";

        if (pendingImageDataUrl) {
            productImagePreview.src = pendingImageDataUrl;
            productImagePreview.style.display = "block";
            productImageUploadText.style.display = "none";
        } else {
            productImagePreview.src = "";
            productImagePreview.style.display = "none";
            productImageUploadText.style.display = "flex";
        }

        addProductOverlay.classList.add("show");
    }

    function closeAddProductPopup() {
        addProductOverlay.classList.remove("show");
        editingItemId = null;
    }

    function handleImageUpload(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            pendingImageDataUrl = e.target.result;
            productImagePreview.src = pendingImageDataUrl;
            productImagePreview.style.display = "block";
            productImageUploadText.style.display = "none";
        };
        reader.readAsDataURL(file);
    }

    function handleAddProductSubmit(e) {
        e.preventDefault();

        const name = productNameInput.value.trim();
        const category = productCategoryInput.value.trim();
        const stock = parseInt(productStockInput.value, 10);
        const unit = productUnitInput.value.trim();
        const price = parseFloat(productPriceInput.value);

        if (!name || !category || isNaN(stock) || stock < 0 || !unit || isNaN(price) || price < 0) {
            alert("Please enter a valid product name, category, stock quantity, unit, and price.");
            return;
        }

        if (editingItemId) {
            const item = items.find(i => i.id === editingItemId);
            if (item) {
                const previousStock = item.stock;

                item.name = name;
                item.category = category;
                item.stock = stock;
                item.unit = unit;
                item.price = price;
                item.image = pendingImageDataUrl;

                const netChange = stock - previousStock;
                if (netChange !== 0) {
                    logInventoryActivity("Edited", item, netChange);
                }
            }
        } else {
            const newItem = {
                id: "i_" + Date.now(),
                name: name,
                category: category,
                stock: stock,
                unit: unit,
                price: price,
                image: pendingImageDataUrl
            };

            items.push(newItem);

            if (stock > 0) {
                logInventoryActivity("Added", newItem, stock);
            }
        }

        saveItems();

        // A brand-new category may have just been typed in, so the tab
        // list (and active tab, if it changed) needs to be rebuilt too.
        renderTabs();
        renderView();
        updateStats();

        closeAddProductPopup();
    }

    // ---------- DEEP LINK (arriving from a Dashboard notification) ----------

    /* Dashboard.js links to this page as Inventory.html?category=X&highlight=itemId
       when someone clicks a low-stock alert. This jumps to that category's
       tab and briefly highlights the matching row/card so it's easy to spot. */

    function applyDeepLinkCategory() {
        const params = new URLSearchParams(window.location.search);
        const category = params.get("category");
        if (!category) return;

        if (getAllCategories().includes(category)) {
            activeCategory = category;
        }
    }

    function highlightDeepLinkItem() {
        const params = new URLSearchParams(window.location.search);
        const highlightId = params.get("highlight");
        if (!highlightId) return;

        const target = (activeCategory === "All" ? sectionsEl : tableEl)
            .querySelector(`[data-id="${CSS.escape(highlightId)}"]`);

        if (!target) return;

        target.scrollIntoView({ behavior: "smooth", block: "center" });

        target.style.transition = "box-shadow 0.3s ease, outline 0.3s ease";
        target.style.outline = "2px solid #cc292d";
        target.style.outlineOffset = "2px";
        target.style.boxShadow = "0 0 0 4px rgba(204, 41, 45, 0.15)";

        setTimeout(() => {
            target.style.outline = "";
            target.style.outlineOffset = "";
            target.style.boxShadow = "";
        }, 2400);

        // Clean the URL so refreshing the page doesn't re-trigger the flash
        params.delete("highlight");
        params.delete("category");
        const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", cleanUrl);
    }

    // ---------- INIT ----------

    function init() {
        loadItems();

        applyDeepLinkCategory();

        renderTabs();
        renderView();
        updateStats();
        refreshCategoryDatalist();
        refreshUnitDatalist();

        if (new URLSearchParams(window.location.search).get("highlight")) {
            // Give the DOM a tick to finish painting before we scroll/flash.
            setTimeout(highlightDeepLinkItem, 50);
        }

        openAddProductBtn.addEventListener("click", openAddProductPopup);
        closeAddProductBtn.addEventListener("click", closeAddProductPopup);
        cancelAddProductBtn.addEventListener("click", closeAddProductPopup);

        addProductOverlay.addEventListener("click", (e) => {
            if (e.target === addProductOverlay) closeAddProductPopup();
        });

        productImageUploadBox.addEventListener("click", () => productImageInput.click());
        productImageInput.addEventListener("change", (e) => {
            handleImageUpload(e.target.files[0]);
        });

        // Unit dropdown behavior
        productUnitInput.addEventListener("focus", showAllUnits);
        productUnitInput.addEventListener("click", () => {
            if (productUnitInput.value === "") showAllUnits();
        });
        productUnitInput.addEventListener("blur", restoreUnitIfEmpty);

        unitChevronEl.addEventListener("mousedown", (e) => {
            e.preventDefault(); // keep focus behavior consistent
            productUnitInput.focus();
            showAllUnits();
        });

        addProductForm.addEventListener("submit", handleAddProductSubmit);

        searchInputEl.addEventListener("input", handleSearchInput);
        clearSearchBtn.addEventListener("click", clearSearch);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();