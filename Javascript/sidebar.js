// ==========================================
// ACTIVE SIDEBAR ITEM
// ==========================================

const currentPage =
    window.location.pathname
        .split("/")
        .pop()
        .toLowerCase();

document.querySelectorAll(".nav-item").forEach(function (item) {

    const href = item.getAttribute("href");

    // Ignore Logout
    if (!href || href === "#") {
        return;
    }

    const linkPage =
        href.split("/").pop().toLowerCase();

    if (linkPage === currentPage) {
        item.classList.add("active");
    }

});




// ==========================================
// CURRENT USER ROLE
//==========================================

function getCurrentUserRole() {

    try {
        const saved =
            localStorage.getItem("banchetoCurrentUser") ||
            sessionStorage.getItem("banchetoCurrentUser");

        if (saved) {
            const user = JSON.parse(saved);
            return user.role || "Admin";
        }
    } catch (e) { /* ignore malformed data */ }

    return "Admin";
}




// ==========================================
// USER PRESENCE TRACKER
// ==========================================

async function setUserActive() {

    const saved =
        localStorage.getItem("banchetoCurrentUser") ||
        sessionStorage.getItem("banchetoCurrentUser");

    if (!saved) {
        return;
    }

    let currentUser;

    try {
        currentUser = JSON.parse(saved);
    } catch (e) {
        return;
    }

    if (!currentUser || !currentUser.id) {
        return;
    }

    // Heartbeat: keeps profiles.last_activity fresh so the Users page
    // status column (Active/Away) reflects real usage, not just login
    // time. Fire-and-forget — a missed heartbeat isn't worth surfacing
    // an error over.
    await sb
        .from("profiles")
        .update({ last_activity: new Date().toISOString() })
        .eq("id", currentUser.id);
}


// Set Active immediately
setUserActive();

// Keep Active while the page is open
setInterval(setUserActive, 30000);




// ==========================================
// LOGOUT FUNCTION
// ==========================================

async function logout(event) {

    event.preventDefault();

    showLoading("Logging out...");

    // Ends the REAL Supabase session (the thing that actually
    // authenticates database queries) — clearing banchetoCurrentUser
    // alone, below, only removed the convenience display copy that the
    // rest of the app's UI reads; it never touched the real session.
    await sb.auth.signOut();

    localStorage.removeItem("banchetoCurrentUser");
    sessionStorage.removeItem("banchetoCurrentUser");

    setTimeout(function () {

        window.location.href =
            "../Log_In/SignIn.html";

    }, 1000);
}



// ==========================================
// COMMON LOADING
// ==========================================

function showLoading(message = "Loading...") {

    const loadingScreen =
        document.getElementById("loadingScreen");

    const loadingText =
        document.getElementById("loadingText");

    if (!loadingScreen) {
        return;
    }

    if (loadingText) {
        loadingText.textContent = message;
    }

    loadingScreen.classList.add("show");
}


function hideLoading() {

    const loadingScreen =
        document.getElementById("loadingScreen");

    if (!loadingScreen) {
        return;
    }

    loadingScreen.classList.remove("show");
}