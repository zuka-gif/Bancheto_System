/* =====================================================
   YESUNIM — SPA ROUTER
   Keeps the sidebar mounted once and swaps only the main
   content area on navigation, instead of a full page
   reload. Each page's own script (Dashboard.js, Sales.js,
   etc.) is re-injected as a fresh <script> tag every time
   its page is visited, so it re-runs its setup against the
   freshly-inserted DOM (those scripts were patched to run
   immediately when re-injected after DOMContentLoaded has
   already fired once, instead of only on the initial load).
===================================================== */

(function () {

    const contentEl = document.getElementById("page-content");

    // ---------- PAGE REGISTRY ----------
    // key = lowercased filename (without .html), matching each
    // sidebar link's href so a click can be mapped straight to a page.

    const PAGES = {
        dashboard: {
            title: "Dashboard",
            fragment: "fragments/dashboard.html",
            scripts: ["../Javascript/Dashboard.js", "../Javascript/Profile_Setting.js"]
        },
        sales: {
            title: "Sales",
            fragment: "fragments/sales.html",
            scripts: ["../Javascript/Sales.js"]
        },
        inventory: {
            title: "Inventory",
            fragment: "fragments/inventory.html",
            scripts: ["../Javascript/Inventory.js"]
        },
        reports: {
            title: "Reports",
            fragment: "fragments/reports.html",
            scripts: ["../Javascript/Reports.js"]
        },
        analytics: {
            title: "Analytics",
            fragment: "fragments/analytics.html",
            scripts: ["../Javascript/Analytics.js"]
        },
        user: {
            title: "Users",
            fragment: "fragments/user.html",
            scripts: ["../Javascript/User.js"]
        }
    };

    const DEFAULT_PAGE = "dashboard";

    let currentPage = null;
    let navToken = 0; // guards against a slow fetch finishing after a newer navigation started

    // ---------- HELPERS ----------

    function keyFromHref(href) {
        if (!href) return null;
        const file = href.split("/").pop().split("?")[0].split("#")[0];
        const key = file.replace(/\.html$/i, "").toLowerCase();
        return PAGES[key] ? key : null;
    }

    function keyFromHash() {
        const raw = window.location.hash.replace(/^#/, "").toLowerCase();
        return PAGES[raw] ? raw : null;
    }

    // Re-injecting a <script src> element makes the browser fetch (from
    // cache) and execute it again as a brand-new script — which is what
    // gives each page's IIFE fresh, non-stale references to the DOM
    // elements that were just inserted for this navigation.
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const el = document.createElement("script");
            el.src = src;
            el.onload = () => resolve();
            el.onerror = () => reject(new Error("Failed to load " + src));
            document.body.appendChild(el);
        });
    }

    function updateActiveNav(key) {
        document.querySelectorAll(".nav-item").forEach(item => {
            const itemKey = keyFromHref(item.getAttribute("href"));
            item.classList.toggle("active", itemKey !== null && itemKey === key);
        });
    }

    // ---------- NAVIGATE ----------

    async function navigateTo(key, options = {}) {
        const page = PAGES[key];
        if (!page) return;

        const { pushState = true } = options;
        const myToken = ++navToken;

        try {
            const response = await fetch(page.fragment);
            if (!response.ok) throw new Error("Could not load " + page.fragment);
            const html = await response.text();

            // A newer navigation started while this fetch was in flight —
            // drop this stale result instead of flashing the wrong page.
            if (myToken !== navToken) return;

            contentEl.innerHTML = html;
            document.title = "Yesunim - " + page.title;
            currentPage = key;

            contentEl.scrollTop = 0;
            window.scrollTo(0, 0);

            updateActiveNav(key);

            if (pushState) {
                history.pushState({ page: key }, "", "App.html#" + key);
            }

            // Load this page's script(s) in order, fresh, every visit.
            for (const src of page.scripts) {
                if (myToken !== navToken) return;
                await loadScript(src);
            }

        } catch (err) {
            console.error("SPA navigation error:", err);
            if (myToken === navToken) {
                contentEl.innerHTML = `<div style="padding:40px;color:#999;">Couldn't load this page. Please try again.</div>`;
            }
        }
    }

    // ---------- CLICK INTERCEPTION ----------
    // Delegated on document so it works even though the sidebar's own
    // markup is inserted asynchronously by sidebar.js's fetch().

    document.addEventListener("click", (e) => {
        const link = e.target.closest(".nav-item");
        if (!link) return;

        const href = link.getAttribute("href");

        // Logout ("#") keeps using its own inline onclick — don't touch it.
        if (!href || href === "#") return;

        const key = keyFromHref(href);
        if (!key) return; // not one of our known pages — let it behave normally

        e.preventDefault();
        if (key !== currentPage) {
            navigateTo(key);
        }
    });

    // ---------- BACK / FORWARD ----------

    window.addEventListener("popstate", () => {
        const key = keyFromHash() || DEFAULT_PAGE;
        navigateTo(key, { pushState: false });
    });

    // ---------- INITIAL LOAD ----------

    const initialKey = keyFromHash() || DEFAULT_PAGE;
    history.replaceState({ page: initialKey }, "", "App.html#" + initialKey);
    navigateTo(initialKey, { pushState: false });

    // Sidebar HTML is inserted asynchronously by sidebar.js's own fetch;
    // make sure the active nav item is still correct once it lands, in
    // case that happens after the first navigateTo() already ran.
    setTimeout(() => updateActiveNav(currentPage), 300);

})();