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

function getUserStatus(lastActivity, disabled) {

    if (disabled) {
        return {
            text: "Disabled",
            time: "Account disabled",
            className: "inactive"
        };
    }

    if (!lastActivity) {
        return {
            text: "Inactive",
            time: "Never logged in",
            className: "inactive"
        };
    }

    // last_activity comes back from Supabase as an ISO timestamp string
    // (e.g. "2026-09-24T01:06:10.117+00:00"), not a Date.now()-style
    // millisecond number, so it needs new Date(...) rather than Number(...).
    const difference = Date.now() - new Date(lastActivity).getTime();

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


// Populated by loadUsers(); editUser()/toggleUserStatus() (called from
// inline onclick handlers, so they live outside this closure) read from
// this shared array by index.
let loadedUsers = [];

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
    // Owner accounts are excluded here (.neq("role", "Owner")) since this
    // table is for the Owner to manage Manager/Cashier accounts only —
    // the Owner's own account (or any other Owner account) should never
    // show up as something to edit/disable from here. This filters at
    // the database level so Owner rows are never even sent to the browser.

    async function loadUsers() {

        const { data, error } =
            await sb
                .from("profiles")
                .select("*")
                .neq("role", "Owner")
                .order("fullname", { ascending: true });

        const entriesText =
            document.getElementById("entriesText");

        usersTableBody.innerHTML = "";

        if (error) {

            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="5"
                        style="text-align:center; padding:30px;">
                        Could not load accounts: ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;

            if (entriesText) {
                entriesText.textContent = "Showing 0 entries";
            }

            return;
        }

        loadedUsers = data || [];


        // ==========================================
        // NO USERS
        // ==========================================

        if (loadedUsers.length === 0) {

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

        loadedUsers.forEach(function (user, index) {

            const status =
                getUserStatus(user.last_activity, user.disabled);

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
                        onclick="toggleUserStatus(${index})"
                        title="${user.disabled ? "Enable User" : "Disable User"}"
                    >
                        <i class='bx ${user.disabled ? "bx-check-circle" : "bx-block"}'></i>
                    </button>

                </td>
            `;

            usersTableBody.appendChild(row);
        });


        if (entriesText) {

            entriesText.textContent =
                `Showing 1 to ${loadedUsers.length} entries`;
        }
    }

    // Exposed so editUser()/toggleUserStatus() below can refresh the
    // table after a successful change, matching what the inline
    // onclick handlers already expect (reloadUsers()).
    window.reloadUsers = loadUsers;
});



// ==========================================
// EDIT USER
// ==========================================

async function editUser(index) {

    const user = loadedUsers[index];

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
        "Enter role (Manager or Cashier):",
        user.role
    );

    if (newRole === null) {
        return;
    }


    // Validate role
    // Owner is intentionally excluded here — since Owner accounts never
    // load into loadedUsers in the first place, this dialog should only
    // ever be editing a Manager or Cashier, and shouldn't offer a way to
    // promote someone to Owner either.
    const validRoles = [
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
            "Invalid role.\n\nPlease use:\nManager\nCashier"
        );

        return;
    }


    const trimmedUsername = newUsername.trim();


    // CHECK DUPLICATE USERNAME
    // Excludes this user's own row, since keeping their existing
    // username unchanged shouldn't count as a duplicate against
    // themselves.

    const { data: duplicate, error: duplicateCheckError } =
        await sb
            .from("profiles")
            .select("id")
            .ilike("username", trimmedUsername)
            .neq("id", user.id)
            .maybeSingle();

    if (duplicateCheckError) {
        alert("Something went wrong checking that username. Please try again.");
        return;
    }

    if (duplicate) {
        alert("That username is already being used.");
        return;
    }


    const resolvedRole =
        validRoles.find(
            role =>
                role.toLowerCase() ===
                newRole.trim().toLowerCase()
        );


    const { error: updateError } =
        await sb
            .from("profiles")
            .update({
                fullname: newFullname.trim(),
                username: trimmedUsername,
                role: resolvedRole
            })
            .eq("id", user.id);

    if (updateError) {
        alert("Could not update user: " + updateError.message);
        return;
    }


    alert("User information updated successfully.");

    if (typeof reloadUsers === "function") {
        reloadUsers();
    } else {
        location.reload();
    }
}


// ==========================================
// DISABLE / ENABLE USER
// ==========================================
// There's no client-safe way to truly delete a Supabase Auth account —
// that requires a privileged service-role key, which must never be
// exposed in frontend code. Disabling has the same practical effect
// (they can't sign in or act) without needing that key, and it keeps
// their name intact on past transactions/logs instead of orphaning
// those records.

async function toggleUserStatus(index) {

    const user = loadedUsers[index];

    if (!user) {
        alert("User not found.");
        return;
    }

    const nowDisabling = !user.disabled;

    const confirmation = confirm(
        nowDisabling
            ? `Disable ${user.fullname}'s account? They won't be able to sign in until re-enabled.`
            : `Re-enable ${user.fullname}'s account?`
    );

    if (!confirmation) {
        return;
    }


    const { error } =
        await sb
            .from("profiles")
            .update({ disabled: nowDisabling })
            .eq("id", user.id);

    if (error) {
        alert("Could not update account status: " + error.message);
        return;
    }


    alert(
        nowDisabling
            ? "User account disabled."
            : "User account re-enabled."
    );


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

async function loadLoginHistory() {

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
       Get real login records from Supabase.
    */

    const { data, error } =
        await sb
            .from("login_history")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(200);


    tableBody.innerHTML = "";


    /* Load failed */

    if (error) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; color:#888; height:60px;">
                    Could not load login history: ${escapeHTML(error.message)}
                </td>
            </tr>
        `;

        if (entries) {
            entries.textContent = "Showing 0 entries";
        }

        return;
    }

    const loginHistory = data || [];


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

        const when =
            new Date(login.created_at);

        const dateText =
            when.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
            });

        const timeText =
            when.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit"
            });


        row.innerHTML = `

            <td>
                ${escapeHTML(login.name)}
            </td>

            <td>
                ${escapeHTML(login.username)}
            </td>

            <td>
                ${escapeHTML(login.role)}
            </td>

            <td>
                ${dateText}
            </td>

            <td>
                ${timeText}
            </td>

            <td>
                <span class="${statusClass}">
                    ${escapeHTML(login.status)}
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



// NOTE: saveLoginHistory() intentionally lives only in script.js now.
// It used to be duplicated here too — since SignIn.html loads script.js
// then User.js, this file's older localStorage version was silently
// overriding script.js's real Supabase-backed one (both declared a
// global function with the same name), so every login was actually
// being saved to localStorage.loginHistory instead of the real
// login_history table, invisibly. Removing the duplicate here lets
// script.js's version be the one that actually runs.