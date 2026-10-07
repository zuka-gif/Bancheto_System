/* =====================================================

   Owner   -> full access
   Manager -> everything except Users
   Cashier -> only Dashboard and Sales

===================================================== */

(function () {

    const ROLE_PAGE_ACCESS = {
        "owner":   ["dashboard", "sales", "inventory", "reports", "analytics", "user"],
        "manager": ["dashboard", "sales", "inventory", "reports", "analytics"],
        "cashier": ["dashboard", "sales"]
    };

    const ALL_PAGES = ["dashboard", "sales", "inventory", "reports", "analytics", "user"];

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
            .toLowerCase()
            .replace(/\.html$/, "");

    const user = getLoggedInUser();


    if (!user) {
        window.location.replace("/signin");
        return;
    }

    const roleKey = (user.role || "").trim().toLowerCase();
    const allowedPages = ROLE_PAGE_ACCESS[roleKey] || ROLE_PAGE_ACCESS["owner"];

  
    if (currentPage && !allowedPages.includes(currentPage)) {
        window.location.replace("/" + allowedPages[0]);
        return;
    }

    
    const disallowed = ALL_PAGES.filter(p => !allowedPages.includes(p));

    if (disallowed.length > 0) {
        const selectors = disallowed
            .map(function (p) {
                const fileName = p;
                return '.nav-item[href="/' + fileName + '"]';
            })
            .join(", ");

        const style = document.createElement("style");
        style.textContent = selectors + " { display: none !important; }";
        document.head.appendChild(style);
    }


    /* =====================================================
       DISABLED-ACCOUNT CHECK
       The role/user data above comes from a cached copy in
       localStorage/sessionStorage, so it never notices when the
       Owner disables an account. This asks the database directly
       (on page load, then every minute) and signs the person out
       if their profile is now disabled.
    ===================================================== */

    let kickedOut = false;

    function kickOut() {

        if (kickedOut) {
            return;
        }

        kickedOut = true;

        localStorage.removeItem("banchetoCurrentUser");
        sessionStorage.removeItem("banchetoCurrentUser");

        alert("This account has been disabled. Please contact the owner.");

        function goToSignIn() {
            window.location.replace("/signin");
        }

        try {
            if (typeof sb !== "undefined") {
                sb.auth.signOut().finally(goToSignIn);
                return;
            }
        } catch (e) { /* fall through */ }

        goToSignIn();
    }

    async function verifyAccountStillEnabled() {

        // "sb" is created by Supabaseclient.js, which loads AFTER this
        // file, so this only runs once the page has fully loaded.
        if (typeof sb === "undefined" || !user.id) {
            return;
        }

        try {
            const { data, error } =
                await sb
                    .from("profiles")
                    .select("disabled")
                    .eq("id", user.id)
                    .maybeSingle();

            // A network/query error shouldn't lock everyone out.
            if (error) {
                return;
            }

            if (data && data.disabled) {
                kickOut();
            }
        } catch (e) {
            console.error("Could not verify account status:", e);
        }
    }

    window.addEventListener("load", verifyAccountStillEnabled);
    setInterval(verifyAccountStillEnabled, 60000);

})();