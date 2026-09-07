function showReport(report, button) {

    // Hide both reports
    document.getElementById("sales").style.display = "none";
    document.getElementById("inventory").style.display = "none";

    // Show selected report
    document.getElementById(report).style.display = "block";

    // Remove active from both buttons
    document.querySelectorAll(".report-tab").forEach(tab => {
        tab.classList.remove("active");
    });

    // Make clicked button active
    button.classList.add("active");
}