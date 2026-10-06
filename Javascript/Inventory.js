/* =====================================================
   YESUNIM — INVENTORY PAGE LOGIC
   Handles: category tabs, sectioned card grid, quantity
   +/-, In Stock/Low Stock/Out of Stock status decision,
   Add/Edit/Delete Product (with confirm), search/filter,
   unit dropdown (typeable), and activity logging for the
   Reports page.
===================================================== */

(function () {

    const LOW_STOCK_THRESHOLD = 5; // stock at or below this (but above 0) = "Low on Stock"

    // Base categories that always show up first, even with no items yet.
    // The Category field on the form is now free text, so any category
    // typed there will automatically get its own tab too.
    const baseCategories = ["Meat", "Sea Food", "Vegetables", "Others"];

    // Suggested units shown in the Unit dropdown. The field is still
    // typeable, so any custom unit can be entered as well.
    const baseUnits = ["kg", "g", "pcs", "L", "mL", "pack", "box", "bottle", "can", "sack", "dozen"];

    // ---------- STATE ----------
    let items = [];
    let activeCategory = "All";
    let searchQuery = "";
    let editingItemId = null; // null = adding a new product, otherwise editing this item's id
    let pendingImageDataUrl = ""; // used for the <img> preview only now
    let pendingImageFile = null; // the real File, uploaded to Storage on submit
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

    // ---------- STORAGE (Supabase) ----------
    // `items` is a plain in-memory mirror of public.inventory_items, kept
    // in the exact shape the rendering code below already expects
    // (id/name/category/stock/unit/price/image). Every mutation below
    // writes through to Supabase FIRST, then updates this mirror only
    // once the database confirms it worked — so the UI never shows a
    // change that didn't actually get saved.

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

    // Maps a public.inventory_items row (image_url) to the shape the
    // rendering code uses (image).
    function mapRow(row) {
        return {
            id: row.id,
            name: row.name,
            category: row.category,
            stock: row.stock,
            unit: row.unit,
            price: Number(row.price) || 0,
            image: row.image_url || ""
        };
    }

    // Used only for "Added"/"Deleted" log rows, where there's no
    // existing row to lock — the atomic adjust_inventory_stock() RPC
    // (used everywhere else) covers +/- changes on an existing item.
    async function logInventoryActivity(itemId, action, item, change, resultingStock) {
        const { data: userData } = await sb.auth.getUser();

        const { error } = await sb.from("inventory_logs").insert({
            item_id: itemId,
            item_name: item.name,
            category: item.category,
            action: action,
            change: change,
            resulting_stock: resultingStock,
            role: getCurrentUserRole(),
            created_by: userData && userData.user ? userData.user.id : null
        });

        if (error) {
            console.error("Could not save inventory log:", error.message);
        }
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

    async function loadItems() {
        const { data, error } = await sb
            .from("inventory_items")
            .select("*")
            .order("name", { ascending: true });

        if (error) {
            console.error("Could not load inventory:", error.message);
            alert("Could not load inventory from the database. Please refresh the page.");
            items = [];
            return;
        }

        items = (data || []).map(mapRow).map(normalizeItem);
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
                ? `<img class="inventory-thumb" src="${item.image}" alt="${item.name}" loading="lazy" decoding="async">`
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
            ? `<img class="inventory-image" src="${item.image}" alt="${item.name}" loading="lazy" decoding="async">`
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

    async function changeStock(itemId, delta) {
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        // Guard against going below 0 up front so a rejected RPC call
        // (adjust_inventory_stock also refuses this server-side) doesn't
        // even need a round trip for the common "already at 0" case.
        if (delta < 0 && item.stock <= 0) return;

        const { data: log, error } = await sb.rpc("adjust_inventory_stock", {
            p_item_id: itemId,
            p_change: delta,
            p_action: delta > 0 ? "Stock In" : "Stock Out"
        });

        if (error) {
            alert("Could not update stock: " + error.message);
            return;
        }

        item.stock = log.resulting_stock;
        updateItemInDOM(item);
        updateStats();
    }

    async function deleteProduct(item) {
        const confirmed = confirm(`Delete "${item.name}" from Inventory? This can't be undone.`);
        if (!confirmed) return;

        // Logged BEFORE the delete, while item_id can still point at a
        // real row. inventory_logs.item_id is ON DELETE SET NULL, so
        // this row survives the delete below (item_name/category are
        // stored directly on the log too) — it just loses the live FK
        // link afterward. Logged unconditionally (not just when stock >
        // 0) so deleting an already-empty item still shows up in Recent
        // Activities/Reports instead of vanishing without a trace.
        await logInventoryActivity(item.id, "Deleted", item, -item.stock, 0);

        const { error } = await sb
            .from("inventory_items")
            .delete()
            .eq("id", item.id);

        if (error) {
            alert("Could not delete product: " + error.message);
            return;
        }

        await deleteStorageImage(item.image);

        items = items.filter(i => i.id !== item.id);
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
        pendingImageFile = null;
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
        pendingImageFile = null;

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

    // Shrinks a photo in the browser before upload (phone photos are
    // often 3-8 MB; after this they are roughly 50-150 KB). The bucket
    // only accepts jpeg/png/webp up to 2 MB, so this also keeps
    // uploads from being rejected.
    // Every product photo is saved as a 3:2 landscape image. The WHOLE
    // photo is kept visible (nothing is cropped): it is centered on top
    // of a blurred, lightened copy of itself that fills the empty sides.
    const IMAGE_WIDTH = 800;
    const IMAGE_HEIGHT = 533; // 3:2
    const IMAGE_QUALITY = 0.8;

    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);

            img.onload = () => {
                const W = IMAGE_WIDTH;
                const H = IMAGE_HEIGHT;
                const canvas = document.createElement("canvas");
                canvas.width = W;
                canvas.height = H;
                const ctx = canvas.getContext("2d");
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";

                // Blurred background. Drawing the photo tiny and scaling it
                // back up gives a soft blur that works on every browser
                // (ctx.filter is not supported on Safari / iPhone).
                const tiny = document.createElement("canvas");
                tiny.width = 32;
                tiny.height = Math.round(32 * H / W);
                const tctx = tiny.getContext("2d");
                tctx.imageSmoothingQuality = "high";
                const cover = Math.max(tiny.width / img.width, tiny.height / img.height);
                tctx.drawImage(
                    img,
                    (tiny.width - img.width * cover) / 2,
                    (tiny.height - img.height * cover) / 2,
                    img.width * cover,
                    img.height * cover
                );
                ctx.drawImage(tiny, 0, 0, W, H);
                ctx.fillStyle = "rgba(255, 255, 255, 0.18)"; // lighten
                ctx.fillRect(0, 0, W, H);

                // Whole photo, centered, never cropped.
                const fit = Math.min(W / img.width, H / img.height);
                const w = img.width * fit;
                const h = img.height * fit;
                ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);

                URL.revokeObjectURL(objectUrl);

                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error("Could not compress image.")),
                    "image/webp",
                    IMAGE_QUALITY
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("That file could not be read as an image."));
            };
            img.src = objectUrl;
        });
    }

    async function handleImageUpload(file) {
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please choose an image file.");
            return;
        }

        try {
            // pendingImageFile is now the compressed Blob (not the original File).
            pendingImageFile = await compressImage(file);

            if (pendingImageDataUrl.startsWith("blob:")) {
                URL.revokeObjectURL(pendingImageDataUrl);
            }
            pendingImageDataUrl = URL.createObjectURL(pendingImageFile); // preview only
            productImagePreview.src = pendingImageDataUrl;
            productImagePreview.style.display = "block";
            productImageUploadText.style.display = "none";
        } catch (err) {
            alert(err.message);
        }
    }

    // Uploads pendingImageFile to the "images" Storage bucket and
    // returns its public URL. Returns null if no new file was chosen
    // (caller should keep the item's existing image_url in that case).
    async function uploadPendingImage(folder) {
        if (!pendingImageFile) return null;

        const path = `${folder}/${crypto.randomUUID()}.webp`;

        const { error } = await sb.storage
            .from("images")
            .upload(path, pendingImageFile, {
                contentType: "image/webp",
                cacheControl: "31536000",
                upsert: false
            });

        if (error) {
            throw new Error("Image upload failed: " + error.message);
        }

        const { data } = sb.storage.from("images").getPublicUrl(path);
        return data.publicUrl;
    }

    // Reverses getPublicUrl() — pulls the path back out of a public URL
    // so it can be passed to storage.remove(). Returns null for
    // anything that isn't one of our own "images" bucket URLs (empty
    // string, some other host, or a leftover base64 string from before
    // this bucket existed) so cleanup never touches those.
    function getStoragePathFromPublicUrl(url) {
        if (!url) return null;
        const marker = "/storage/v1/object/public/images/";
        const idx = url.indexOf(marker);
        if (idx === -1) return null;
        return url.slice(idx + marker.length);
    }

    // Best-effort cleanup: failures here are logged but never block or
    // alert on the calling action, since the database change (the part
    // that actually matters) already succeeded by the time this runs.
    async function deleteStorageImage(url) {
        const path = getStoragePathFromPublicUrl(url);
        if (!path) return;

        const { error } = await sb.storage.from("images").remove([path]);
        if (error) {
            console.error("Could not delete old image from storage:", error.message);
        }
    }

    async function handleAddProductSubmit(e) {
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

        saveProductBtn.disabled = true;

        let imageUrl;
        try {
            const uploadedUrl = await uploadPendingImage("inventory");
            // null means no new file was chosen — keep whatever's
            // already there (existing item's URL on edit, or none for
            // a brand new item without a picture).
            imageUrl = uploadedUrl !== null
                ? uploadedUrl
                : (editingItemId ? (items.find(i => i.id === editingItemId) || {}).image || "" : "");
        } catch (uploadError) {
            alert(uploadError.message);
            saveProductBtn.disabled = false;
            return;
        }

        if (editingItemId) {

            const item = items.find(i => i.id === editingItemId);
            if (!item) {
                saveProductBtn.disabled = false;
                return;
            }

            const previousStock = item.stock;
            const netChange = stock - previousStock;
            const previousImageUrl = item.image;

            // Non-stock fields go through a plain update. Stock is
            // deliberately left OUT of this update — it's only ever
            // changed via adjust_inventory_stock() below, so every stock
            // change (whether from +/- buttons or from editing this
            // form) is logged the same atomic way.
            const { error: updateError } = await sb
                .from("inventory_items")
                .update({
                    name: name,
                    category: category,
                    unit: unit,
                    price: price,
                    image_url: imageUrl || null
                })
                .eq("id", editingItemId);

            if (updateError) {
                alert("Could not update product: " + updateError.message);
                saveProductBtn.disabled = false;
                return;
            }

            item.name = name;
            item.category = category;
            item.unit = unit;
            item.price = price;
            item.image = imageUrl;

            if (imageUrl !== previousImageUrl) {
                await deleteStorageImage(previousImageUrl);
            }

            if (netChange !== 0) {
                const { data: log, error: stockError } = await sb.rpc("adjust_inventory_stock", {
                    p_item_id: editingItemId,
                    p_change: netChange,
                    p_action: "Edited"
                });

                if (stockError) {
                    alert(
                        "Product details were saved, but the stock change failed: " +
                        stockError.message
                    );
                } else {
                    item.stock = log.resulting_stock;
                }
            } else {
                // Stock didn't change, but name/category/unit/price still
                // might have — adjust_inventory_stock() is the only thing
                // that writes an "Edited" log row, and it's only called
                // above when there's an actual stock delta. Without this,
                // editing a product's details while leaving its quantity
                // untouched (a very normal edit) never got logged at all.
                await logInventoryActivity(editingItemId, "Edited", item, 0, item.stock);
            }

        } else {

            const { data: inserted, error: insertError } = await sb
                .from("inventory_items")
                .insert({
                    name: name,
                    category: category,
                    stock: stock,
                    unit: unit,
                    price: price,
                    image_url: imageUrl || null
                })
                .select()
                .single();

            if (insertError) {
                alert("Could not add product: " + insertError.message);
                saveProductBtn.disabled = false;
                return;
            }

            const newItem = mapRow(inserted);
            items.push(newItem);

            // Logged unconditionally (not just when stock > 0) so a
            // product added with 0 starting stock still shows up in
            // Recent Activities/Reports instead of vanishing without
            // a trace.
            await logInventoryActivity(newItem.id, "Added", newItem, stock, stock);
        }

        saveProductBtn.disabled = false;

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

        const isRow = target.tagName === "TR";

        if (isRow) {
            // Same color as the row :hover in Inventory.css
            target.style.transition = "background 0.3s ease";
            target.style.background = "#f0caca";
        } else {
            // Card view: hover-style lift shadow instead of a line
            target.style.transition = "box-shadow 0.3s ease";
            target.style.boxShadow = "0 12px 26px rgba(90, 15, 15, 0.4)";
        }

        setTimeout(() => {
            if (isRow) {
                target.style.background = "";
            } else {
                target.style.boxShadow = "";
            }
        }, 2400);

        // Clean the URL so refreshing the page doesn't re-trigger the flash
        params.delete("highlight");
        params.delete("category");
        const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", cleanUrl);
    }

    // ---------- INIT ----------

    async function init() {
        await loadItems();

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