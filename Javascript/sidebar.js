fetch("A_Main_sidebar.html")
    .then(response => {
        if (!response.ok) {
            throw new Error("Could not load sidebar");
        }

        return response.text();
    })
    .then(data => {
        document.getElementById("sidebar-container").innerHTML = data;
    })
    .catch(error => {
        console.error("Sidebar error:", error);
    });




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


