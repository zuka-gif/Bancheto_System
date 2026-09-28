// ==========================================
// BANCHETO DE BUSTOS - LOGIN SYSTEM
// ==========================================

document.addEventListener("DOMContentLoaded", function () {

    // SHOW / HIDE PASSWORD

    const passwordToggleButtons =
        document.querySelectorAll(".toggle-password");

    passwordToggleButtons.forEach(function (button) {

        button.addEventListener("click", function () {

            const targetId =
                button.getAttribute("data-target");

            const passwordInput =
                document.getElementById(targetId);

            const icon =
                button.querySelector("i");

            if (!passwordInput || !icon) {
                return;
            }

            if (passwordInput.type === "password") {

                passwordInput.type = "text";

                icon.classList.remove("bx-show");
                icon.classList.add("bx-hide");

                button.setAttribute(
                    "aria-label",
                    "Hide password"
                );

            }

            else {

                passwordInput.type = "password";

                icon.classList.remove("bx-hide");
                icon.classList.add("bx-show");

                button.setAttribute(
                    "aria-label",
                    "Show password"
                );

            }

        });

    });


    // SIGN UP

    const signupForm =
        document.getElementById("signupForm");


    if (signupForm) {

        // HIDE "OWNER" OPTION IF ONE ALREADY EXISTS
        // Only one Owner account should ever exist. This uses a
        // security-definer RPC (see owner_exists.sql) since an anonymous
        // visitor can't SELECT from "profiles" directly under RLS —
        // same reason username_exists() below is an RPC instead of a
        // normal query.

        (async function hideOwnerOptionIfTaken() {

            const roleSelect =
                document.getElementById("signupRole");

            if (!roleSelect) {
                return;
            }

            const { data: ownerTaken, error: ownerCheckError } =
                await sb.rpc("owner_exists");

            if (ownerCheckError) {
                console.error("Could not check for existing Owner:", ownerCheckError.message);
                return;
            }

            if (ownerTaken) {

                // The Owner <option> has no value="" attribute in the
                // markup, so its .value property just falls back to its
                // text content — checking textContent is the reliable way
                // to find it either way.
                Array.from(roleSelect.options).forEach(function (option) {

                    if (option.textContent.trim() === "Owner") {
                        option.remove();
                    }

                });

            }

        })();


        signupForm.addEventListener("submit", async function (event) {

            event.preventDefault();


            const fullname =
                document.getElementById("signupFullname").value.trim();


            const username =
                document.getElementById("signupUsername").value.trim();


            const emailOrPhone =
                document.getElementById("signupEmailOrPhone").value.trim();


            const password =
                document.getElementById("signupPassword").value;


            const confirmPassword =
                document.getElementById("signupConfirmPassword").value;


            const roleSelect =
                document.getElementById("signupRole");


            const role =
                roleSelect
                    ? roleSelect.value
                    : "";


            const termsCheckbox =
                signupForm.querySelector(
                    'input[type="checkbox"]'
                );


            const terms =
                termsCheckbox
                    ? termsCheckbox.checked
                    : false;


            // VALIDATION

            if (
                !fullname ||
                !username ||
                !emailOrPhone ||
                !password ||
                !confirmPassword ||
                !role
            ) {

                showMessage(
                    "Please complete all required fields.",
                    "error"
                );

                return;
            }
           

            // PASSWORD MATCH


            if (password !== confirmPassword) {

                showMessage(
                    "Passwords do not match.",
                    "error"
                );

                return;
            }


            
            // PASSWORD LENGTH
            

            if (password.length < 8) {

                showMessage(
                    "Password must contain at least 8 characters.",
                    "error"
                );

                return;
            }


            
            // TERMS
            

            if (!terms) {

                showMessage(
                    "You must agree to the Terms of Service and Privacy Policy.",
                    "error"
                );

                return;
            }


            const submitBtn =
                signupForm.querySelector('button[type="submit"]');

            if (submitBtn) submitBtn.disabled = true;


            // DUPLICATE USERNAME
            // (Supabase Auth itself will reject a duplicate email at
            // the signUp() step below, so only username needs its own
            // check here.)
            //
            // This runs BEFORE the person is authenticated (no
            // auth.uid() yet), so it can't go through a normal
            // .select() on "profiles" — RLS has no policy letting an
            // anonymous visitor read that table. Instead it calls a
            // security-definer RPC (see username_exists.sql) that only
            // ever answers true/false, without exposing any row data.

            const { data: usernameTaken, error: usernameCheckError } =
                await sb.rpc("username_exists", {
                    check_username: username
                });

            if (usernameCheckError) {
                showMessage(
                    "Something went wrong checking that username. Please try again.",
                    "error"
                );
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            if (usernameTaken) {

                showMessage(
                    "Username is already registered.",
                    "error"
                );

                if (submitBtn) submitBtn.disabled = false;
                return;
            }


            // PREVENT DUPLICATE OWNER (race-condition guard)
            // The Owner option is already removed from the dropdown once
            // one exists, but that only runs once at page load — if this
            // tab had been open since before another Owner account was
            // created, this catches that right before the account is
            // actually made. This is a UX safeguard, not the real
            // enforcement: since role also travels as signup metadata,
            // final enforcement belongs in the handle_new_user trigger
            // (or a DB constraint) on the server side, not here.

            if (role === "Owner") {

                const { data: ownerTaken, error: ownerCheckError } =
                    await sb.rpc("owner_exists");

                if (ownerCheckError) {
                    showMessage(
                        "Something went wrong checking Owner availability. Please try again.",
                        "error"
                    );
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }

                if (ownerTaken) {
                    showMessage(
                        "An Owner account already exists. Please choose Manager or Cashier.",
                        "error"
                    );
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }

            }


            // CREATE THE REAL AUTH ACCOUNT
            // emailOrPhone must be a real, valid email address here —
            // Supabase Auth (in its default email/password setup) signs
            // people up by email, not by arbitrary phone numbers.
            //
            // fullname/username/role are passed as signup metadata
            // (options.data) instead of being inserted into "profiles"
            // directly from here. A database trigger
            // (public.handle_new_user, fired on auth.users insert)
            // reads this same metadata and creates the profiles row on
            // the server side — this works whether or not "Confirm
            // email" is turned on, since it doesn't depend on the
            // client having an active session yet.
            //
            // emailRedirectTo is a fixed address so the confirmation link
            // always opens the "Email confirmed" page, no matter which
            // device or local server the sign-up happened from. This
            // address must also be listed under Authentication → URL
            // Configuration → Redirect URLs in the Supabase dashboard.

            const { data: signUpData, error: signUpError } =
                await sb.auth.signUp({
                    email: emailOrPhone,
                    password: password,
                    options: {
                        emailRedirectTo: "https://zuka-gif.github.io/Bancheto_System/Log_In/Email_Confirmed.html",
                        data: {
                            fullname: fullname,
                            username: username,
                            role: role
                        }
                    }
                });

            if (signUpError) {

                // The client-side owner_exists() check above already
                // catches almost every case, but it's check-then-act,
                // not atomic — two near-simultaneous Owner signups can
                // both pass that check. The one_owner_only DB
                // constraint is the real backstop for that race, and
                // it fails with raw Postgres text ("duplicate key
                // value violates unique constraint..."), which isn't
                // something to show someone signing up.

                const isDuplicateOwner =
                    signUpError &&
                    /one_owner_only/i.test(signUpError.message || "");

                showMessage(
                    isDuplicateOwner
                        ? "An Owner account already exists. Please choose Manager or Cashier."
                        : (signUpError.message ||
                            "Could not create your account. Please try again."),
                    "error"
                );

                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            const newUserId =
                signUpData && signUpData.user
                    ? signUpData.user.id
                    : null;

            if (!newUserId) {

                showMessage(
                    "Something went wrong creating your account. Please try again.",
                    "error"
                );

                if (submitBtn) submitBtn.disabled = false;
                return;
            }


            // WITH "Confirm email" TURNED ON, signUp() creates the
            // account but returns no session — signUpData.session is
            // null until the person clicks the confirmation link in
            // their inbox. Tell them that explicitly instead of
            // promising an immediate sign-in.

            const needsEmailConfirmation =
                !signUpData.session;

            if (needsEmailConfirmation) {

                showMessage(
                    "Account created! Please check your email (" +
                        emailOrPhone +
                        ") and tap the Confirm button before signing in.",
                    "success"
                );

            } else {

                showMessage(
                    "Account created successfully! Redirecting to Sign In...",
                    "success"
                );

            }


            setTimeout(function () {

                window.location.href =
                    "../Log_In/SignIn.html";

            }, needsEmailConfirmation ? 4000 : 1500);

        });

    }



    
    // SIGN IN


    const signinForm =
        document.getElementById("signinForm");


    if (signinForm) {

        // OLD CONFIRMATION LINKS
        // Emails sent before the redirect was changed still point to
        // SignIn.html?confirmed=1. Send those to the "Email confirmed"
        // page instead. Supabase auto-signs the person in from the email
        // link, so sign out first so they log in normally afterwards.
        if (new URLSearchParams(window.location.search).get("confirmed") === "1") {

            sb.auth.signOut().finally(function () {
                window.location.replace("Email_Confirmed.html");
            });

        }

        signinForm.addEventListener("submit", async function (event) {

            event.preventDefault();


            const loginInput =
                document.getElementById("loginUsername");


            const passwordInput =
                document.getElementById("loginPassword");


            const emailOrPhone =
                loginInput
                    ? loginInput.value.trim()
                    : "";


            const password =
                passwordInput
                    ? passwordInput.value
                    : "";


            const rememberCheckbox =
                document.querySelector(
                    "#rememberMe input[type='checkbox']"
                );


            const rememberMe =
                rememberCheckbox
                    ? rememberCheckbox.checked
                    : false;


            
            // VALIDATE
            

            if (!emailOrPhone || !password) {

                showMessage(
                    "Please enter your email/phone and password.",
                    "error"
                );

                return;
            }


            const submitBtn =
                signinForm.querySelector('button[type="submit"]');

            if (submitBtn) submitBtn.disabled = true;


            // SIGN IN AGAINST THE REAL SUPABASE ACCOUNT

            const { data: signInData, error: signInError } =
                await sb.auth.signInWithPassword({
                    email: emailOrPhone,
                    password: password
                });


            // FAILED LOGIN

            if (signInError || !signInData || !signInData.user) {

                // Logged in the background — the person needs to see the
                // error right away, not wait on a write they'll never see
                // the result of.
                saveLoginHistory(
                    "Unknown User",
                    emailOrPhone,
                    "Unknown",
                    "Failed"
                ).catch(function (err) {
                    console.error("Could not log failed attempt:", err);
                });


                // Supabase returns this specific message when "Confirm
                // email" is on and the person hasn't clicked the link
                // in their inbox yet — worth telling them that plainly
                // instead of the generic invalid-credentials message.

                const isUnconfirmed =
                    signInError &&
                    /email not confirmed/i.test(signInError.message || "");

                showMessage(
                    isUnconfirmed
                        ? "Please confirm your email address before signing in. Check your inbox for the confirmation link."
                        : "Invalid email/phone number or password.",
                    "error"
                );

                if (submitBtn) submitBtn.disabled = false;
                return;
            }


            // LOAD THE REST OF THIS ACCOUNT'S INFO (fullname, username, role)

            const { data: profile, error: profileError } =
                await sb
                    .from("profiles")
                    .select("*")
                    .eq("id", signInData.user.id)
                    .single();

            if (profileError || !profile) {

                showMessage(
                    "Your account was found, but its profile is missing. Please contact an administrator.",
                    "error"
                );

                if (submitBtn) submitBtn.disabled = false;
                return;
            }


            
            // TIMESTAMP FOR THIS LOGIN
            

            const nowIso =
                new Date().toISOString();


            
            // LOGIN SESSION
            // Kept in the same shape/keys your other pages already read
            // (getCurrentUserRole(), Access-guard.js, etc. all expect
            // this exact "banchetoCurrentUser" object) — only WHERE this
            // data comes from changed, not what the rest of the app sees.
            

            const loginSession = {

                id: profile.id,

                fullname: profile.fullname,

                username: profile.username,

                emailOrPhone: signInData.user.email,

                role: profile.role,

                lastLogin: nowIso,

                lastActivity: nowIso

            };


            
            // REMEMBER ME
            // Note: this only controls where the CONVENIENCE copy above
            // is kept. Supabase's own real session (the thing that
            // actually authenticates your database queries) persists in
            // its own storage regardless — see logout() in sidebar.js,
            // which now calls sb.auth.signOut() to properly end that
            // real session on logout rather than relying on this alone.
            

            if (rememberMe) {

                localStorage.setItem(
                    "banchetoCurrentUser",
                    JSON.stringify(loginSession)
                );


                sessionStorage.removeItem(
                    "banchetoCurrentUser"
                );

            } else {

                sessionStorage.setItem(
                    "banchetoCurrentUser",
                    JSON.stringify(loginSession)
                );


                localStorage.removeItem(
                    "banchetoCurrentUser"
                );

            }


            
            // ACTIVITY UPDATE + LOGIN HISTORY
            // Neither of these needs to finish before the person sees
            // "Login successful" or gets redirected — they're bookkeeping,
            // not something the next page depends on. Running them
            // together in the background (instead of one-after-another,
            // awaited) removes two full network round trips from what the
            // person actually has to wait through. The 1s delay below,
            // already there for the redirect, doubles as their window to
            // finish quietly.
            

            Promise.all([

                sb
                    .from("profiles")
                    .update({ last_login: nowIso, last_activity: nowIso })
                    .eq("id", profile.id),

                saveLoginHistory(
                    profile.fullname,
                    profile.username,
                    profile.role,
                    "Successful"
                )

            ]).catch(function (err) {
                console.error("Post-login bookkeeping failed:", err);
            });


            
            // SUCCESS MESSAGE
        

            showMessage(
                "Login successful! Redirecting...",
                "success"
            );


            // DASHBOARD
            

            setTimeout(function () {

                window.location.href =
                    "../Side_Bar/Dashboard.html";

            }, 1000);

        });

    }



    
    // FORGOT PASSWORD
    

    const forgotPasswordLink =
        document.getElementById(
            "forgotPasswordLink"
        );


    const forgotPasswordModal =
        document.getElementById(
            "forgotPasswordModal"
        );


    const forgotPasswordForm =
        document.getElementById(
            "forgotPasswordForm"
        );


    const closeForgotPassword =
        document.getElementById(
            "closeForgotPassword"
        );


    // Tracks the email a code was just sent to, and whether the person
    // is completing the reset via that typed-in code (mobile-safe) or
    // via an emailed link they clicked (desktop fallback — see the
    // PASSWORD_RECOVERY listener below). Mobile mail apps often
    // "prescan" links before they're tapped, which silently burns the
    // one-time link token — typing in a code sidesteps that entirely.

    let resetEmail =
        null;

    let resetViaLink =
        false;


    function resetRecoveryState() {

        resetEmail = null;
        resetViaLink = false;

        const codeInput =
            document.getElementById("resetCode");

        if (codeInput) {
            codeInput.value = "";
        }

    }



    
    // OPEN FORGOT PASSWORD
    

    if (
        forgotPasswordLink &&
        forgotPasswordModal
    ) {

        forgotPasswordLink.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                forgotPasswordModal.classList.add(
                    "show"
                );

            }
        );

    }



    
    // CLOSE FORGOT PASSWORD
    

    if (closeForgotPassword) {

        closeForgotPassword.addEventListener(
            "click",
            function () {

                forgotPasswordModal.classList.remove(
                    "show"
                );

            }
        );

    }



    
    // FIND ACCOUNT FOR PASSWORD RESET
    

    if (forgotPasswordForm) {

        forgotPasswordForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const message =
                    document.getElementById(
                        "forgotPasswordMessage"
                    );

                const contactInput =
                    document.getElementById("forgotContact");

                const email =
                    contactInput
                        ? contactInput.value.trim()
                        : "";

                if (!email) {
                    setModalMessage(
                        message,
                        "Please enter your email address.",
                        "error"
                    );
                    return;
                }

                const submitBtn =
                    forgotPasswordForm.querySelector('button[type="submit"]');

                if (submitBtn) submitBtn.disabled = true;


                // Sends a password-reset email via Supabase Auth. As long
                // as the "Reset Password" email template (Authentication →
                // Email Templates, in the Supabase dashboard) includes
                // {{ .Token }}, this email will contain a 6-digit code the
                // person can type in directly — that's what the Reset
                // Password modal below asks for. This no longer depends
                // on the person tapping a link, which is what was failing
                // on mobile.

                const redirectTo =
                    window.location.origin + window.location.pathname;

                const { error } =
                    await sb.auth.resetPasswordForEmail(email, {
                        redirectTo: redirectTo
                    });

                if (submitBtn) submitBtn.disabled = false;

                // Supabase intentionally doesn't reveal whether the
                // email is actually registered (that would let someone
                // probe for valid accounts), so this message stays the
                // same either way — that's expected, not a bug.

                if (error) {
                    console.error("resetPasswordForEmail error:", error);
                    setModalMessage(
                        message,
                        error.message ||
                            "Something went wrong sending the reset code. Please try again.",
                        "error"
                    );
                    return;
                }

                resetEmail = email;
                resetViaLink = false;

                setModalMessage(
                    message,
                    "A verification code has been sent to your email.",
                    "success"
                );

                // Move straight into the Reset Password modal with the
                // code field showing, instead of waiting on a link click.

                setTimeout(function () {

                    forgotPasswordModal.classList.remove("show");

                    const codeGroup =
                        document.getElementById("resetCodeGroup");

                    if (codeGroup) {
                        codeGroup.style.display = "flex";
                    }

                    if (resetPasswordModal) {
                        resetPasswordModal.classList.add("show");
                    }

                }, 1200);

            }
        );

    }



    
    // RESET PASSWORD
    

    const resetPasswordForm =
        document.getElementById(
            "resetPasswordForm"
        );


    const resetPasswordModal =
        document.getElementById(
            "resetPasswordModal"
        );


    const closeResetPassword =
        document.getElementById(
            "closeResetPassword"
        );


    if (resetPasswordForm) {

        resetPasswordForm.addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();

                const codeInput =
                    document.getElementById("resetCode");

                const newPasswordInput =
                    document.getElementById("newPassword");

                const confirmNewPasswordInput =
                    document.getElementById("confirmNewPassword");

                const code =
                    codeInput ? codeInput.value.trim() : "";

                const newPassword =
                    newPasswordInput ? newPasswordInput.value : "";

                const confirmNewPassword =
                    confirmNewPasswordInput ? confirmNewPasswordInput.value : "";

                if (!resetViaLink && !code) {
                    showResetMessage(
                        "Please enter the verification code from your email.",
                        "error"
                    );
                    return;
                }

                if (!newPassword || !confirmNewPassword) {
                    showResetMessage(
                        "Please fill in both password fields.",
                        "error"
                    );
                    return;
                }

                if (newPassword !== confirmNewPassword) {
                    showResetMessage(
                        "Passwords do not match.",
                        "error"
                    );
                    return;
                }

                if (newPassword.length < 8) {
                    showResetMessage(
                        "Password must be at least 8 characters.",
                        "error"
                    );
                    return;
                }

                const submitBtn =
                    resetPasswordForm.querySelector('button[type="submit"]');

                if (submitBtn) submitBtn.disabled = true;


                // If the person got here by typing their email into the
                // Forgot Password form (the mobile-safe path), there's no
                // recovery session yet — verifyOtp() exchanges their
                // 6-digit code for one. If they got here by clicking the
                // emailed link instead (resetViaLink === true, desktop
                // fallback), Supabase already gave them a recovery
                // session automatically, so this step is skipped.

                if (!resetViaLink) {

                    if (!resetEmail) {
                        showResetMessage(
                            "Something went wrong. Please request a new code.",
                            "error"
                        );
                        if (submitBtn) submitBtn.disabled = false;
                        return;
                    }

                    const { error: verifyError } =
                        await sb.auth.verifyOtp({
                            email: resetEmail,
                            token: code,
                            type: "recovery"
                        });

                    if (verifyError) {
                        showResetMessage(
                            verifyError.message ||
                                "That code is invalid or has expired. Please request a new one.",
                            "error"
                        );
                        if (submitBtn) submitBtn.disabled = false;
                        return;
                    }

                }


                const { error } =
                    await sb.auth.updateUser({ password: newPassword });

                if (error) {
                    showResetMessage(
                        error.message ||
                            "Could not update your password. Please request a new code and try again.",
                        "error"
                    );
                    if (submitBtn) submitBtn.disabled = false;
                    return;
                }

                showResetMessage(
                    "Password updated successfully! Please sign in with your new password.",
                    "success"
                );

                // Sign out of the temporary recovery session so the
                // person has to actually sign in with the new password,
                // rather than being left silently logged in.

                setTimeout(async function () {

                    await sb.auth.signOut();

                    if (resetPasswordModal) {
                        resetPasswordModal.classList.remove("show");
                    }

                    resetRecoveryState();

                    window.location.href = window.location.pathname;

                }, 2000);

            }
        );

    }


    // Fires if the person instead clicks the link in the emailed
    // message (desktop fallback path) — Supabase reads the one-time
    // token out of the URL automatically and establishes a temporary
    // recovery session, then emits this event. In this case the code
    // field isn't needed, since a session already exists.

    sb.auth.onAuthStateChange(function (event, session) {

        if (event === "PASSWORD_RECOVERY" && resetPasswordModal) {

            resetViaLink = true;

            const codeGroup =
                document.getElementById("resetCodeGroup");

            if (codeGroup) {
                codeGroup.style.display = "none";
            }

            resetPasswordModal.classList.add("show");

        }

    });




    // CLOSE RESET PASSWORD


    if (closeResetPassword) {

        closeResetPassword.addEventListener(
            "click",
            function () {

                if (resetPasswordModal) {

                    resetPasswordModal.classList.remove(
                        "show"
                    );

                }


                resetRecoveryState();

            }
        );

    }



    
    // TERMS OF SERVICE


    const termsModal =
        document.getElementById(
            "termsModal"
        );


    const termsLinks = [

        document.getElementById(
            "termsLink"
        ),

        document.getElementById(
            "signupTermsLink"
        ),

        document.getElementById(
            "signupTermsFooter"
        )

    ];


    termsLinks.forEach(function (link) {

        if (link) {

            link.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();


                    if (termsModal) {

                        termsModal.classList.add(
                            "show"
                        );

                    }

                }
            );

        }

    });



    
    // CLOSE TERMS


    const closeTerms =
        document.getElementById(
            "closeTerms"
        );


    if (closeTerms) {

        closeTerms.addEventListener(
            "click",
            function () {

                if (termsModal) {

                    termsModal.classList.remove(
                        "show"
                    );

                }

            }
        );

    }



    // PRIVACY POLICY
    

    const privacyModal =
        document.getElementById(
            "privacyModal"
        );


    const privacyLinks = [

        document.getElementById(
            "privacyPolicyLink"
        ),

        document.getElementById(
            "signupPrivacyLink"
        ),

        document.getElementById(
            "signupPrivacyFooter"
        )

    ];


    privacyLinks.forEach(function (link) {

        if (link) {

            link.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();


                    if (privacyModal) {

                        privacyModal.classList.add(
                            "show"
                        );

                    }

                }
            );

        }

    });



    
    // CLOSE PRIVACY
    

    const closePrivacy =
        document.getElementById(
            "closePrivacy"
        );


    if (closePrivacy) {

        closePrivacy.addEventListener(
            "click",
            function () {

                if (privacyModal) {

                    privacyModal.classList.remove(
                        "show"
                    );

                }

            }
        );

    }



    // SUPPORT
    

    const supportLink =
        document.getElementById(
            "supportLink"
        );


    const supportModal =
        document.getElementById(
            "supportModal"
        );


    const closeSupport =
        document.getElementById(
            "closeSupport"
        );


    // OPEN SUPPORT

    if (
        supportLink &&
        supportModal
    ) {

        supportLink.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                supportModal.classList.add(
                    "show"
                );

            }
        );

    }


    // CLOSE SUPPORT

    if (closeSupport) {

        closeSupport.addEventListener(
            "click",
            function () {

                if (supportModal) {

                    supportModal.classList.remove(
                        "show"
                    );

                }

            }
        );

    }



    
    // CLOSE ALL MODALS BY CLICKING OUTSIDE


    const modals =
        document.querySelectorAll(
            ".policy-modal"
        );


    modals.forEach(function (modal) {

        modal.addEventListener(
            "click",
            function (event) {

                if (event.target === modal) {

                    modal.classList.remove(
                        "show"
                    );


                    resetRecoveryState();

                }

            }
        );

    });



    
    // ESCAPE KEY


    document.addEventListener(
        "keydown",
        function (event) {

            if (event.key === "Escape") {

                modals.forEach(function (modal) {

                    modal.classList.remove(
                        "show"
                    );

                });


                resetRecoveryState();

            }

        }
    );



    
    // MESSAGE FUNCTION
    

    function showMessage(
        message,
        type
    ) {

        const oldMessage =
            document.querySelector(
                ".form-message"
            );


        if (oldMessage) {

            oldMessage.remove();

        }


        const messageElement =
            document.createElement(
                "div"
            );


        messageElement.className =
            "form-message";


        messageElement.textContent =
            message;


        
        // SUCCESS MESSAGE
    

        if (type === "success") {

            messageElement.style.color =
                "#198754";


            messageElement.style.backgroundColor =
                "#d1e7dd";


            messageElement.style.border =
                "1px solid #badbcc";

        }


        
        // ERROR MESSAGE
        

        else {

            messageElement.style.color =
                "#842029";


            messageElement.style.backgroundColor =
                "#f8d7da";


            messageElement.style.border =
                "1px solid #f5c2c7";

        }


        messageElement.style.padding =
            "12px";


        messageElement.style.marginBottom =
            "15px";


        messageElement.style.borderRadius =
            "8px";


        messageElement.style.fontSize =
            "14px";


        
        // FIND ACTIVE FORM
        

        const activeForm =
            document.querySelector(
                "form"
            );


        if (activeForm) {

            activeForm.prepend(
                messageElement
            );

        }

    }



    
    // MODAL MESSAGE


    function setModalMessage(
        element,
        message,
        type
    ) {

        if (!element) {
            return;
        }


        element.textContent =
            message;


        element.style.padding =
            "10px";


        element.style.marginTop =
            "10px";


        element.style.borderRadius =
            "6px";


        
        // SUCCESS


        if (type === "success") {

            element.style.color =
                "#198754";


            element.style.backgroundColor =
                "#d1e7dd";


            element.style.border =
                "1px solid #badbcc";

        }


        
        // ERROR


        else {

            element.style.color =
                "#842029";


            element.style.backgroundColor =
                "#f8d7da";


            element.style.border =
                "1px solid #f5c2c7";

        }

    }



    
    // RESET PASSWORD MESSAGE
    

    function showResetMessage(
        message,
        type
    ) {

        const element =
            document.getElementById(
                "resetPasswordMessage"
            );


        setModalMessage(
            element,
            message,
            type
        );

    }

});




// LOGIN HISTORY



// SAVE LOGIN HISTORY


async function saveLoginHistory(
    name,
    username,
    role,
    status
) {

    const { error } =
        await sb.from("login_history").insert({
            name: name,
            username: username,
            role: role,
            status: status
        });

    if (error) {
        // Not fatal to the login flow either way — just log it so a
        // silent failure here doesn't go completely unnoticed.
        console.error("Could not save login history:", error.message);
    }

}