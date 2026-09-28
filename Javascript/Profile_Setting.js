// =====================================================
// YESUNIM — PROFILE & SYSTEM SETTINGS
// Migrated to Supabase Auth + "profiles" table.
// =====================================================


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
            alert("Please select an image.");
            this.value = "";
            return;
        }

        const key = getProfilePictureKey();

        if (!key) {
            alert("No logged-in user found.");
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
        alert("No logged-in user found.");
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
        alert("No logged-in user found.");
        return;
    }

    const { authUser, profile } = result;

    const fullname = document.getElementById("profileFullname").value.trim();
    const username = document.getElementById("profileUsername").value.trim();
    const emailOrPhone = document.getElementById("profileEmailPhone").value.trim();

    if (!fullname || !username || !emailOrPhone) {
        alert("Please complete all profile fields.");
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
        alert("Something went wrong checking that username. Please try again.");
        return;
    }

    if (duplicate) {
        alert("That username is already being used.");
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
        alert("Could not update profile: " + updateError.message);
        return;
    }


    // UPDATE EMAIL, IF CHANGED (lives in Supabase Auth, not "profiles")

    if (emailOrPhone !== authUser.email) {

        const { error: emailError } =
            await sb.auth.updateUser({ email: emailOrPhone });

        if (emailError) {
            alert(
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


    alert("Profile updated successfully.");

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
        alert("No logged-in user found.");
        return;
    }

    const { authUser } = result;

    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmNewPassword").value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        alert("Please complete all password fields.");
        return;
    }

    if (newPassword.length < 8) {
        alert("Password must contain at least 8 characters.");
        return;
    }

    if (newPassword !== confirmPassword) {
        alert("New passwords do not match.");
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
        alert("Current password is incorrect.");
        return;
    }


    // UPDATE TO NEW PASSWORD

    const { error: updateError } =
        await sb.auth.updateUser({ password: newPassword });

    if (updateError) {
        alert("Could not change password: " + updateError.message);
        return;
    }

    alert("Password changed successfully.");

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


function saveSettings() {

    const toggle = document.getElementById("notificationToggle");
    const oldSettings = JSON.parse(localStorage.getItem("banchetoSettings")) || {};

    const settings = {
        notifications: toggle ? toggle.checked : true,
        lastBackup: oldSettings.lastBackup || null
    };

    localStorage.setItem("banchetoSettings", JSON.stringify(settings));

    alert("System settings saved successfully.");

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
        alert(
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

    alert("Database backup created successfully.");
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
                icon.classList.remove("bx-show");
                icon.classList.add("bx-hide");
                button.setAttribute("aria-label", "Hide password");
            } else {
                passwordInput.type = "password";
                icon.classList.remove("bx-hide");
                icon.classList.add("bx-show");
                button.setAttribute("aria-label", "Show password");
            }
        });
    });
});