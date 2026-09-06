// =====================================================
// BANCHETO DE BUSTOS
// PROFILE & SYSTEM SETTINGS
// =====================================================



// =====================================================
// GET CURRENT LOGGED-IN USER
// =====================================================

function getCurrentUser() {

    const localUser =
        localStorage.getItem("banchetoCurrentUser");

    const sessionUser =
        sessionStorage.getItem("banchetoCurrentUser");


    if (localUser) {

        return JSON.parse(localUser);

    }


    if (sessionUser) {

        return JSON.parse(sessionUser);

    }


    return null;

}



// =====================================================
// GET USERS
// =====================================================

function getUsers() {

    return JSON.parse(
        localStorage.getItem("banchetoUsers")
    ) || [];

}



// =====================================================
// FIND CURRENT USER IN DATABASE
// =====================================================

function findCurrentUser() {

    const currentUser = getCurrentUser();

    if (!currentUser) {

        return null;

    }


    const users = getUsers();


    return users.find(
        user =>
            Number(user.id) ===
            Number(currentUser.id)
    ) || null;

}



/* ===============================
   PROFILE PICTURE
================================ */

const profileAvatar = document.getElementById("profileAvatar");
const profilePictureInput = document.getElementById("profilePictureInput");

const profileAvatarImage =
    document.getElementById("profileAvatarImage");

const profileAvatarIcon =
    document.getElementById("profileAvatarIcon");

const dashboardProfileImage =
    document.getElementById("dashboardProfileImage");

const dashboardProfileIcon =
    document.getElementById("dashboardProfileIcon");


/* ===============================
   GET CURRENT ACCOUNT
================================ */

function getProfilePictureKey() {

    const user = findCurrentUser();

    if (!user || !user.username) {
        return null;
    }

    return "profilePicture_" + user.username;
}


/* ===============================
   LOAD PROFILE PICTURE
================================ */

function loadProfilePicture() {

    const key = getProfilePictureKey();

    if (!key) {
        return;
    }

    const savedPicture = localStorage.getItem(key);


    /* No picture yet */

    if (!savedPicture) {

        profileAvatarImage.style.display = "none";
        profileAvatarIcon.style.display = "block";


        if (dashboardProfileImage) {
            dashboardProfileImage.style.display = "none";
        }

        if (dashboardProfileIcon) {
            dashboardProfileIcon.style.display = "block";
        }

        return;
    }


    /* Account Profile */

    profileAvatarImage.src = savedPicture;
    profileAvatarImage.style.display = "block";
    profileAvatarIcon.style.display = "none";


    /* Dashboard */

    if (dashboardProfileImage) {

        dashboardProfileImage.src = savedPicture;
        dashboardProfileImage.style.display = "block";
    }

    if (dashboardProfileIcon) {

        dashboardProfileIcon.style.display = "none";
    }
}


/* ===============================
   OPEN FILE SELECTOR
================================ */

if (profileAvatar && profilePictureInput) {

    profileAvatar.addEventListener("click", () => {
        profilePictureInput.click();
    });

}


/* ===============================
   SELECT PROFILE PICTURE
================================ */

if (profilePictureInput) {

    profilePictureInput.addEventListener("change", function () {

        const file = this.files[0];

        if (!file) {
            return;
        }


        /* Check image */

        if (!file.type.startsWith("image/")) {

            alert("Please select an image.");

            this.value = "";

            return;
        }


        /* Get current account */

        const key = getProfilePictureKey();

        if (!key) {

            alert("No logged-in user found.");

            this.value = "";

            return;
        }


        /* Read image */

        const reader = new FileReader();


        reader.onload = function (event) {

            const image = event.target.result;


            /* ===============================
               ACCOUNT PROFILE
            =============================== */

            profileAvatarImage.src = image;
            profileAvatarImage.style.display = "block";

            profileAvatarIcon.style.display = "none";


            /* ===============================
               DASHBOARD
            =============================== */

            if (dashboardProfileImage) {

                dashboardProfileImage.src = image;
                dashboardProfileImage.style.display = "block";
            }


            if (dashboardProfileIcon) {

                dashboardProfileIcon.style.display = "none";
            }


            /* ===============================
               SAVE TO CURRENT ACCOUNT
            =============================== */

            localStorage.setItem(key, image);

        };


        reader.readAsDataURL(file);

    });

}


/* ===============================
   LOAD PICTURE ON PAGE START
================================ */

loadProfilePicture();




/* ===============================
   OPEN PROFILE POPUP
================================ */

function openProfilePopup() {

    const overlay =
        document.getElementById("profileOverlay");


    if (!overlay) {
        return;
    }


    const user = findCurrentUser();


    if (!user) {

        alert("No logged-in user found.");

        return;
    }


    /* ===============================
       PROFILE INFORMATION
    =============================== */

    document.getElementById(
        "profileFullname"
    ).value = user.fullname || "";


    document.getElementById(
        "profileUsername"
    ).value = user.username || "";


    document.getElementById(
        "profileEmailPhone"
    ).value = user.emailOrPhone || "";


    document.getElementById(
        "profileRole"
    ).value = user.role || "";


    /* ===============================
       LOAD THIS USER'S PICTURE
    =============================== */

    loadProfilePicture();


    /* ===============================
       SHOW POPUP
    =============================== */

    overlay.classList.add("show");

}




// =====================================================
// CLOSE PROFILE
// =====================================================

function closeProfilePopup() {

    const overlay =
        document.getElementById("profileOverlay");


    if (overlay) {

        overlay.classList.remove("show");

    }

}



// =====================================================
// SAVE PROFILE
// =====================================================

function saveProfile() {

    const currentUser =
        getCurrentUser();


    if (!currentUser) {

        alert("No logged-in user found.");

        return;

    }


    const fullname =
        document
            .getElementById("profileFullname")
            .value
            .trim();


    const username =
        document
            .getElementById("profileUsername")
            .value
            .trim();


    const emailOrPhone =
        document
            .getElementById("profileEmailPhone")
            .value
            .trim();


    if (
        !fullname ||
        !username ||
        !emailOrPhone
    ) {

        alert(
            "Please complete all profile fields."
        );

        return;

    }


    let users = getUsers();


    const userIndex =
        users.findIndex(
            user =>
                Number(user.id) ===
                Number(currentUser.id)
        );


    if (userIndex === -1) {

        alert("Account could not be found.");

        return;

    }



    // ==========================================
    // CHECK USERNAME DUPLICATE
    // ==========================================

    const duplicateUsername =
        users.some(
            (user, index) =>

                index !== userIndex &&

                user.username &&
                user.username.toLowerCase() ===
                username.toLowerCase()
        );


    if (duplicateUsername) {

        alert(
            "That username is already being used."
        );

        return;

    }



    // ==========================================
    // CHECK EMAIL / PHONE DUPLICATE
    // ==========================================

    const duplicateContact =
        users.some(
            (user, index) =>

                index !== userIndex &&

                user.emailOrPhone &&
                user.emailOrPhone.toLowerCase() ===
                emailOrPhone.toLowerCase()
        );


    if (duplicateContact) {

        alert(
            "That email or phone number is already being used."
        );

        return;

    }



    // ==========================================
    // UPDATE USER
    // ==========================================

    users[userIndex].fullname =
        fullname;

    users[userIndex].username =
        username;

    users[userIndex].emailOrPhone =
        emailOrPhone;



    // ==========================================
    // SAVE USERS
    // ==========================================

    localStorage.setItem(
        "banchetoUsers",
        JSON.stringify(users)
    );



    // ==========================================
    // UPDATE CURRENT SESSION
    // ==========================================

    const updatedSession = {

        id: users[userIndex].id,

        fullname:
            users[userIndex].fullname,

        username:
            users[userIndex].username,

        emailOrPhone:
            users[userIndex].emailOrPhone,

        role:
            users[userIndex].role,

        lastLogin:
            users[userIndex].lastLogin,

        lastActivity:
            users[userIndex].lastActivity

    };



    // Remember Me = localStorage

    if (
        localStorage.getItem(
            "banchetoCurrentUser"
        )
    ) {

        localStorage.setItem(
            "banchetoCurrentUser",
            JSON.stringify(updatedSession)
        );

    }



    // Normal login = sessionStorage

    if (
        sessionStorage.getItem(
            "banchetoCurrentUser"
        )
    ) {

        sessionStorage.setItem(
            "banchetoCurrentUser",
            JSON.stringify(updatedSession)
        );

    }



    alert(
        "Profile updated successfully."
    );


    closeProfilePopup();


    // Update dashboard greeting

    updateDashboardUser();

}



// =====================================================
// UPDATE DASHBOARD USER NAME
// =====================================================

function updateDashboardUser() {

    const currentUser =
        getCurrentUser();


    if (!currentUser) {

        return;

    }


    const dashboardSpan =
        document.querySelector(
            ".Dashboard-header p span"
        );


    if (dashboardSpan) {

        dashboardSpan.textContent =
            currentUser.fullname || "ADMIN";

    }

}



// =====================================================
// OPEN PASSWORD POPUP
// =====================================================

function openPasswordPopup() {

    document.getElementById(
        "currentPassword"
    ).value = "";


    document.getElementById(
        "newPassword"
    ).value = "";


    document.getElementById(
        "confirmNewPassword"
    ).value = "";


    document.getElementById(
        "passwordOverlay"
    ).classList.add("show");

}



// =====================================================
// CLOSE PASSWORD POPUP
// =====================================================

function closePasswordPopup() {

    document.getElementById(
        "passwordOverlay"
    ).classList.remove("show");

}



// =====================================================
// CHANGE PASSWORD
// =====================================================

function changePassword() {

    const currentUser =
        getCurrentUser();


    if (!currentUser) {

        alert(
            "No logged-in user found."
        );

        return;

    }


    const currentPassword =
        document.getElementById(
            "currentPassword"
        ).value;


    const newPassword =
        document.getElementById(
            "newPassword"
        ).value;


    const confirmPassword =
        document.getElementById(
            "confirmNewPassword"
        ).value;



    // ==========================================
    // VALIDATE
    // ==========================================

    if (
        !currentPassword ||
        !newPassword ||
        !confirmPassword
    ) {

        alert(
            "Please complete all password fields."
        );

        return;

    }


    let users = getUsers();


    const userIndex =
        users.findIndex(
            user =>
                Number(user.id) ===
                Number(currentUser.id)
        );


    if (userIndex === -1) {

        alert(
            "Account could not be found."
        );

        return;

    }



    // ==========================================
    // CHECK CURRENT PASSWORD
    // ==========================================

    if (
        users[userIndex].password !==
        currentPassword
    ) {

        alert(
            "Current password is incorrect."
        );

        return;

    }



    // ==========================================
    // PASSWORD LENGTH
    // ==========================================

    if (
        newPassword.length < 6
    ) {

        alert(
            "Password must contain at least 6 characters."
        );

        return;

    }



    // ==========================================
    // CONFIRM PASSWORD
    // ==========================================

    if (
        newPassword !==
        confirmPassword
    ) {

        alert(
            "New passwords do not match."
        );

        return;

    }



    // ==========================================
    // SAVE PASSWORD
    // ==========================================

    users[userIndex].password =
        newPassword;


    localStorage.setItem(
        "banchetoUsers",
        JSON.stringify(users)
    );


    alert(
        "Password changed successfully."
    );


    closePasswordPopup();

}



// =====================================================
// OPEN SETTINGS
// =====================================================

function openSettingsPopup() {

    loadSettings();


    document.getElementById(
        "settingsOverlay"
    ).classList.add("show");

}



// =====================================================
// CLOSE SETTINGS
// =====================================================

function closeSettingsPopup() {

    document.getElementById(
        "settingsOverlay"
    ).classList.remove("show");

}



// =====================================================
// LOAD SETTINGS
// =====================================================

function loadSettings() {

    const settings =
        JSON.parse(
            localStorage.getItem(
                "banchetoSettings"
            )
        ) || {

            notifications: true,

            lastBackup: null

        };


    const toggle =
        document.getElementById(
            "notificationToggle"
        );


    if (toggle) {

        toggle.checked =
            settings.notifications;

    }


    const backupText =
        document.getElementById(
            "lastBackupText"
        );


    if (
        backupText &&
        settings.lastBackup
    ) {

        backupText.textContent =
            "Last Backup: " +
            new Date(
                settings.lastBackup
            ).toLocaleString();

    }

}



// =====================================================
// SAVE SETTINGS
// =====================================================

function saveSettings() {

    const toggle =
        document.getElementById(
            "notificationToggle"
        );


    const oldSettings =
        JSON.parse(
            localStorage.getItem(
                "banchetoSettings"
            )
        ) || {};


    const settings = {

        notifications:
            toggle
                ? toggle.checked
                : true,

        lastBackup:
            oldSettings.lastBackup || null

    };


    localStorage.setItem(
        "banchetoSettings",
        JSON.stringify(settings)
    );


    alert(
        "System settings saved successfully."
    );


    closeSettingsPopup();

}



// =====================================================
// BACKUP DATABASE
// =====================================================

function backupDatabase() {

    const users =
        JSON.parse(
            localStorage.getItem(
                "banchetoUsers"
            )
        ) || [];


    const loginHistory =
        JSON.parse(
            localStorage.getItem(
                "loginHistory"
            )
        ) || [];


    const settings =
        JSON.parse(
            localStorage.getItem(
                "banchetoSettings"
            )
        ) || {};



    // Create backup object

    const backupData = {

        system:
            "Bancheto De Bustos",

        version:
            "1.0.0",

        backupDate:
            new Date().toISOString(),

        users:
            users,

        loginHistory:
            loginHistory,

        settings:
            settings

    };



    // Convert to JSON

    const json =
        JSON.stringify(
            backupData,
            null,
            2
        );


    const blob =
        new Blob(
            [json],
            {
                type:
                    "application/json"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement("a");


    link.href = url;


    link.download =
        "bancheto-backup-" +
        new Date()
            .toISOString()
            .slice(0, 10) +
        ".json";


    document.body.appendChild(link);


    link.click();


    document.body.removeChild(link);


    URL.revokeObjectURL(url);



    // Save backup time

    const updatedSettings =
        JSON.parse(
            localStorage.getItem(
                "banchetoSettings"
            )
        ) || {};


    updatedSettings.lastBackup =
        Date.now();


    localStorage.setItem(
        "banchetoSettings",
        JSON.stringify(
            updatedSettings
        )
    );


    loadSettings();


    alert(
        "Database backup created successfully."
    );

}



// =====================================================
// INITIALIZE
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {


        // ==========================================
        // PROFILE BUTTON
        // ==========================================

        const profileButton =
            document.querySelector(
                ".Popup-icons .profile"
            );


        if (profileButton) {

            profileButton.addEventListener(
                "click",
                openProfilePopup
            );

        }



        // ==========================================
        // SETTINGS BUTTON
        // ==========================================

        const settingsButton =
            document.querySelector(
                ".Popup-icons .setting"
            );


        if (settingsButton) {

            settingsButton.addEventListener(
                "click",
                openSettingsPopup
            );

        }



        // ==========================================
        // PROFILE CLOSE
        // ==========================================

        document
            .getElementById("closeProfileBtn")
            ?.addEventListener(
                "click",
                closeProfilePopup
            );



        // ==========================================
        // PASSWORD
        // ==========================================

        document
            .getElementById("openPasswordBtn")
            ?.addEventListener(
                "click",
                openPasswordPopup
            );


        document
            .getElementById("closePasswordBtn")
            ?.addEventListener(
                "click",
                closePasswordPopup
            );


        document
            .getElementById("cancelPasswordBtn")
            ?.addEventListener(
                "click",
                closePasswordPopup
            );


        document
            .getElementById("changePasswordBtn")
            ?.addEventListener(
                "click",
                changePassword
            );



        // ==========================================
        // SAVE PROFILE
        // ==========================================

        document
            .getElementById("saveProfileBtn")
            ?.addEventListener(
                "click",
                saveProfile
            );



        // ==========================================
        // SETTINGS
        // ==========================================

        document
            .getElementById("closeSettingsBtn")
            ?.addEventListener(
                "click",
                closeSettingsPopup
            );


        document
            .getElementById("saveSettingsBtn")
            ?.addEventListener(
                "click",
                saveSettings
            );


        document
            .getElementById("backupBtn")
            ?.addEventListener(
                "click",
                backupDatabase
            );



        // ==========================================
        // CLICK OUTSIDE POPUP
        // ==========================================

        document
            .getElementById("profileOverlay")
            ?.addEventListener(
                "click",
                function (event) {

                    if (
                        event.target ===
                        this
                    ) {

                        closeProfilePopup();

                    }

                }
            );


        document
            .getElementById("passwordOverlay")
            ?.addEventListener(
                "click",
                function (event) {

                    if (
                        event.target ===
                        this
                    ) {

                        closePasswordPopup();

                    }

                }
            );


        document
            .getElementById("settingsOverlay")
            ?.addEventListener(
                "click",
                function (event) {

                    if (
                        event.target ===
                        this
                    ) {

                        closeSettingsPopup();

                    }

                }
            );



        // ==========================================
        // ESC KEY
        // ==========================================

        document.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key ===
                    "Escape"
                ) {

                    closeProfilePopup();

                    closePasswordPopup();

                    closeSettingsPopup();

                }

            }
        );



        // ==========================================
        // DASHBOARD USER NAME
        // ==========================================

        updateDashboardUser();


        // ==========================================
        // SETTINGS
        // ==========================================

        loadSettings();

    }
);

