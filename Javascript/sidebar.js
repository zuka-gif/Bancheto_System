
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

function setUserActive() {

    const currentUser =
        JSON.parse(localStorage.getItem("banchetoCurrentUser")) ||
        JSON.parse(sessionStorage.getItem("banchetoCurrentUser"));

    if (!currentUser) {
        return;
    }

    let users =
        JSON.parse(localStorage.getItem("banchetoUsers")) || [];

    const user = users.find(
        account => account.id === currentUser.id
    );

    if (!user) {
        return;
    }

    user.lastActivity = Date.now();

    localStorage.setItem(
        "banchetoUsers",
        JSON.stringify(users)
    );
}


// Set Active immediately
setUserActive();

// Keep Active while the page is open
setInterval(setUserActive, 30000);




// ==========================================
// LOGOUT FUNCTION
// ==========================================

function logout(event) {

    event.preventDefault();

    const currentUser =
        JSON.parse(localStorage.getItem("banchetoCurrentUser")) ||
        JSON.parse(sessionStorage.getItem("banchetoCurrentUser"));

    if (currentUser) {

        let users =
            JSON.parse(localStorage.getItem("banchetoUsers")) || [];

        const user = users.find(
            account => account.id === currentUser.id
        );

        if (user) {
            user.lastActivity = Date.now();

            localStorage.setItem(
                "banchetoUsers",
                JSON.stringify(users)
            );
        }
    }

    showLoading("Logging out...");

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