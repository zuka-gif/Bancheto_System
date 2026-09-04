// ==========================================
// ESCAPE HTML
// ==========================================

function escapeHTML(value) {

    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ==========================================
// GET USER STATUS
// ==========================================

function getUserStatus(lastActivity) {

    if (!lastActivity) {
        return {
            text: "Inactive",
            time: "Never logged in",
            className: "inactive"
        };
    }

    const difference = Date.now() - Number(lastActivity);

    const minutes = Math.floor(
        difference / (1000 * 60)
    );

    const hours = Math.floor(
        difference / (1000 * 60 * 60)
    );

    const days = Math.floor(
        difference / (1000 * 60 * 60 * 24)
    );


    // Less than 5 minutes = Active
    if (minutes < 5) {

        return {
            text: "Active",
            time: minutes === 0
                ? "Now"
                : `${minutes} min ago`,
            className: "active"
        };
    }


    if (minutes < 60) {

        return {
            text: "Inactive",
            time: `${minutes} min ago`,
            className: "inactive"
        };
    }


    if (hours < 24) {

        return {
            text: "Inactive",
            time: `${hours} hour${hours > 1 ? "s" : ""} ago`,
            className: "inactive"
        };
    }


    return {
        text: "Inactive",
        time: `${days} day${days > 1 ? "s" : ""} ago`,
        className: "inactive"
    };
}


// ==========================================
// USERS PAGE
// ==========================================

document.addEventListener("DOMContentLoaded", function () {

    const usersTableBody =
        document.getElementById("usersTableBody");

    if (!usersTableBody) {
        return;
    }

    loadUsers();

    // Refresh status every minute
    setInterval(loadUsers, 60000);


    // ==========================================
    // LOAD USERS
    // ==========================================

    function loadUsers() {

        const users =
            JSON.parse(
                localStorage.getItem("banchetoUsers")
            ) || [];

        const entriesText =
            document.getElementById("entriesText");

        usersTableBody.innerHTML = "";


        // ==========================================
        // NO USERS
        // ==========================================

        if (users.length === 0) {

            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="5"
                        style="text-align:center; padding:30px;">
                        No registered accounts found.
                    </td>
                </tr>
            `;

            if (entriesText) {
                entriesText.textContent =
                    "Showing 0 entries";
            }

            return;
        }


        // ==========================================
        // DISPLAY USERS
        // ==========================================

        users.forEach(function (user, index) {

            const status =
                getUserStatus(user.lastActivity);

            const row =
                document.createElement("tr");


            row.innerHTML = `
                <td>
                    ${escapeHTML(user.fullname || "")}
                </td>

                <td>
                    ${escapeHTML(user.username || "")}
                </td>

                <td>
                    ${escapeHTML(user.role || "")}
                </td>

                <td>
                    <span class="status ${status.className}">
                        <strong>${status.text}</strong>
                        <small>${status.time}</small>
                    </span>
                </td>

                <td class="action-buttons">

                    <button
                        class="edit-btn"
                        onclick="editUser(${index})"
                        title="Edit User"
                    >
                        <i class='bx bx-edit-alt'></i>
                    </button>

                    <button
                        class="delete-btn"
                        onclick="deleteUser(${index})"
                        title="Delete User"
                    >
                        <i class='bx bx-trash'></i>
                    </button>

                </td>
            `;

            usersTableBody.appendChild(row);
        });


        if (entriesText) {

            entriesText.textContent =
                `Showing 1 to ${users.length} entries`;
        }
    }
});



// ==========================================
// EDIT USER
// ==========================================

function editUser(index) {

    let users =
        JSON.parse(localStorage.getItem("banchetoUsers")) || [];

    const user = users[index];

    if (!user) {
        alert("User not found.");
        return;
    }


    const newFullname = prompt(
        "Enter new fullname:",
        user.fullname
    );

    if (newFullname === null) {
        return;
    }


    const newUsername = prompt(
        "Enter new username:",
        user.username
    );

    if (newUsername === null) {
        return;
    }


    const newRole = prompt(
        "Enter role (Owner, Manager, or Cashier):",
        user.role
    );

    if (newRole === null) {
        return;
    }


    // Validate role
    const validRoles = [
        "Owner",
        "Manager",
        "Cashier"
    ];

    const roleExists = validRoles.some(
        role =>
            role.toLowerCase() ===
            newRole.trim().toLowerCase()
    );

    if (!roleExists) {

        alert(
            "Invalid role.\n\nPlease use:\nOwner\nManager\nCashier"
        );

        return;
    }


    // Check duplicate username
    const duplicateUsername = users.some(
        (existingUser, i) =>
            i !== index &&
            existingUser.username.toLowerCase() ===
            newUsername.trim().toLowerCase()
    );

    if (duplicateUsername) {

        alert("That username is already being used.");

        return;
    }


    // Update account
    users[index].fullname =
        newFullname.trim();

    users[index].username =
        newUsername.trim();

    users[index].role =
        validRoles.find(
            role =>
                role.toLowerCase() ===
                newRole.trim().toLowerCase()
        );


    // Save changes
    localStorage.setItem(
        "banchetoUsers",
        JSON.stringify(users)
    );


    alert("User information updated successfully.");

    // Refresh table
    if (typeof reloadUsers === "function") {
        reloadUsers();
    } else {
        location.reload();
    }
}


// ==========================================
// DELETE USER
// ==========================================

function deleteUser(index) {

    let users =
        JSON.parse(localStorage.getItem("banchetoUsers")) || [];

    const user = users[index];

    if (!user) {
        alert("User not found.");
        return;
    }


    const confirmation = confirm(
        `Are you sure you want to delete ${user.fullname}'s account?`
    );

    if (!confirmation) {
        return;
    }


    // Delete user
    users.splice(index, 1);


    // Save updated users
    localStorage.setItem(
        "banchetoUsers",
        JSON.stringify(users)
    );


    alert("User account deleted successfully.");


    // Refresh table
    if (typeof reloadUsers === "function") {
        reloadUsers();
    } else {
        location.reload();
    }
}



/* =====================================================
   LOGIN HISTORY
   ===================================================== */


/* Open Login History */

function showLoginHistory() {

    const modal =
        document.getElementById("loginHistoryModal");

    if (!modal) {
        return;
    }

    modal.classList.add("show");

    loadLoginHistory();

}


/* Close Login History */

function closeLoginHistory() {

    const modal =
        document.getElementById("loginHistoryModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");

}


/* =====================================================
   LOAD LOGIN HISTORY
   ===================================================== */

function loadLoginHistory() {

    const tableBody =
        document.getElementById(
            "loginHistoryTableBody"
        );

    const entries =
        document.getElementById(
            "loginHistoryEntries"
        );


    if (!tableBody) {
        return;
    }


    /*
       Get real login records
       saved by the login system.
    */

    const loginHistory =
        JSON.parse(
            localStorage.getItem("loginHistory")
        ) || [];


    tableBody.innerHTML = "";


    /* No records */

    if (loginHistory.length === 0) {

        tableBody.innerHTML = `

            <tr>

                <td
                    colspan="6"
                    style="
                        text-align:center;
                        color:#888;
                        height:60px;
                    "
                >

                    No login history yet.

                </td>

            </tr>

        `;


        if (entries) {

            entries.textContent =
                "Showing 0 entries";

        }

        return;

    }


    /* Display records */

    loginHistory.forEach(function (login) {

        const row =
            document.createElement("tr");


        const statusClass =
            login.status === "Successful"
                ? "login-success"
                : "login-failed";


        row.innerHTML = `

            <td>
                ${login.name}
            </td>

            <td>
                ${login.username}
            </td>

            <td>
                ${login.role}
            </td>

            <td>
                ${login.date}
            </td>

            <td>
                ${login.time}
            </td>

            <td>
                <span class="${statusClass}">
                    ${login.status}
                </span>
            </td>

        `;


        tableBody.appendChild(row);

    });


    if (entries) {

        entries.textContent =
            `Showing 1 to ${loginHistory.length} entries`;

    }

}


/* =====================================================
   CLOSE WHEN CLICKING OUTSIDE
   ===================================================== */

const loginHistoryModal =
    document.getElementById(
        "loginHistoryModal"
    );


if (loginHistoryModal) {

    loginHistoryModal.addEventListener(
        "click",
        function (event) {

            if (
                event.target ===
                loginHistoryModal
            ) {

                closeLoginHistory();

            }

        }
    );

}


/* =====================================================
   ESC KEY CLOSE
   ===================================================== */

document.addEventListener(
    "keydown",
    function (event) {

        if (event.key === "Escape") {

            closeLoginHistory();

        }

    }
);



function saveLoginHistory(name, username, role, status) {

    let history =
        JSON.parse(
            localStorage.getItem("loginHistory")
        ) || [];

    const now = new Date();

    history.unshift({

        name: name,

        username: username,

        role: role,

        date: now.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
        }),

        time: now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit"
        }),

        status: status

    });

    localStorage.setItem(
        "loginHistory",
        JSON.stringify(history)
    );
}

