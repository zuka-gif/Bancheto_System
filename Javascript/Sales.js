/* =====================================================
   YESUNIM — SALES PAGE LOGIC
   Handles: menu rendering, Add/Edit/Delete Menu popup
   (with description + image upload), current order cart
   (pax +2 per click), totals, cash/change, record/clear.
===================================================== */

(function () {

    const MENU_STORAGE_KEY = "yesunim_menuItems";
    const TRANSACTIONS_KEY = "yesunim_transactions";

    // ---------- DEFAULT MENU (used only the first time, if nothing saved yet) ----------
    const defaultMenu = [
        { id: "m1", name: "Unli Samgyup", price: 199, image: "", description: "" },
        { id: "m2", name: "Unli Samgyup", price: 279, image: "", description: "" },
        { id: "m3", name: "Unli Samgyup", price: 299, image: "", description: "" },
        { id: "m4", name: "Unli Beef Samgyup", price: 399, image: "", description: "" },
        { id: "m5", name: "Unli All Beef Samgyup", price: 499, image: "", description: "" },
        { id: "m6", name: "Unli Steak", price: 699, image: "", description: "" },
        { id: "m7", name: "Unli Fried Chicken (Assorted)", price: 299, image: "", description: "" },
        { id: "m8", name: "Unli Fried Chicken (Wings only)", price: 399, image: "", description: "" },
        { id: "m9", name: "Unli Samgyup x Fried Chicken", price: 499, image: "", description: "" }
    ];

    // ---------- STATE ----------
    let menuItems = [];
    let currentOrder = []; // { orderId, menuId, name, price, pax }
    let editingItemId = null; // null = adding a new item, otherwise editing this item's id

    const PAX_STEP = 2; // clicking a menu card adds this many pax at a time

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

    let pendingImageDataUrl = "";

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

    function saveMenuItems() {
        localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(menuItems));
    }

    function loadMenuItems() {
        const saved = localStorage.getItem(MENU_STORAGE_KEY);
        if (saved) {
            try {
                menuItems = JSON.parse(saved);
                return;
            } catch (e) {
                // fall through to default
            }
        }
        menuItems = defaultMenu;
        saveMenuItems();
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
                ? `<img class="menu-image" src="${item.image}" alt="${item.name}">`
                : `<div class="menu-image" style="display:flex;align-items:center;justify-content:center;background:#f1e6e2;color:#c46e6e;"><i class='bx bx-image' style='font-size:26px;'></i></div>`;

            const qty = getOrderQtyForMenuId(item.id);
            const badgeHtml = qty > 0
                ? `<div class="menu-card-qty-badge">${qty}</div>`
                : "";

            card.innerHTML = `
                ${badgeHtml}
                <div class="card-actions">
                    <button type="button" class="edit-menu-btn" title="Edit"><i class='bx bx-edit'></i></button>
                    <button type="button" class="delete-menu-btn" title="Delete"><i class='bx bx-trash'></i></button>
                </div>
                ${imageHtml}
                <div class="menu-name">${item.name}</div>
                <div class="menu-price">₱${item.price}</div>
            `;

            card.addEventListener("click", () => addToOrder(item));

            card.querySelector(".edit-menu-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                openEditMenuPopup(item);
            });

            card.querySelector(".delete-menu-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                deleteMenuItem(item);
            });

            menuGrid.appendChild(card);
        });
    }

    function deleteMenuItem(item) {
        const confirmed = confirm(`Delete "${item.name}" from the menu? This can't be undone.`);
        if (!confirmed) return;

        menuItems = menuItems.filter(m => m.id !== item.id);
        saveMenuItems();
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

            row.innerHTML = `
                <div class="order-name">${order.name}</div>
                <div class="order-pax">
                    <button type="button" class="pax-btn minus-btn">−</button>
                    <span class="pax-number">${order.pax}</span>
                    <button type="button" class="pax-btn plus-btn">+</button>
                </div>
                <div class="order-price">₱${lineTotal.toFixed(2)}</div>
                <button type="button" class="delete-order"><i class='bx bx-trash'></i></button>
            `;

            row.querySelector(".minus-btn").addEventListener("click", () => changePax(order.orderId, -1));
            row.querySelector(".plus-btn").addEventListener("click", () => changePax(order.orderId, 1));
            row.querySelector(".delete-order").addEventListener("click", () => removeFromOrder(order.orderId));

            orderList.appendChild(row);
        });

        updateTotals();
    }

    function changePax(orderId, delta) {
        const order = currentOrder.find(o => o.orderId === orderId);
        if (!order) return;

        order.pax += delta;

        if (order.pax <= 0) {
            removeFromOrder(orderId);
            return;
        }

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

    function recordTransaction() {
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

        const transaction = {
            id: "t_" + Date.now(),
            date: new Date().toISOString(),
            items: currentOrder.map(o => ({
                name: o.name,
                price: o.price,
                pax: o.pax,
                lineTotal: o.price * o.pax
            })),
            subtotal: subtotal,
            discount: discount,
            total: total,
            cashReceived: cash,
            change: cash - total
        };

        const saved = localStorage.getItem(TRANSACTIONS_KEY);
        const transactions = saved ? JSON.parse(saved) : [];
        transactions.push(transaction);
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));

        clearOrder();
        alert("Transaction recorded successfully.");
    }

    // ---------- ADD / EDIT MENU POPUP ----------

    function openAddMenuPopup() {
        editingItemId = null;
        popupTitle.textContent = "Add Menu Item";
        saveMenuBtn.textContent = "Save Menu";

        addMenuForm.reset();
        pendingImageDataUrl = "";
        menuImagePreview.src = "";
        menuImagePreview.style.display = "none";
        imageUploadText.style.display = "flex";

        addMenuOverlay.classList.add("show");
    }

    function openEditMenuPopup(item) {
        editingItemId = item.id;
        popupTitle.textContent = "Edit Menu Item";
        saveMenuBtn.textContent = "Update Menu";

        menuNameInput.value = item.name;
        menuPriceInput.value = item.price;
        menuDescriptionInput.value = item.description || "";

        pendingImageDataUrl = item.image || "";

        if (pendingImageDataUrl) {
            menuImagePreview.src = pendingImageDataUrl;
            menuImagePreview.style.display = "block";
            imageUploadText.style.display = "none";
        } else {
            menuImagePreview.src = "";
            menuImagePreview.style.display = "none";
            imageUploadText.style.display = "flex";
        }

        addMenuOverlay.classList.add("show");
    }

    function closeAddMenuPopup() {
        addMenuOverlay.classList.remove("show");
        editingItemId = null;
    }

    function handleImageUpload(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            pendingImageDataUrl = e.target.result;
            menuImagePreview.src = pendingImageDataUrl;
            menuImagePreview.style.display = "block";
            imageUploadText.style.display = "none";
        };
        reader.readAsDataURL(file);
    }

    function handleAddMenuSubmit(e) {
        e.preventDefault();

        const name = menuNameInput.value.trim();
        const price = parseFloat(menuPriceInput.value);
        const description = menuDescriptionInput.value.trim();

        if (!name || isNaN(price) || price < 0) {
            alert("Please enter a valid menu name and price.");
            return;
        }

        if (editingItemId) {
            const item = menuItems.find(m => m.id === editingItemId);
            if (item) {
                item.name = name;
                item.price = price;
                item.description = description;
                item.image = pendingImageDataUrl;
            }
        } else {
            menuItems.push({
                id: "m_" + Date.now(),
                name: name,
                price: price,
                description: description,
                image: pendingImageDataUrl
            });
        }

        saveMenuItems();
        renderMenuGrid(menuSearchInput.value);

        closeAddMenuPopup();
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

    function init() {
        loadMenuItems();
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

        imageUploadBox.addEventListener("click", () => menuImageInput.click());
        menuImageInput.addEventListener("change", (e) => {
            handleImageUpload(e.target.files[0]);
        });

        addMenuForm.addEventListener("submit", handleAddMenuSubmit);
    }

    document.addEventListener("DOMContentLoaded", init);

})();