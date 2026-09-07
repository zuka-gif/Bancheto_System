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

        signupForm.addEventListener("submit", function (event) {

            event.preventDefault();


            const inputs =
                signupForm.querySelectorAll("input");


            const fullname =
                inputs[0].value.trim();


            const username =
                inputs[1].value.trim();


            const emailOrPhone =
                inputs[2].value.trim();


            const password =
                inputs[3].value;


            const confirmPassword =
                inputs[4].value;


            const roleSelect =
                signupForm.querySelector("select");


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
            

            if (password.length < 6) {

                showMessage(
                    "Password must contain at least 6 characters.",
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


            
            // GET USERS
           

            let users =
                JSON.parse(
                    localStorage.getItem("banchetoUsers")
                ) || [];


            
            // DUPLICATE USERNAME
            

            const existingUsername =
                users.find(function (user) {

                    return (
                        user.username &&
                        user.username.toLowerCase() ===
                        username.toLowerCase()
                    );

                });


            if (existingUsername) {

                showMessage(
                    "Username is already registered.",
                    "error"
                );

                return;
            }


            
            // DUPLICATE EMAIL / PHONE
            

            const existingContact =
                users.find(function (user) {

                    return (
                        user.emailOrPhone &&
                        user.emailOrPhone.toLowerCase() ===
                        emailOrPhone.toLowerCase()
                    );

                });


            if (existingContact) {

                showMessage(
                    "Email or phone number is already registered.",
                    "error"
                );

                return;
            }


            
            // CREATE USER
            

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


            users.push(newUser);


            localStorage.setItem(
                "banchetoUsers",
                JSON.stringify(users)
            );


            showMessage(
                "Account created successfully! Redirecting to Sign In...",
                "success"
            );


            setTimeout(function () {

                window.location.href =
                    "../Log_In/SignIn.html";

            }, 1500);

        });

    }



    
    // SIGN IN


    const signinForm =
        document.getElementById("signinForm");


    if (signinForm) {

        signinForm.addEventListener("submit", function (event) {

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


            
            // GET USERS


            const users =
                JSON.parse(
                    localStorage.getItem("banchetoUsers")
                ) || [];


            
            // FIND ACCOUNT


            const user =
                users.find(function (account) {

                    return (
                        account.emailOrPhone &&
                        account.emailOrPhone.toLowerCase() ===
                        emailOrPhone.toLowerCase() &&
                        account.password === password
                    );

                });



            // FAILED LOGIN


            if (!user) {

                saveLoginHistory(
                    "Unknown User",
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


            
            // UPDATE ACTIVITY
            

            const now =
                Date.now();


            user.lastLogin =
                now;


            user.lastActivity =
                now;


            localStorage.setItem(
                "banchetoUsers",
                JSON.stringify(users)
            );


            
            // LOGIN SESSION
            

            const loginSession = {

                id: user.id,

                fullname: user.fullname,

                username: user.username,

                emailOrPhone: user.emailOrPhone,

                role: user.role,

                lastLogin: user.lastLogin,

                lastActivity: user.lastActivity

            };


            
            // REMEMBER ME
            

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


            
            // LOGIN HISTORY
            

            saveLoginHistory(
                user.fullname,
                user.username,
                user.role,
                "Successful"
            );


            
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


    let accountToReset =
        null;



    
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
            function (event) {

                event.preventDefault();


                const contactInput =
                    document.getElementById(
                        "forgotContact"
                    );


                const message =
                    document.getElementById(
                        "forgotPasswordMessage"
                    );


                const contact =
                    contactInput
                        ? contactInput.value.trim()
                        : "";


                
                // VALIDATE CONTACT
                

                if (!contact) {

                    setModalMessage(
                        message,
                        "Please enter your email or phone number.",
                        "error"
                    );

                    return;
                }


                
                // GET USERS
            

                const users =
                    JSON.parse(
                        localStorage.getItem("banchetoUsers")
                    ) || [];


                
                // FIND USER
                

                const user =
                    users.find(function (account) {

                        return (
                            account.emailOrPhone &&
                            account.emailOrPhone.toLowerCase() ===
                            contact.toLowerCase()
                        );

                    });


                
                // USER NOT FOUND
                

                if (!user) {

                    setModalMessage(
                        message,
                        "No account was found with that email or phone number.",
                        "error"
                    );

                    return;
                }


                
                // SAVE ACCOUNT
                

                accountToReset =
                    user;


                setModalMessage(
                    message,
                    "Account found! You can now create a new password.",
                    "success"
                );


                
                // OPEN RESET PASSWORD
                

                setTimeout(function () {

                    forgotPasswordModal.classList.remove(
                        "show"
                    );


                    const resetModal =
                        document.getElementById(
                            "resetPasswordModal"
                        );


                    if (resetModal) {

                        resetModal.classList.add(
                            "show"
                        );

                    }

                }, 700);

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
            function (event) {

                event.preventDefault();


                
                // CHECK ACCOUNT
                

                if (!accountToReset) {

                    showResetMessage(
                        "No account was selected.",
                        "error"
                    );

                    return;
                }


                
                // GET PASSWORDS
            

                const newPassword =
                    document.getElementById(
                        "newPassword"
                    ).value;


                const confirmNewPassword =
                    document.getElementById(
                        "confirmNewPassword"
                    ).value;


                
                // PASSWORD LENGTH


                if (newPassword.length < 6) {

                    showResetMessage(
                        "Password must contain at least 6 characters.",
                        "error"
                    );

                    return;
                }


                
                // PASSWORD MATCH
                

                if (
                    newPassword !==
                    confirmNewPassword
                ) {

                    showResetMessage(
                        "Passwords do not match.",
                        "error"
                    );

                    return;
                }


                
                // GET USERS
                

                let users =
                    JSON.parse(
                        localStorage.getItem("banchetoUsers")
                    ) || [];


                
                // FIND ACCOUNT
                

                const userIndex =
                    users.findIndex(function (user) {

                        return (
                            user.id ===
                            accountToReset.id
                        );

                    });


                if (userIndex === -1) {

                    showResetMessage(
                        "Account could not be found.",
                        "error"
                    );

                    return;
                }


                
                // UPDATE PASSWORD
                

                users[userIndex].password =
                    newPassword;


                
                // SAVE USERS
            

                localStorage.setItem(
                    "banchetoUsers",
                    JSON.stringify(users)
                );


                
                // SUCCESS


                showResetMessage(
                    "Password reset successfully! Redirecting to Sign In...",
                    "success"
                );


                accountToReset =
                    null;


                
                // REDIRECT


                setTimeout(function () {

                    if (resetPasswordModal) {

                        resetPasswordModal.classList.remove(
                            "show"
                        );

                    }


                    window.location.href =
                        "../Log_In/SignIn.html";

                }, 1500);

            }
        );

    }




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


                accountToReset =
                    null;

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


                    accountToReset =
                        null;

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


                accountToReset =
                    null;

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


function saveLoginHistory(
    name,
    username,
    role,
    status
) {

    let history =
        JSON.parse(
            localStorage.getItem("loginHistory")
        ) || [];


    const now =
        new Date();


    history.unshift({

        name: name,

        username: username,

        role: role,

        date: now.toLocaleDateString(
            "en-US",
            {
                month: "long",
                day: "numeric",
                year: "numeric"
            }
        ),

        time: now.toLocaleTimeString(
            "en-US",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        ),

        status: status

    });


    localStorage.setItem(
        "loginHistory",
        JSON.stringify(history)
    );

}
