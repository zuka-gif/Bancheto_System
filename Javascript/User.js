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
        showUserToast("User not found.", true);
        return;
    }

    openEditUserModal(user);
}


// ---------- EDIT USER POP-UP ----------
// Owner is intentionally excluded from the roles — Owner accounts never
// load into loadedUsers, and this form shouldn't offer a way to promote
// someone to Owner either.
const EDITABLE_ROLES = ["Manager", "Cashier"];

function injectEditUserStyles() {
    if (document.getElementById("editUserStyles")) return;

    const style = document.createElement("style");
    style.id = "editUserStyles";
    style.textContent = `
        .edit-user-overlay {
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(0, 0, 0, 0.45);
            display: flex; align-items: center; justify-content: center;
            padding: 16px; font-family: Arial, sans-serif;
        }
        .edit-user-box {
            background: #fff; border-radius: 12px; width: 100%; max-width: 400px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3); overflow: hidden;
            animation: editUserIn 0.18s ease;
        }
        .edit-user-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 14px 20px; color: #fff;
            background: linear-gradient(180deg, #a51414, #7a0f0f);
        }
        .edit-user-header h2 { margin: 0; font-size: 17px; }
        .edit-user-close {
            background: transparent; border: none; color: #fff;
            font-size: 24px; cursor: pointer; line-height: 1; padding: 0 4px;
        }
        .edit-user-body { padding: 18px 20px 6px; }
        .edit-user-body label {
            display: block; margin: 0 0 5px; font-size: 12px;
            font-weight: 700; color: #5C1D1D; text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .edit-user-body input, .edit-user-body select {
            width: 100%; box-sizing: border-box; height: 38px; padding: 0 12px;
            margin-bottom: 14px; border: 1px solid #ccc; border-radius: 6px;
            font-size: 14px; background: #fff; color: #111;
        }
        .edit-user-body input:focus, .edit-user-body select:focus {
            outline: none; border-color: #a51414;
            box-shadow: 0 0 0 2px rgba(165, 20, 20, 0.15);
        }
        .edit-user-error {
            display: none; margin: -4px 0 14px; padding: 9px 12px;
            background: #fdecea; color: #b51b14; border-radius: 6px;
            font-size: 13px; line-height: 1.4; white-space: pre-line;
        }
        .edit-user-error.show { display: block; }
        .edit-user-actions {
            display: flex; justify-content: flex-end; gap: 8px;
            padding: 6px 20px 18px;
        }
        .edit-user-actions button {
            height: 36px; padding: 0 18px; border-radius: 6px;
            font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .edit-user-cancel { background: #eee; color: #333; border: 1px solid #ccc; }
        .edit-user-save { background: #3d7f37; color: #fff; border: none; }
        .edit-user-save:hover { background: #346d2f; }
        .edit-user-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .user-toast-overlay {
            position: fixed; inset: 0; z-index: 10001;
            background: rgba(0, 0, 0, 0.35);
            display: flex; align-items: center; justify-content: center;
            padding: 16px; font-family: Arial, sans-serif;
        }
        .user-toast {
            background: #fff; border-radius: 12px; width: 100%; max-width: 320px;
            padding: 26px 22px 20px; text-align: center;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
            animation: editUserIn 0.2s ease;
        }
        .user-toast-icon { font-size: 54px; line-height: 1; color: #3d7f37; }
        .user-toast.error .user-toast-icon { color: #b51b14; }
        .user-toast p { margin: 10px 0 16px; font-size: 14px; color: #222; line-height: 1.5; white-space: pre-line; }
        .user-toast button {
            height: 34px; padding: 0 28px; border: none; border-radius: 6px;
            background: #3d7f37; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .user-toast.error button { background: #b51b14; }
        .user-confirm-actions { display: flex; gap: 8px; justify-content: center; }
        .user-toast .user-confirm-cancel {
            background: #eee; color: #333; border: 1px solid #ccc;
        }
        .user-toast .user-confirm-yes.danger { background: #b51b14; }
        .user-toast .user-confirm-yes.danger:hover { background: #8d100b; }
        .user-toast .user-confirm-yes.safe:hover { background: #346d2f; }
        .user-toast .user-confirm-icon-warn { color: #e69500; }
        @keyframes editUserIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
    `;
    document.head.appendChild(style);
}

function showUserToast(message, isError) {
    injectEditUserStyles();

    // Centered pop-up; closes by itself, or via OK / click outside
    const overlay = document.createElement("div");
    overlay.className = "user-toast-overlay";
    overlay.innerHTML = `
        <div class="user-toast${isError ? " error" : ""}" role="alert">
            <i class='bx ${isError ? "bxs-error-circle" : "bxs-check-circle"} user-toast-icon'></i>
            <p></p>
            <button type="button">OK</button>
        </div>
    `;
    overlay.querySelector("p").textContent = message;
    document.body.appendChild(overlay);

    const close = function () { overlay.remove(); };
    overlay.querySelector("button").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    setTimeout(close, 3000);
}

function showUserConfirm(message, yesLabel, isDanger) {
    injectEditUserStyles();

    return new Promise(function (resolve) {
        const overlay = document.createElement("div");
        overlay.className = "user-toast-overlay";
        overlay.innerHTML = `
            <div class="user-toast" role="alertdialog" aria-label="Confirm">
                <i class='bx bxs-help-circle user-toast-icon user-confirm-icon-warn'></i>
                <p></p>
                <div class="user-confirm-actions">
                    <button type="button" class="user-confirm-cancel">Cancel</button>
                    <button type="button" class="user-confirm-yes ${isDanger ? "danger" : "safe"}"></button>
                </div>
            </div>
        `;
        overlay.querySelector("p").textContent = message;
        overlay.querySelector(".user-confirm-yes").textContent = yesLabel;
        document.body.appendChild(overlay);

        function finish(result) {
            document.removeEventListener("keydown", onKey);
            overlay.remove();
            resolve(result);
        }
        function onKey(e) { if (e.key === "Escape") finish(false); }

        overlay.querySelector(".user-confirm-cancel").addEventListener("click", function () { finish(false); });
        overlay.querySelector(".user-confirm-yes").addEventListener("click", function () { finish(true); });
        overlay.addEventListener("click", function (e) { if (e.target === overlay) finish(false); });
        document.addEventListener("keydown", onKey);

        overlay.querySelector(".user-confirm-cancel").focus(); // safe default
    });
}

function openEditUserModal(user) {

    injectEditUserStyles();

    const overlay = document.createElement("div");
    overlay.className = "edit-user-overlay";
    overlay.innerHTML = `
        <div class="edit-user-box" role="dialog" aria-label="Edit user">
            <div class="edit-user-header">
                <h2>Edit User</h2>
                <button type="button" class="edit-user-close" title="Close">&times;</button>
            </div>
            <form class="edit-user-form" novalidate>
                <div class="edit-user-body">
                    <label for="editUserFullname">Full Name</label>
                    <input type="text" id="editUserFullname" autocomplete="off">

                    <label for="editUserUsername">Username</label>
                    <input type="text" id="editUserUsername" autocomplete="off">

                    <label for="editUserRole">Role</label>
                    <select id="editUserRole">
                        ${EDITABLE_ROLES.map(function (r) {
                            return `<option value="${r}">${r}</option>`;
                        }).join("")}
                    </select>

                    <div class="edit-user-error" id="editUserError"></div>
                </div>
                <div class="edit-user-actions">
                    <button type="button" class="edit-user-cancel">Cancel</button>
                    <button type="submit" class="edit-user-save">Save Changes</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);

    const fullnameInput = overlay.querySelector("#editUserFullname");
    const usernameInput = overlay.querySelector("#editUserUsername");
    const roleSelect = overlay.querySelector("#editUserRole");
    const errorEl = overlay.querySelector("#editUserError");
    const saveBtn = overlay.querySelector(".edit-user-save");

    // .value (not innerHTML) so names with quotes or symbols can't break the form
    fullnameInput.value = user.fullname || "";
    usernameInput.value = user.username || "";

    const currentRole = EDITABLE_ROLES.find(function (r) {
        return r.toLowerCase() === String(user.role || "").toLowerCase();
    });
    if (currentRole) roleSelect.value = currentRole;

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.add("show");
    }

    function close() {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
    }

    function onKey(e) {
        if (e.key === "Escape") close();
    }

    document.addEventListener("keydown", onKey);
    overlay.querySelector(".edit-user-close").addEventListener("click", close);
    overlay.querySelector(".edit-user-cancel").addEventListener("click", close);

    overlay.querySelector(".edit-user-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        errorEl.classList.remove("show");

        const newFullname = fullnameInput.value.trim();
        const newUsername = usernameInput.value.trim();
        const resolvedRole = roleSelect.value;

        if (!newFullname) {
            showError("Please enter a full name.");
            return;
        }

        if (!newUsername) {
            showError("Please enter a username.");
            return;
        }

        // Only one ACTIVE account per role: block switching to a role that
        // another active account already holds.
        if (!user.disabled && resolvedRole !== user.role) {

            const roleInUse = loadedUsers.some(function (other) {
                return other.id !== user.id &&
                       other.role === resolvedRole &&
                       !other.disabled;
            });

            if (roleInUse) {
                showError(
                    "Can't change the role to " + resolvedRole + ".\n" +
                    "There is already an active " + resolvedRole + " account."
                );
                return;
            }
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        // CHECK DUPLICATE USERNAME
        // Excludes this user's own row, since keeping their existing
        // username unchanged shouldn't count as a duplicate against
        // themselves.
        const { data: duplicate, error: duplicateCheckError } =
            await sb
                .from("profiles")
                .select("id")
                .ilike("username", newUsername)
                .neq("id", user.id)
                .maybeSingle();

        if (duplicateCheckError) {
            showError("Something went wrong checking that username. Please try again.");
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
            return;
        }

        if (duplicate) {
            showError("That username is already being used.");
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
            return;
        }

        const { error: updateError } =
            await sb
                .from("profiles")
                .update({
                    fullname: newFullname,
                    username: newUsername,
                    role: resolvedRole
                })
                .eq("id", user.id);

        if (updateError) {
            showError("Could not update user: " + updateError.message);
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
            return;
        }

        close();
        showUserToast("User information updated successfully.");

        if (typeof reloadUsers === "function") {
            reloadUsers();
        } else {
            location.reload();
        }
    });

    fullnameInput.focus();
    fullnameInput.select();
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
        showUserToast("User not found.", true);
        return;
    }

    const nowDisabling = !user.disabled;

    // Only one ACTIVE account per role is allowed. If a new account
    // took this role while this one was disabled, re-enabling it
    // would create a second active Manager/Cashier.
    if (!nowDisabling) {

        const roleInUse = loadedUsers.some(function (other) {
            return other.id !== user.id &&
                   other.role === user.role &&
                   !other.disabled;
        });

        if (roleInUse) {
            showUserToast(
                "Can't re-enable this account.\n\n" +
                "There is already an active " + user.role + " account. " +
                "Disable that account first, then try again.",
                true
            );
            return;
        }
    }

    const confirmation = await showUserConfirm(
        nowDisabling
            ? `Disable ${user.fullname}'s account? They won't be able to sign in until re-enabled.`
            : `Re-enable ${user.fullname}'s account?`,
        nowDisabling ? "Yes, Disable" : "Yes, Re-enable",
        nowDisabling
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
        showUserToast("Could not update account status: " + error.message, true);
        return;
    }


    showUserToast(
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