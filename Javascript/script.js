
// ==========================================
// BANCHETO DE BUSTOS - LOGIN SYSTEM
// ==========================================

document.addEventListener("DOMContentLoaded", function () {

    // ==========================================
    // SIGN UP
    // ==========================================

    const signupForm = document.querySelector('form');

    // Detect whether this is the Sign Up page
    const signupTitle = document.querySelector(".login h1");

    if (signupTitle && signupTitle.textContent.trim() === "Sign Up") {

        signupForm.addEventListener("submit", function (event) {
            event.preventDefault();

            const inputs = signupForm.querySelectorAll("input");
            const fullname = inputs[0].value.trim();
            const username = inputs[1].value.trim();
            const emailOrPhone = inputs[2].value.trim();
            const password = inputs[3].value;
            const confirmPassword = inputs[4].value;

            const role = signupForm.querySelector("select").value;
            const terms = signupForm.querySelector('input[type="checkbox"]').checked;

            // Basic validation
            if (
                !fullname ||
                !username ||
                !emailOrPhone ||
                !password ||
                !confirmPassword ||
                !role
            ) {
                showMessage("Please complete all required fields.", "error");
                return;
            }

            // Check password match
            if (password !== confirmPassword) {
                showMessage("Passwords do not match.", "error");
                return;
            }

            // Password length
            if (password.length < 6) {
                showMessage(
                    "Password must contain at least 6 characters.",
                    "error"
                );
                return;
            }

            // Terms and conditions
            if (!terms) {
                showMessage(
                    "You must agree to the Terms of Service and Privacy Policy.",
                    "error"
                );
                return;
            }

            // Get existing users
            let users = JSON.parse(localStorage.getItem("banchetoUsers")) || [];

            // Check duplicate username
            const existingUsername = users.find(
                user => user.username.toLowerCase() === username.toLowerCase()
            );

            if (existingUsername) {
                showMessage("Username is already registered.", "error");
                return;
            }

            // Check duplicate email/phone
            const existingContact = users.find(
                user =>
                    user.emailOrPhone.toLowerCase() ===
                    emailOrPhone.toLowerCase()
            );

            if (existingContact) {
                showMessage(
                    "Email or phone number is already registered.",
                    "error"
                );
                return;
            }

            // Create new user
            const newUser = {
                id: Date.now(),
                fullname: fullname,
                username: username,
                emailOrPhone: emailOrPhone,
                password: password,
                role: role,
                lastLogin: null,
                lastActivity: null
            };

            // Save user
            users.push(newUser);

            localStorage.setItem(
                "banchetoUsers",
                JSON.stringify(users)
            );

            showMessage(
                "Account created successfully! Redirecting to Sign In...",
                "success"
            );

            // Redirect to Sign In
            setTimeout(function () {
                window.location.href = "../Log_In/SignIn.html";
            }, 1500);
        });
    }


    // ==========================================
    // SIGN IN
    // ==========================================

   const signinForm = document.getElementById("signinForm");

     if (signinForm) {

         signinForm.addEventListener("submit", function (event) {
            event.preventDefault();

             const emailOrPhone =
                 document.getElementById("loginUsername").value.trim();

             const password =
                 document.getElementById("loginPassword").value;

             const rememberMe =
                 document.getElementById("rememberMe").checked;


        // Validate fields
             if (!emailOrPhone || !password) {

                 showMessage(
                "Please enter your email/phone and password.",
                "error"
             );

             return;
         }


        // Get users
             const users = JSON.parse(
                localStorage.getItem("banchetoUsers")
             ) || [];


        // Find account
             const user = users.find(account =>
                account.emailOrPhone.toLowerCase() ===
                emailOrPhone.toLowerCase() &&
                account.password === password
         );


        // Incorrect login
             if (!user) { 
                saveLoginHistory("Unknown User",
                    emailOrPhone,
                    "Unknown",
                    "Failed"

                );
                
                showMessage(
                "Invalid email/phone number or password.",
                "error"
             );

             return;
         }

         // ==========================================
         // // UPDATE LOGIN ACTIVITY
         // // ==========================================
         
         const now = Date.now();
         user.lastLogin = now;
         user.lastActivity = now;

         // Save updated user back to localStorage

         localStorage.setItem("banchetoUsers",
            JSON.stringify(users)
        );

        // Save logged-in user
             const loginSession = {

                 id: user.id,

                 fullname: user.fullname,

                 username: user.username,

                 emailOrPhone: user.emailOrPhone,

                 role: user.role,

                 lastLogin: user.lastLogin,
                 
                 lastActivity: user.lastActivity

         };


             if (rememberMe) {

                 localStorage.setItem(
                 "banchetoCurrentUser",
                 JSON.stringify(loginSession)
             );

             } else {

                 sessionStorage.setItem(
                 "banchetoCurrentUser",
                 JSON.stringify(loginSession)
             );

         }


        // Save login history
             saveLoginHistory(
                 user.fullname,
                 user.username,
                 user.role,
                 "Successful"
             );


             showMessage(
                 "Login successful! Redirecting...",
                 "success"
             );


        // Redirect to Dashboard
             setTimeout(function () {
                 window.location.href = "../Side_Bar/Dashboard.html";
             }, 1000);
         });
 }

    // ==========================================
    // MESSAGE FUNCTION
    // ==========================================

    function showMessage(message, type) {

        // Remove previous message
        const oldMessage = document.querySelector(".form-message");

        if (oldMessage) {
            oldMessage.remove();
        }

        const messageElement = document.createElement("div");

        messageElement.className = "form-message";
        messageElement.textContent = message;

        if (type === "success") {
            messageElement.style.color = "#198754";
            messageElement.style.backgroundColor = "#d1e7dd";
            messageElement.style.border = "1px solid #badbcc";
        } else {
            messageElement.style.color = "#842029";
            messageElement.style.backgroundColor = "#f8d7da";
            messageElement.style.border = "1px solid #f5c2c7";
        }

        messageElement.style.padding = "12px";
        messageElement.style.marginBottom = "15px";
        messageElement.style.borderRadius = "8px";
        messageElement.style.fontSize = "14px";

        const activeForm = document.querySelector("form");
        if (activeForm) {
            activeForm.prepend(messageElement);
        }
    }
});



