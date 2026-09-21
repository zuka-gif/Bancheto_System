/* =====================================================

   Owner   -> full access
   Manager -> everything except Users
   Cashier -> only Dashboard and Sales

===================================================== */

(function () {

    const ROLE_PAGE_ACCESS = {
        "owner":   ["dashboard.html", "sales.html", "inventory.html", "reports.html", "analytics.html", "user.html"],
        "manager": ["dashboard.html", "sales.html", "inventory.html", "reports.html", "analytics.html"],
        "cashier": ["dashboard.html", "sales.html"]
    };

    const ALL_PAGES = ["dashboard.html", "sales.html", "inventory.html", "reports.html", "analytics.html", "user.html"];

    function getLoggedInUser() {
        try {
            const saved =
                localStorage.getItem("banchetoCurrentUser") ||
                sessionStorage.getItem("banchetoCurrentUser");

            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    }

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();

    const user = getLoggedInUser();


    if (!user) {
        window.location.replace("../Log_In/SignIn.html");
        return;
    }

    const roleKey = (user.role || "").trim().toLowerCase();
    const allowedPages = ROLE_PAGE_ACCESS[roleKey] || ROLE_PAGE_ACCESS["owner"];

  
    if (currentPage && !allowedPages.includes(currentPage)) {
        const fallbackFile = allowedPages[0];
        const fallbackName = fallbackFile.charAt(0).toUpperCase() + fallbackFile.slice(1);
        window.location.replace(fallbackName);
        return;
    }

    
    const disallowed = ALL_PAGES.filter(p => !allowedPages.includes(p));

    if (disallowed.length > 0) {
        const selectors = disallowed
            .map(function (p) {
                const fileName = p.charAt(0).toUpperCase() + p.slice(1);
                return '.nav-item[href="' + fileName + '"]';
            })
            .join(", ");

        const style = document.createElement("style");
        style.textContent = selectors + " { display: none !important; }";
        document.head.appendChild(style);
    }

})();