/* =====================================================
   YESUNIM — SALES PAGE LOGIC
   Handles: menu rendering, Add/Edit/Delete Menu popup
   (with description + image upload), current order cart
   (pax +2 per click), totals, cash/change, record/clear.
===================================================== */

(function () {

    // Fired the instant this script runs — the network request is now
    // already in flight while the rest of init() (cache paint, event
    // listeners, etc.) is still being set up below, instead of only
    // starting once init() sequentially reaches loadMenuItems().
    const initialMenuFetchPromise = sb
        .from("menu_items")
        .select("id, name, price, description, image_url, created_at")
        .order("created_at", { ascending: true });

    // ---------- STATE ----------
    let menuItems = [];
    let currentOrder = []; // { orderId, menuId, name, price, pax }
    let editingItemId = null; // null = adding a new item, otherwise editing this item's id

    const PAX_STEP = 2; // clicking a menu card adds this many pax at a time
    const MIN_PAX = 1;  // pax can never go below this — use the trash icon to remove the line instead

    // ---------- ROLE ----------
    // Cashiers can record sales but must not be able to add, edit, or
    // delete menu items. getCurrentUserRole() is the same helper already
    // used below when recording a transaction (defined globally, e.g. by
    // sidebar.js), so this stays in sync with whatever role the person
    // logged in as.
    const isCashier = (getCurrentUserRole() || "").trim().toLowerCase() === "cashier";

    // ---------- ELEMENTS ----------
    const menuGrid = document.getElementById("menuGrid");
    const orderList = document.getElementById("orderList");
    const menuSearchInput = document.getElementById("menuSearchInput");

    const subtotalEl = document.getElementById("subtotal");
    const discountInput = document.getElementById("discountInput");
    const totalEl = document.getElementById("total");

    const cashReceivedInput = document.getElementById("cashReceived");
    const changeInput = document.getElementById("change");

    const recordBtn = document.getElementById("recordTransactionBtn");
    const clearBtn = document.getElementById("clearOrderBtn");

    const currentDateEl = document.getElementById("currentDate");
    const currentTimeEl = document.getElementById("currentTime");

    // Add/Edit Menu popup elements
    const addMenuOverlay = document.getElementById("addMenuOverlay");
    const openAddMenuBtn = document.getElementById("openAddMenuBtn");
    const closeAddMenuBtn = document.getElementById("closeAddMenuBtn");
    const cancelAddMenuBtn = document.getElementById("cancelAddMenuBtn");
    const addMenuForm = document.getElementById("addMenuForm");
    const popupTitle = document.querySelector("#addMenuOverlay .popup-header h2");
    const saveMenuBtn = document.getElementById("saveMenuBtn");

    const imageUploadBox = document.getElementById("imageUploadBox");
    const menuImageInput = document.getElementById("menuImageInput");
    const menuImagePreview = document.getElementById("menuImagePreview");
    const imageUploadText = document.getElementById("imageUploadText");

    const menuNameInput = document.getElementById("menuNameInput");
    const menuPriceInput = document.getElementById("menuPriceInput");
    const menuDescriptionInput = document.getElementById("menuDescriptionInput");

    let pendingImageUrl = "";   // image already saved for this item (Storage URL, legacy base64, or "")
    let pendingImageBlob = null; // newly picked image, compressed, not uploaded until Save
    let pendingPreviewUrl = "";  // temporary blob: URL used only for the popup preview

    // Menu Saved confirmation popup elements — shown after Add/Update
    // Menu finishes, mirroring back everything that was just saved.
    const menuSavedOverlay = document.getElementById("menuSavedOverlay");
    const menuSavedTitle = document.getElementById("menuSavedTitle");
    const menuSavedImage = document.getElementById("menuSavedImage");
    const menuSavedImagePlaceholder = document.getElementById("menuSavedImagePlaceholder");
    const menuSavedName = document.getElementById("menuSavedName");
    const menuSavedPrice = document.getElementById("menuSavedPrice");
    const menuSavedDescription = document.getElementById("menuSavedDescription");
    const closeMenuSavedBtn = document.getElementById("closeMenuSavedBtn");
    const menuSavedOkBtn = document.getElementById("menuSavedOkBtn");

    // ---------- HELPERS ----------

    function formatCurrency(amount) {
        const value = isNaN(amount) ? 0 : amount;
        return "₱ " + value.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function parseCurrencyInput(str) {
        const cleaned = String(str).replace(/[^0-9.]/g, "");
        const value = parseFloat(cleaned);
        return isNaN(value) ? 0 : value;
    }

    function mapMenuRow(row) {
        return {
            id: row.id,
            name: row.name,
            price: Number(row.price) || 0,
            description: row.description || "",
            image: row.image_url || ""
        };
    }

    // Menu is cached in localStorage so the grid can paint instantly on
    // page load (no blank screen or spinner while waiting on the
    // network) and then gets silently refreshed from Supabase in the
    // background once the real data comes back.
    const MENU_CACHE_KEY = "yesunimMenuCache";

    function loadCachedMenuItems() {
        try {
            const raw = localStorage.getItem(MENU_CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function saveCachedMenuItems(items) {
        try {
            localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(items));
        } catch (e) { /* ignore — cache is a nice-to-have, not required */ }
    }

    // useInitialFetch: true only on the very first call in init(), so
    // it reuses the request already kicked off at script load instead
    // of firing a second, redundant query. Any later refresh (after
    // add/edit/delete) calls this normally and fires a fresh query.
    async function loadMenuItems(useInitialFetch) {
        // Only pulling the columns actually rendered on this page
        // (not select("*")) keeps the payload smaller. Ordered by
        // created_at (i.e. the order items were added in), not
        // alphabetically by name. For best results, add an index on
        // created_at in Supabase:
        //   create index if not exists idx_menu_items_created_at
        //     on menu_items (created_at);
        const { data, error } = useInitialFetch
            ? await initialMenuFetchPromise
            : await sb
                .from("menu_items")
                .select("id, name, price, description, image_url, created_at")
                .order("created_at", { ascending: true });

        if (error) {
            console.error("Could not load menu:", error.message);
            // Only alert if there's nothing at all on screen (no cache
            // to fall back on either) — otherwise leave the cached
            // menu showing and fail quietly.
            if (menuItems.length === 0) {
                alert("Could not load the menu from the database. Please refresh the page.");
            }
            return;
        }

        menuItems = (data || []).map(mapMenuRow);
        saveCachedMenuItems(menuItems);
    }

    // ---------- QUANTITY-IN-ORDER LOOKUP ----------

    function getOrderQtyForMenuId(menuId) {
        const order = currentOrder.find(o => o.menuId === menuId);
        return order ? order.pax : 0;
    }

    // ---------- MENU RENDERING ----------

    function renderMenuGrid(filterText) {
        menuGrid.innerHTML = "";

        const filter = (filterText || "").trim().toLowerCase();

        const itemsToShow = menuItems.filter(item =>
            item.name.toLowerCase().includes(filter)
        );

        if (itemsToShow.length === 0) {
            menuGrid.innerHTML = "<p style='grid-column:1/-1;color:#999;font-size:13px;'>No menu items found.</p>";
            return;
        }

        itemsToShow.forEach(item => {
            const card = document.createElement("div");
            card.className = "menu-card";
            card.dataset.id = item.id;

            if (item.description) {
                card.title = item.description;
            }

            const imageHtml = item.image
                ? `<img class="menu-image" src="${item.image}" alt="${item.name}" loading="lazy" decoding="async">`
                : `<div class="menu-image" style="display:flex;align-items:center;justify-content:center;background:#f1e6e2;color:#c46e6e;"><i class='bx bx-image' style='font-size:26px;'></i></div>`;

            const qty = getOrderQtyForMenuId(item.id);
            const badgeHtml = qty > 0
                ? `<div class="menu-card-qty-badge">${qty}</div>`
                : "";

            // Cashiers can only place orders — no edit/delete controls on
            // the card at all for that role.
            const cardActionsHtml = isCashier
                ? ""
                : `
                <div class="card-actions">
                    <button type="button" class="edit-menu-btn" title="Edit"><i class='bx bx-edit'></i></button>
                    <button type="button" class="delete-menu-btn" title="Delete"><i class='bx bx-trash'></i></button>
                </div>`;

            card.innerHTML = `
                ${badgeHtml}
                ${cardActionsHtml}
                ${imageHtml}
                <div class="menu-name">${item.name}</div>
                <div class="menu-price">₱${item.price}</div>
            `;

            card.addEventListener("click", () => addToOrder(item));

            if (!isCashier) {
                card.querySelector(".edit-menu-btn").addEventListener("click", (e) => {
                    e.stopPropagation();
                    openEditMenuPopup(item);
                });

                card.querySelector(".delete-menu-btn").addEventListener("click", (e) => {
                    e.stopPropagation();
                    deleteMenuItem(item);
                });
            }

            menuGrid.appendChild(card);
        });
    }

    // ---------- MENU ACTIVITY LOG ----------
    // Writes one row to "menu_logs" every time a menu item is added,
    // edited or deleted, so the Dashboard's Recent Activities can show it.
    // Fire-and-forget: a logging failure must never block the real action.
    async function logMenuAction(action, itemName, details) {
        try {
            const { data: userData } = await sb.auth.getUser();

            const { error } = await sb.from("menu_logs").insert({
                role: getCurrentUserRole(),
                created_by: userData && userData.user ? userData.user.id : null,
                action: action,
                item_name: itemName,
                details: details || null
            });

            if (error) console.error("Could not log menu activity:", error.message);
        } catch (err) {
            console.error("Could not log menu activity:", err);
        }
    }

    function peso(n) {
        return "₱" + (Number(n) || 0).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    async function deleteMenuItem(item) {
        if (isCashier) return; // cashiers can't delete menu items

        const confirmed = confirm(`Delete "${item.name}" from the menu? This can't be undone.`);
        if (!confirmed) return;

        const { error } = await sb
            .from("menu_items")
            .delete()
            .eq("id", item.id);

        if (error) {
            alert("Could not delete menu item: " + error.message);
            return;
        }

        logMenuAction("Deleted", item.name, "was " + peso(item.price));

        menuItems = menuItems.filter(m => m.id !== item.id);
        saveCachedMenuItems(menuItems);
        renderMenuGrid(menuSearchInput.value);
    }

    // ---------- ORDER / CART ----------

    function addToOrder(menuItem) {
        const existing = currentOrder.find(o => o.menuId === menuItem.id);

        if (existing) {
            existing.pax += 1;
        } else {
            currentOrder.push({
                orderId: "o_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
                menuId: menuItem.id,
                name: menuItem.name,
                price: menuItem.price,
                pax: PAX_STEP
            });
        }

        renderOrderList();
        renderMenuGrid(menuSearchInput.value);
    }

    function renderOrderList() {
        orderList.innerHTML = "";

        currentOrder.forEach(order => {
            const row = document.createElement("div");
            row.className = "order-row";
            row.dataset.orderId = order.orderId;

            const lineTotal = order.price * order.pax;

            // At the floor (1 pax), swap the minus button for a warning
            // icon instead — there's nothing to decrement to below 1, so
            // the only way to go lower is to remove the line entirely
            // via the trash icon.
            const atMinPax = order.pax <= MIN_PAX;
            const minusControlHtml = atMinPax
                ? `<i class='bx bxs-error-circle pax-warning-icon' title="Minimum of ${MIN_PAX} pax — use the trash icon to remove this item"></i>`
                : `<button type="button" class="pax-btn minus-btn">−</button>`;

            row.innerHTML = `
                <div class="order-name">${order.name}</div>
                <div class="order-pax">
                    ${minusControlHtml}
                    <span class="pax-number">${order.pax}</span>
                    <button type="button" class="pax-btn plus-btn">+</button>
                </div>
                <div class="order-price">₱${lineTotal.toFixed(2)}</div>
                <button type="button" class="delete-order"><i class='bx bx-trash'></i></button>
            `;

            const minusBtn = row.querySelector(".minus-btn");
            if (minusBtn) {
                minusBtn.addEventListener("click", () => changePax(order.orderId, -1));
            }
            row.querySelector(".plus-btn").addEventListener("click", () => changePax(order.orderId, 1));
            row.querySelector(".delete-order").addEventListener("click", () => removeFromOrder(order.orderId));

            orderList.appendChild(row);
        });

        updateTotals();
    }

    function changePax(orderId, delta) {
        const order = currentOrder.find(o => o.orderId === orderId);
        if (!order) return;

        // Never let pax drop below MIN_PAX (1) or go negative — the
        // minus button is already hidden at that point, but this guards
        // against it regardless of how changePax gets called.
        order.pax = Math.max(MIN_PAX, order.pax + delta);

        renderOrderList();
        renderMenuGrid(menuSearchInput.value);
    }

    function removeFromOrder(orderId) {
        currentOrder = currentOrder.filter(o => o.orderId !== orderId);
        renderOrderList();
        renderMenuGrid(menuSearchInput.value);
    }

    function calculateSubtotal() {
        return currentOrder.reduce((sum, o) => sum + (o.price * o.pax), 0);
    }

    function getDiscountAmount() {
        const subtotal = calculateSubtotal();
        let discount = parseCurrencyInput(discountInput.value);

        if (discount < 0) discount = 0;
        if (discount > subtotal) discount = subtotal; // can't discount more than the order is worth

        return discount;
    }

    function calculateTotal() {
        return calculateSubtotal() - getDiscountAmount();
    }

    function updateTotals() {
        const subtotal = calculateSubtotal();
        const discount = getDiscountAmount();
        const total = subtotal - discount;

        subtotalEl.textContent = formatCurrency(subtotal);
        totalEl.textContent = formatCurrency(total);

        updateChange();
    }

    function updateChange() {
        const total = calculateTotal();
        const cash = parseCurrencyInput(cashReceivedInput.value);
        const change = cash - total;

        changeInput.value = formatCurrency(change > 0 ? change : 0);
    }

    function clearOrder() {
        currentOrder = [];
        cashReceivedInput.value = formatCurrency(0);
        discountInput.value = formatCurrency(0);
        renderOrderList();
        renderMenuGrid(menuSearchInput.value);
    }

    async function recordTransaction() {
        if (currentOrder.length === 0) {
            alert("Add at least one item to the order before recording a transaction.");
            return;
        }

        const subtotal = calculateSubtotal();
        const discount = getDiscountAmount();
        const total = subtotal - discount;
        const cash = parseCurrencyInput(cashReceivedInput.value);

        if (cash < total) {
            alert("Cash received is less than the total amount.");
            return;
        }

        recordBtn.disabled = true;

        const { data: userData } = await sb.auth.getUser();

        const { error } = await sb.from("transactions").insert({
            role: getCurrentUserRole(),
            created_by: userData && userData.user ? userData.user.id : null,
            // menu_id is kept alongside name/price/pax so this line item
            // stays traceable back to the menu_items row even if the
            // menu item's name or price is edited later.
            items: currentOrder.map(o => ({
                menu_id: o.menuId,
                name: o.name,
                price: o.price,
                pax: o.pax,
                lineTotal: o.price * o.pax
            })),
            subtotal: subtotal,
            discount: discount,
            total: total,
            cash_received: cash,
            change: cash - total
        });

        recordBtn.disabled = false;

        if (error) {
            alert("Could not record transaction: " + error.message);
            return;
        }

        clearOrder();
        alert("Transaction recorded successfully.");
    }

    // ---------- IMAGE STORAGE (Supabase Storage bucket "images") ----------

    const IMAGE_BUCKET = "images";
    const IMAGE_MAX_WIDTH = 800;   // px — plenty for a menu card
    const IMAGE_QUALITY = 0.8;

    // Shrinks a photo in the browser before upload (phone photos are
    // often 3-8 MB; after this they are roughly 50-150 KB).
    function compressImage(fileOrBlob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(fileOrBlob);

            img.onload = () => {
                const scale = Math.min(1, IMAGE_MAX_WIDTH / img.width);
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
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

    // Uploads a compressed image and returns its public URL.
    async function uploadMenuImage(blob) {
        const path = "menu/" + crypto.randomUUID() + ".webp";

        const { error } = await sb.storage
            .from(IMAGE_BUCKET)
            .upload(path, blob, {
                contentType: "image/webp",
                cacheControl: "31536000"
            });

        if (error) throw error;

        return sb.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    // Deletes a file from Storage given its public URL. Ignores empty
    // values, legacy base64 images, and URLs that aren't in our bucket.
    async function deleteMenuImage(publicUrl) {
        if (!publicUrl) return;

        const marker = "/object/public/" + IMAGE_BUCKET + "/";
        const idx = publicUrl.indexOf(marker);
        if (idx === -1) return;

        const path = decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0]);
        const { error } = await sb.storage.from(IMAGE_BUCKET).remove([path]);
        if (error) console.warn("Could not delete old image:", error.message);
    }

    function clearPreviewUrl() {
        if (pendingPreviewUrl) {
            URL.revokeObjectURL(pendingPreviewUrl);
            pendingPreviewUrl = "";
        }
    }

    function showImagePreview(src) {
        if (src) {
            menuImagePreview.src = src;
            menuImagePreview.style.display = "block";
            imageUploadText.style.display = "none";
        } else {
            menuImagePreview.src = "";
            menuImagePreview.style.display = "none";
            imageUploadText.style.display = "flex";
        }
    }

    // ---------- ADD / EDIT MENU POPUP ----------

    function openAddMenuPopup() {
        if (isCashier) return; // cashiers can't add menu items

        editingItemId = null;
        popupTitle.textContent = "Add Menu Item";
        saveMenuBtn.textContent = "Save Menu";

        addMenuForm.reset();
        clearPreviewUrl();
        pendingImageUrl = "";
        pendingImageBlob = null;
        showImagePreview("");

        addMenuOverlay.classList.add("show");
    }

    function openEditMenuPopup(item) {
        if (isCashier) return; // cashiers can't edit menu items

        editingItemId = item.id;
        popupTitle.textContent = "Edit Menu Item";
        saveMenuBtn.textContent = "Update Menu";

        menuNameInput.value = item.name;
        menuPriceInput.value = item.price;
        menuDescriptionInput.value = item.description || "";

        clearPreviewUrl();
        pendingImageBlob = null;
        pendingImageUrl = item.image || "";
        showImagePreview(pendingImageUrl);

        addMenuOverlay.classList.add("show");
    }

    function closeAddMenuPopup() {
        addMenuOverlay.classList.remove("show");
        editingItemId = null;
    }

    async function handleImageUpload(file) {
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please choose an image file.");
            return;
        }

        try {
            // Compress now so the preview shows exactly what will be
            // uploaded. Nothing is sent to Storage until Save is clicked.
            pendingImageBlob = await compressImage(file);

            clearPreviewUrl();
            pendingPreviewUrl = URL.createObjectURL(pendingImageBlob);
            showImagePreview(pendingPreviewUrl);
        } catch (err) {
            alert(err.message);
        }
    }

    async function handleAddMenuSubmit(e) {
        e.preventDefault();

        if (isCashier) return; // cashiers can't add/update menu items

        const name = menuNameInput.value.trim();
        const price = parseFloat(menuPriceInput.value);
        const description = menuDescriptionInput.value.trim();

        if (!name || isNaN(price) || price < 0) {
            alert("Please enter a valid menu name and price.");
            return;
        }

        // Captured before closeAddMenuPopup() clears editingItemId, so the
        // confirmation message can say "updated" vs. "added" correctly.
        const wasEditing = Boolean(editingItemId);

        saveMenuBtn.disabled = true;

        // ----- Work out the final image URL (upload to Storage if needed) -----
        const previousImageUrl = wasEditing
            ? ((menuItems.find(m => m.id === editingItemId) || {}).image || "")
            : "";

        let finalImageUrl = pendingImageUrl;   // unchanged by default
        let uploadedNewUrl = "";               // set only if we upload in this save

        try {
            let blobToUpload = pendingImageBlob;

            // Legacy item whose image is still a base64 string in the DB:
            // convert it to a real file the first time it is saved.
            if (!blobToUpload && pendingImageUrl.startsWith("data:")) {
                const legacyBlob = await (await fetch(pendingImageUrl)).blob();
                blobToUpload = await compressImage(legacyBlob);
            }

            if (blobToUpload) {
                uploadedNewUrl = await uploadMenuImage(blobToUpload);
                finalImageUrl = uploadedNewUrl;
            }
        } catch (err) {
            saveMenuBtn.disabled = false;
            alert("Could not upload image: " + err.message);
            return;
        }

        if (editingItemId) {

            const { error } = await sb
                .from("menu_items")
                .update({
                    name: name,
                    price: price,
                    description: description,
                    image_url: finalImageUrl || null
                })
                .eq("id", editingItemId);

            saveMenuBtn.disabled = false;

            if (error) {
                // DB write failed — don't leave an orphaned upload behind.
                await deleteMenuImage(uploadedNewUrl);
                alert("Could not update menu item: " + error.message);
                return;
            }

            // Image was replaced or removed — delete the old file.
            if (previousImageUrl && previousImageUrl !== finalImageUrl) {
                await deleteMenuImage(previousImageUrl);
            }

            const item = menuItems.find(m => m.id === editingItemId);
            if (item) {
                // Work out what actually changed (before overwriting it) for the activity log.
                const changes = [];
                if (item.name !== name) changes.push(`name: ${item.name} → ${name}`);
                if (Number(item.price) !== price) changes.push(`price: ${peso(item.price)} → ${peso(price)}`);
                if ((item.description || "") !== description) changes.push("description updated");
                if ((item.image || "") !== (finalImageUrl || "")) {
                    changes.push(finalImageUrl ? "image changed" : "image removed");
                }
                if (changes.length) logMenuAction("Edited", name, changes.join(", "));

                item.name = name;
                item.price = price;
                item.description = description;
                item.image = finalImageUrl;
            }

        } else {

            const { data: inserted, error } = await sb
                .from("menu_items")
                .insert({
                    name: name,
                    price: price,
                    description: description,
                    image_url: finalImageUrl || null
                })
                .select()
                .single();

            saveMenuBtn.disabled = false;

            if (error) {
                await deleteMenuImage(uploadedNewUrl);
                alert("Could not add menu item: " + error.message);
                return;
            }

            logMenuAction("Added", name, peso(price));

            menuItems.push(mapMenuRow(inserted));
        }

        saveCachedMenuItems(menuItems);
        renderMenuGrid(menuSearchInput.value);

        closeAddMenuPopup();

        showMenuSavedPopup(wasEditing, {
            name: name,
            price: price,
            description: description,
            image: finalImageUrl
        });

        clearPreviewUrl();
        pendingImageBlob = null;
    }

    function showMenuSavedPopup(wasEditing, item) {
        menuSavedTitle.textContent = wasEditing ? "Menu Item Updated" : "Menu Item Added";

        if (item.image) {
            menuSavedImage.src = item.image;
            menuSavedImage.style.display = "block";
            menuSavedImagePlaceholder.style.display = "none";
        } else {
            menuSavedImage.src = "";
            menuSavedImage.style.display = "none";
            menuSavedImagePlaceholder.style.display = "block";
        }

        menuSavedName.textContent = item.name;
        menuSavedPrice.textContent = formatCurrency(item.price);
        menuSavedDescription.textContent = item.description || "No description provided.";

        menuSavedOverlay.classList.add("show");
    }

    function closeMenuSavedPopup() {
        menuSavedOverlay.classList.remove("show");
    }

    // ---------- DATE / TIME ----------

    function updateDateTime() {
        const now = new Date();

        currentDateEl.textContent = now.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
        });

        currentTimeEl.textContent = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        });
    }

    // ---------- CLICK-TO-CLEAR / ENTER-TO-FORMAT CURRENCY INPUTS ----------

    function setupCurrencyInputBehavior(inputEl, onUpdate) {
        // Clicking in: strip the ₱ formatting so it's easy to type a fresh number
        inputEl.addEventListener("focus", () => {
            const raw = parseCurrencyInput(inputEl.value);
            inputEl.value = raw === 0 ? "" : String(raw);
        });

        // Live update as they type
        inputEl.addEventListener("input", onUpdate);

        // Pressing Enter finishes input, same as clicking away
        inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                inputEl.blur();
            }
        });

        // Clicking away (or Enter) reformats back to ₱ 0.00 style
        inputEl.addEventListener("blur", () => {
            const value = parseCurrencyInput(inputEl.value);
            inputEl.value = formatCurrency(value);
            onUpdate();
        });
    }

    // ---------- INIT ----------

    async function init() {
        // Paint instantly from cache (if we have one) so there's no
        // blank grid / delay on click — then quietly fetch the real
        // menu in the background and re-render if it changed.
        const cached = loadCachedMenuItems();
        if (cached && cached.length > 0) {
            menuItems = cached;
        }

        // Cashiers get a search box and menu grid only — no way to add,
        // edit, or delete menu items.
        if (isCashier) {
            openAddMenuBtn.style.display = "none";
        }

        renderMenuGrid("");
        renderOrderList();

        updateDateTime();
        setInterval(updateDateTime, 1000 * 30);

        cashReceivedInput.value = formatCurrency(0);
        discountInput.value = formatCurrency(0);

        // Search
        menuSearchInput.addEventListener("input", () => {
            renderMenuGrid(menuSearchInput.value);
        });

        // Cash Received & Discount — clear on click, reformat on Enter/blur
        setupCurrencyInputBehavior(cashReceivedInput, updateChange);
        setupCurrencyInputBehavior(discountInput, updateTotals);

        // Order buttons
        recordBtn.addEventListener("click", recordTransaction);
        clearBtn.addEventListener("click", clearOrder);

        // Add/Edit Menu popup
        openAddMenuBtn.addEventListener("click", openAddMenuPopup);
        closeAddMenuBtn.addEventListener("click", closeAddMenuPopup);
        cancelAddMenuBtn.addEventListener("click", closeAddMenuPopup);

        addMenuOverlay.addEventListener("click", (e) => {
            if (e.target === addMenuOverlay) closeAddMenuPopup();
        });

        // Menu Saved confirmation popup
        closeMenuSavedBtn.addEventListener("click", closeMenuSavedPopup);
        menuSavedOkBtn.addEventListener("click", closeMenuSavedPopup);
        menuSavedOverlay.addEventListener("click", (e) => {
            if (e.target === menuSavedOverlay) closeMenuSavedPopup();
        });

        imageUploadBox.addEventListener("click", () => menuImageInput.click());
        menuImageInput.addEventListener("change", (e) => {
            handleImageUpload(e.target.files[0]);
        });

        addMenuForm.addEventListener("submit", handleAddMenuSubmit);

        // Fetch the real menu from Supabase in the background. If it
        // differs from what's on screen (or nothing was cached), re-render.
        const before = JSON.stringify(menuItems);
        await loadMenuItems(true);
        if (JSON.stringify(menuItems) !== before) {
            renderMenuGrid(menuSearchInput.value);
            renderOrderList();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();s