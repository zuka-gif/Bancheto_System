// =====================================================
// YESUNIM — PROFILE & SYSTEM SETTINGS
// Migrated to Supabase Auth + "profiles" table.
// =====================================================


// =====================================================
// POPUP MESSAGE (replaces the plain browser alert box)
// showPopup("message") shows a styled popup instead of the
// "yesunim.vercel.app says" dialog. Icon/title are picked
// from the wording (success / error / notice).
// =====================================================
(function installPopup() {
        const queue = [];
        let showing = false;

        function injectPopupStyles() {
            if (document.getElementById("appPopupStyles")) return;
            const style = document.createElement("style");
            style.id = "appPopupStyles";
            style.textContent = `
                .app-popup-overlay {
                    position: fixed; inset: 0; z-index: 100000;
                    display: flex; align-items: center; justify-content: center;
                    background: rgba(0, 0, 0, 0.55);
                    animation: appPopupFade 0.2s ease;
                }
                .app-popup-box {
                    width: 360px; max-width: calc(100vw - 40px);
                    padding: 28px 24px 22px; box-sizing: border-box;
                    background: #ffffff; border-radius: 14px; text-align: center;
                    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
                    animation: appPopupPop 0.25s ease;
                }
                .app-popup-icon {
                    width: 64px; height: 64px; margin: 0 auto 14px;
                    border-radius: 50%; display: flex;
                    align-items: center; justify-content: center;
                    font-size: 38px;
                }
                .app-popup-box.success .app-popup-icon { background: #e6f4ea; color: #1b7a34; }
                .app-popup-box.error   .app-popup-icon { background: #fdeaea; color: #cc292d; }
                .app-popup-box.info    .app-popup-icon { background: #fff4de; color: #f0a500; }
                .app-popup-title { margin: 0 0 6px; font-size: 18px; font-weight: 700; color: #222; }
                .app-popup-message {
                    margin: 0 0 20px; font-size: 14px; line-height: 1.5;
                    color: #555; white-space: pre-line; word-break: break-word;
                }
                .app-popup-btn {
                    min-width: 110px; padding: 10px 26px; border: none;
                    border-radius: 8px; font-size: 14px; font-weight: 700;
                    color: #fff; cursor: pointer; transition: filter 0.15s ease;
                }
                .app-popup-btn:hover { filter: brightness(1.1); }
                .app-popup-box.success .app-popup-btn { background: #1b7a34; }
                .app-popup-box.error   .app-popup-btn { background: #cc292d; }
                .app-popup-box.info    .app-popup-btn { background: #b8860b; }
                .app-popup-overlay.leaving { opacity: 0; transition: opacity 0.2s ease; }
                @keyframes appPopupFade { from { opacity: 0; } to { opacity: 1; } }
                @keyframes appPopupPop {
                    from { opacity: 0; transform: scale(0.9) translateY(10px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        function detectType(msg) {
            const m = msg.toLowerCase();
            if (/(fail|error|could not|couldn't|unable|invalid|denied|not allowed|wrong|incorrect|required|please)/.test(m)) {
                return /please/.test(m) && !/(fail|error|could not|invalid|denied)/.test(m) ? "info" : "error";
            }
            if (/(success|saved|updated|created|added|deleted|removed|backup|done|complete)/.test(m)) return "success";
            return "info";
        }

        function showNext() {
            if (showing || !queue.length) return;
            showing = true;
            injectPopupStyles();

            const message = queue.shift();
            const type = detectType(message);
            const titles = { success: "Success", error: "Something went wrong", info: "Notice" };
            const icons = { success: "bxs-check-circle", error: "bxs-x-circle", info: "bxs-info-circle" };

            const overlay = document.createElement("div");
            overlay.className = "app-popup-overlay";
            overlay.setAttribute("role", "alertdialog");
            overlay.setAttribute("aria-modal", "true");

            const box = document.createElement("div");
            box.className = "app-popup-box " + type;

            const iconWrap = document.createElement("div");
            iconWrap.className = "app-popup-icon";
            const icon = document.createElement("i");
            icon.className = "bx " + icons[type];
            iconWrap.appendChild(icon);

            const title = document.createElement("h3");
            title.className = "app-popup-title";
            title.textContent = titles[type];

            const text = document.createElement("p");
            text.className = "app-popup-message";
            text.textContent = message;

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "app-popup-btn";
            btn.textContent = "OK";

            box.appendChild(iconWrap);
            box.appendChild(title);
            box.appendChild(text);
            box.appendChild(btn);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            btn.focus();

            let closed = false;
            function close() {
                if (closed) return;
                closed = true;
                document.removeEventListener("keydown", onKey, true);
                overlay.classList.add("leaving");
                setTimeout(() => {
                    overlay.remove();
                    showing = false;
                    showNext();
                }, 200);
            }
            function onKey(e) {
                if (e.key === "Escape" || e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                }
            }

            btn.addEventListener("click", close);
            overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
            document.addEventListener("keydown", onKey, true);
        }

        window.showPopup = function (message) {
            queue.push(message === undefined || message === null ? "" : String(message));
            if (document.body) showNext();
            else document.addEventListener("DOMContentLoaded", showNext, { once: true });
        };
    })();



// =====================================================
// CACHED SESSION (fast, synchronous — written by script.js
// at Sign In, kept up to date by saveProfile() below)
// Used for things that don't need a guaranteed-fresh read,
// like the dashboard greeting or the avatar storage key.
// =====================================================

function getCachedSession() {

    const local = localStorage.getItem("banchetoCurrentUser");
    const session = sessionStorage.getItem("banchetoCurrentUser");

    try {
        if (local) return JSON.parse(local);
        if (session) return JSON.parse(session);
    } catch (e) { /* ignore malformed data */ }

    return null;
}


// =====================================================
// LIVE PROFILE (authoritative — used whenever we're about
// to show or save something, so we're never editing stale
// or someone-else's-session data)
// =====================================================

async function getCurrentProfile() {

    const { data: { user: authUser }, error: authError } =
        await sb.auth.getUser();

    if (authError || !authUser) {
        return null;
    }

    const { data: profile, error: profileError } =
        await sb
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .single();

    if (profileError || !profile) {
        return null;
    }

    return { authUser, profile };
}



/* ===============================
   PROFILE PICTURE
   Still stored locally (data URL in localStorage) — moving
   this to Supabase Storage is a separate task (needs a
   storage bucket + policies), not included in this pass.
   Keyed by the user's UUID (stable) instead of username
   (which can change).
================================ */

const profileAvatar = document.getElementById("profileAvatar");
const profilePictureInput = document.getElementById("profilePictureInput");
const profileAvatarImage = document.getElementById("profileAvatarImage");
const profileAvatarIcon = document.getElementById("profileAvatarIcon");
const dashboardProfileImage = document.getElementById("dashboardProfileImage");
const dashboardProfileIcon = document.getElementById("dashboardProfileIcon");


function getProfilePictureKey() {

    const session = getCachedSession();

    if (!session || !session.id) {
        return null;
    }

    return "profilePicture_" + session.id;
}


function loadProfilePicture() {

    const key = getProfilePictureKey();

    if (!key) {
        return;
    }

    const savedPicture = localStorage.getItem(key);

    if (!savedPicture) {

        if (profileAvatarImage) profileAvatarImage.style.display = "none";
        if (profileAvatarIcon) profileAvatarIcon.style.display = "block";

        if (dashboardProfileImage) dashboardProfileImage.style.display = "none";
        if (dashboardProfileIcon) dashboardProfileIcon.style.display = "block";

        return;
    }

    if (profileAvatarImage) {
        profileAvatarImage.src = savedPicture;
        profileAvatarImage.style.display = "block";
    }
    if (profileAvatarIcon) profileAvatarIcon.style.display = "none";

    if (dashboardProfileImage) {
        dashboardProfileImage.src = savedPicture;
        dashboardProfileImage.style.display = "block";
    }
    if (dashboardProfileIcon) dashboardProfileIcon.style.display = "none";
}


if (profileAvatar && profilePictureInput) {
    profileAvatar.addEventListener("click", () => profilePictureInput.click());
}


if (profilePictureInput) {

    profilePictureInput.addEventListener("change", function () {

        const file = this.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showPopup("Please select an image.");
            this.value = "";
            return;
        }

        const key = getProfilePictureKey();

        if (!key) {
            showPopup("No logged-in user found.");
            this.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = function (event) {

            const image = event.target.result;

            if (profileAvatarImage) {
                profileAvatarImage.src = image;
                profileAvatarImage.style.display = "block";
            }
            if (profileAvatarIcon) profileAvatarIcon.style.display = "none";

            if (dashboardProfileImage) {
                dashboardProfileImage.src = image;
                dashboardProfileImage.style.display = "block";
            }
            if (dashboardProfileIcon) dashboardProfileIcon.style.display = "none";

            localStorage.setItem(key, image);
        };

        reader.readAsDataURL(file);
    });
}


loadProfilePicture();



/* ===============================
   OPEN PROFILE POPUP
   Fetches a live copy from Supabase, not the cached session,
   so the popup always shows what's actually saved.
================================ */

async function openProfilePopup() {

    const overlay = document.getElementById("profileOverlay");
    if (!overlay) return;

    const result = await getCurrentProfile();

    if (!result) {
        showPopup("No logged-in user found.");
        return;
    }

    const { authUser, profile } = result;

    document.getElementById("profileFullname").value = profile.fullname || "";
    document.getElementById("profileUsername").value = profile.username || "";
    document.getElementById("profileEmailPhone").value = authUser.email || "";
    document.getElementById("profileRole").value = profile.role || "";

    loadProfilePicture();

    overlay.classList.add("show");
}


function closeProfilePopup() {
    document.getElementById("profileOverlay")?.classList.remove("show");
}



// =====================================================
// SAVE PROFILE
// Updates fullname/username in "profiles". Role is
// intentionally never sent here — self-editing role isn't
// allowed; that only happens from the Users page. Email
// changes go through Supabase Auth, not the profiles table.
// =====================================================

async function saveProfile() {

    const result = await getCurrentProfile();

    if (!result) {
        showPopup("No logged-in user found.");
        return;
    }

    const { authUser, profile } = result;

    const fullname = document.getElementById("profileFullname").value.trim();
    const username = document.getElementById("profileUsername").value.trim();
    const emailOrPhone = document.getElementById("profileEmailPhone").value.trim();

    if (!fullname || !username || !emailOrPhone) {
        showPopup("Please complete all profile fields.");
        return;
    }


    // CHECK USERNAME DUPLICATE (excluding this user's own row)

    const { data: duplicate, error: duplicateCheckError } =
        await sb
            .from("profiles")
            .select("id")
            .ilike("username", username)
            .neq("id", profile.id)
            .maybeSingle();

    if (duplicateCheckError) {
        showPopup("Something went wrong checking that username. Please try again.");
        return;
    }

    if (duplicate) {
        showPopup("That username is already being used.");
        return;
    }


    // UPDATE PROFILE ROW

    const { error: updateError } =
        await sb
            .from("profiles")
            .update({
                fullname: fullname,
                username: username
            })
            .eq("id", profile.id);

    if (updateError) {
        showPopup("Could not update profile: " + updateError.message);
        return;
    }


    // UPDATE EMAIL, IF CHANGED (lives in Supabase Auth, not "profiles")

    if (emailOrPhone !== authUser.email) {

        const { error: emailError } =
            await sb.auth.updateUser({ email: emailOrPhone });

        if (emailError) {
            showPopup(
                "Profile saved, but the email/phone could not be updated: " +
                emailError.message
            );
            closeProfilePopup();
            updateDashboardUser();
            return;
        }
    }


    // KEEP THE CACHED SESSION IN SYNC
    // (getCurrentUserRole(), Access-guard.js, the greeting, etc.
    // all read this convenience copy)

    const cachedSession = getCachedSession();

    if (cachedSession) {

        const updatedSession = {
            ...cachedSession,
            fullname: fullname,
            username: username,
            emailOrPhone: emailOrPhone
        };

        if (localStorage.getItem("banchetoCurrentUser")) {
            localStorage.setItem("banchetoCurrentUser", JSON.stringify(updatedSession));
        }

        if (sessionStorage.getItem("banchetoCurrentUser")) {
            sessionStorage.setItem("banchetoCurrentUser", JSON.stringify(updatedSession));
        }
    }


    showPopup("Profile updated successfully.");

    closeProfilePopup();

    updateDashboardUser();
}



// =====================================================
// UPDATE DASHBOARD USER + GREETING
// Reads the cached session — fine here since it's just kept
// in sync by saveProfile() and doesn't need a network round
// trip on every page load.
// =====================================================

function updateDashboardUser() {

    const session = getCachedSession();
    if (!session) return;

    const dashboardP = document.querySelector(".Dashboard-header p");
    const dashboardSpan = document.querySelector(".Dashboard-header p span");

    if (dashboardSpan) {
        dashboardSpan.textContent = (session.role || "ADMIN") + "!";
    }

    if (dashboardP) {

        const hour = new Date().getHours();
        let greeting;

        if (hour >= 5 && hour < 12) greeting = "Good morning";
        else if (hour >= 12 && hour < 18) greeting = "Good afternoon";
        else greeting = "Good evening";

        dashboardP.firstChild.textContent = greeting + ", ";
    }
}



// =====================================================
// PASSWORD POPUP
// =====================================================

function openPasswordPopup() {

    document.getElementById("currentPassword").value = "";
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmNewPassword").value = "";

    document.getElementById("passwordOverlay").classList.add("show");
}


function closePasswordPopup() {
    document.getElementById("passwordOverlay")?.classList.remove("show");
}



// =====================================================
// CHANGE PASSWORD
// Supabase has no client-safe "check this password" call, so
// the current password is verified by re-authenticating with
// it via signInWithPassword() before updating to the new one.
// =====================================================

async function changePassword() {

    const result = await getCurrentProfile();

    if (!result) {
        showPopup("No logged-in user found.");
        return;
    }

    const { authUser } = result;

    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showPopup("Please complete all password fields.");
        return;
    }

    if (newPassword.length < 8) {
        showPopup("Password must contain at least 8 characters.");
        return;
    }

    if (newPassword !== confirmPassword) {
        showPopup("New passwords do not match.");
        return;
    }


    // VERIFY CURRENT PASSWORD
    // Works for email today; phone here too once Twilio/phone
    // auth is wired in, since authUser.email will be null for
    // phone-based accounts and authUser.phone will be set.

    const verifyCredentials = authUser.email
        ? { email: authUser.email, password: currentPassword }
        : { phone: authUser.phone, password: currentPassword };

    const { error: verifyError } =
        await sb.auth.signInWithPassword(verifyCredentials);

    if (verifyError) {
        showPopup("Current password is incorrect.");
        return;
    }


    // UPDATE TO NEW PASSWORD

    const { error: updateError } =
        await sb.auth.updateUser({ password: newPassword });

    if (updateError) {
        showPopup("Could not change password: " + updateError.message);
        return;
    }

    showPopup("Password changed successfully.");

    closePasswordPopup();
}



// =====================================================
// SYSTEM SETTINGS
// Device-level preferences (not shared data), so these stay
// in localStorage intentionally — there's no "settings" table.
// =====================================================

function openSettingsPopup() {
    loadSettings();
    document.getElementById("settingsOverlay").classList.add("show");
}


function closeSettingsPopup() {
    document.getElementById("settingsOverlay")?.classList.remove("show");
}


function loadSettings() {

    const settings =
        JSON.parse(localStorage.getItem("banchetoSettings")) ||
        { notifications: true, lastBackup: null };

    const toggle = document.getElementById("notificationToggle");
    if (toggle) toggle.checked = settings.notifications;

    const backupText = document.getElementById("lastBackupText");

    if (backupText && settings.lastBackup) {
        backupText.textContent =
            "Last Backup: " + new Date(settings.lastBackup).toLocaleString();
    }
}


async function saveNotificationSettingToDb(enabled) {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;

        await sb.from("user_settings").upsert(
            { user_id: user.id, notifications: enabled },
            { onConflict: "user_id" }
        );
    } catch (e) { /* local setting is already saved */ }
}


function saveSettings() {

    const toggle = document.getElementById("notificationToggle");
    const oldSettings = JSON.parse(localStorage.getItem("banchetoSettings")) || {};

    const settings = {
        notifications: toggle ? toggle.checked : true,
        lastBackup: oldSettings.lastBackup || null
    };

    localStorage.setItem("banchetoSettings", JSON.stringify(settings));

    // Tell the Dashboard right away so the bell turns on/off without a refresh
    window.dispatchEvent(new CustomEvent("banchetoSettingsChanged", { detail: settings }));

    // Also save to the database so the Dashboard's sync on load doesn't
    // bring back the old value
    saveNotificationSettingToDb(settings.notifications);

    showPopup("System settings saved successfully.");

    closeSettingsPopup();
}



// =====================================================
// BACKUP DATABASE
// Pulls real data from Supabase now — this previously read
// "banchetoUsers"/"loginHistory" from localStorage, which are
// no longer written to, so the export was silently empty.
// =====================================================

async function backupDatabase() {

    const { data: users, error: usersError } =
        await sb.from("profiles").select("*");

    const { data: loginHistory, error: historyError } =
        await sb.from("login_history").select("*");

    if (usersError || historyError) {
        showPopup(
            "Could not create backup: " +
            (usersError?.message || historyError?.message)
        );
        return;
    }

    const settings =
        JSON.parse(localStorage.getItem("banchetoSettings")) || {};

    const backupData = {
        system: "Yesunim",
        version: "1.0.0",
        backupDate: new Date().toISOString(),
        users: users || [],
        loginHistory: loginHistory || [],
        settings: settings
    };

    const json = JSON.stringify(backupData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "yesunim-backup-" + new Date().toISOString().slice(0, 10) + ".json";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);


    const updatedSettings =
        JSON.parse(localStorage.getItem("banchetoSettings")) || {};

    updatedSettings.lastBackup = Date.now();

    localStorage.setItem("banchetoSettings", JSON.stringify(updatedSettings));

    loadSettings();

    showPopup("Database backup created successfully.");
}



// =====================================================
// INITIALIZE
// =====================================================

document.addEventListener("DOMContentLoaded", function () {

    const profileButton = document.querySelector(".Popup-icons .profile");
    if (profileButton) profileButton.addEventListener("click", openProfilePopup);

    const settingsButton = document.querySelector(".Popup-icons .setting");
    if (settingsButton) settingsButton.addEventListener("click", openSettingsPopup);

    document.getElementById("closeProfileBtn")?.addEventListener("click", closeProfilePopup);

    document.getElementById("openPasswordBtn")?.addEventListener("click", openPasswordPopup);
    document.getElementById("closePasswordBtn")?.addEventListener("click", closePasswordPopup);
    document.getElementById("cancelPasswordBtn")?.addEventListener("click", closePasswordPopup);
    document.getElementById("changePasswordBtn")?.addEventListener("click", changePassword);

    document.getElementById("saveProfileBtn")?.addEventListener("click", saveProfile);

    document.getElementById("closeSettingsBtn")?.addEventListener("click", closeSettingsPopup);
    document.getElementById("saveSettingsBtn")?.addEventListener("click", saveSettings);
    document.getElementById("backupBtn")?.addEventListener("click", backupDatabase);


    document.getElementById("profileOverlay")?.addEventListener("click", function (event) {
        if (event.target === this) closeProfilePopup();
    });

    document.getElementById("passwordOverlay")?.addEventListener("click", function (event) {
        if (event.target === this) closePasswordPopup();
    });

    document.getElementById("settingsOverlay")?.addEventListener("click", function (event) {
        if (event.target === this) closeSettingsPopup();
    });


    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeProfilePopup();
            closePasswordPopup();
            closeSettingsPopup();
        }
    });


    updateDashboardUser();
    loadSettings();
});


document.addEventListener("DOMContentLoaded", function () {

    const passwordToggleButtons = document.querySelectorAll(".toggle-password");

    passwordToggleButtons.forEach(function (button) {

        button.addEventListener("click", function () {

            const targetId = button.getAttribute("data-target");
            const passwordInput = document.getElementById(targetId);
            const icon = button.querySelector("i");

            if (!passwordInput || !icon) return;

            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                icon.classList.remove("bx-hide");
                icon.classList.add("bx-show");
                button.setAttribute("aria-label", "Hide password");
            } else {
                passwordInput.type = "password";
                icon.classList.remove("bx-show");
                icon.classList.add("bx-hide");
                button.setAttribute("aria-label", "Show password");
            }
        });
    });
});