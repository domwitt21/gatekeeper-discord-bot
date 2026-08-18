const bindings = [
    ["messageTitle", "previewTitle", "textContent"],
    ["messageDescription", "previewDescription", "textContent"],
    ["buttonLabel", "previewButton", "button"]
];

for (const [inputId, previewId, mode] of bindings) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) continue;
    input.addEventListener("input", () => {
        if (mode === "button") preview.textContent = `✓ ${input.value || "Verify"}`;
        else preview.textContent = input.value;
    });
}

const color = document.getElementById("messageColor");
const embed = document.getElementById("previewEmbed");
if (color && embed) color.addEventListener("input", () => { embed.style.borderColor = color.value; });

const toggle = document.querySelector('.toggle input[name="verificationEnabled"]');
const toggleLabel = document.querySelector(".toggle b");
const previewButton = document.getElementById("previewButton");
if (toggle) toggle.addEventListener("change", () => {
    if (toggleLabel) toggleLabel.textContent = toggle.checked ? "Enabled" : "Disabled";
    if (previewButton) previewButton.disabled = !toggle.checked;
});

const menuButton = document.getElementById("dashboardMenuButton");
const tabList = document.getElementById("dashboardTabs");
const tabButtons = Array.from(document.querySelectorAll("[data-dashboard-tab]"));
const tabPanels = Array.from(document.querySelectorAll("[data-dashboard-panel]"));
const hashTabs = { overview: "overview", configuration: "settings", reports: "settings", message: "settings",
    reverification: "reverification", onboarding: "onboarding", policies: "policies", moderation: "moderation", analytics: "analytics", activity: "activity" };

function setMenu(open) {
    if (!menuButton || !tabList) return;
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.querySelector("em").textContent = open ? "CLOSE" : "OPEN";
    tabList.hidden = !open;
}

function showDashboardTab(name, options = {}) {
    if (!tabButtons.some(button => button.dataset.dashboardTab === name)) name = "overview";
    for (const panel of tabPanels) panel.hidden = panel.dataset.dashboardPanel !== name;
    for (const button of tabButtons) {
        const active = button.dataset.dashboardTab === name;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
    }
    try { window.sessionStorage.setItem("gatekeeper-dashboard-tab", name); } catch {}
    if (options.updateHash) window.history.replaceState(null, "", `#${name}`);
    if (options.focusPanel) document.querySelector(`[data-dashboard-panel="${name}"]`)?.focus({ preventScroll: true });
}

if (menuButton && tabList && tabPanels.length) {
    for (const panel of tabPanels) panel.tabIndex = -1;
    const hashName = hashTabs[window.location.hash.slice(1)];
    let storedName;
    try { storedName = window.sessionStorage.getItem("gatekeeper-dashboard-tab"); } catch {}
    showDashboardTab(hashName || storedName || "overview");
    menuButton.addEventListener("click", () => setMenu(menuButton.getAttribute("aria-expanded") !== "true"));
    menuButton.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setMenu(true);
            tabButtons.find(button => button.classList.contains("active"))?.focus();
        }
    });
    tabList.addEventListener("keydown", event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "Escape") { setMenu(false); menuButton.focus(); return; }
        const current = Math.max(0, tabButtons.indexOf(document.activeElement));
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabButtons.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + tabButtons.length) % tabButtons.length;
        tabButtons[next].focus();
    });
    for (const button of tabButtons) button.addEventListener("click", () => {
        showDashboardTab(button.dataset.dashboardTab, { updateHash: true, focusPanel: true });
        setMenu(false);
    });
    window.addEventListener("hashchange", () => showDashboardTab(hashTabs[window.location.hash.slice(1)] || "overview"));
    document.addEventListener("click", event => {
        if (!event.target.closest(".dashboard-menu")) setMenu(false);
    });
}

const wizard = document.getElementById("setupWizard");
if (wizard) {
    const steps = Array.from(wizard.querySelectorAll("[data-wizard-step]"));
    const progress = Array.from(document.querySelectorAll(".wizard-progress li"));
    const back = document.getElementById("wizardBack");
    const next = document.getElementById("wizardNext");
    const launch = document.getElementById("wizardLaunch");
    const number = document.getElementById("wizardStepNumber");
    const channel = document.getElementById("wizardVerifyChannel");
    const role = document.getElementById("wizardVerifiedRole");
    let current = 0;

    const selectedText = select => select?.options[select.selectedIndex]?.textContent?.trim() || "Not selected";
    function updateReview() {
        document.getElementById("wizardChannelReview").textContent = selectedText(channel);
        document.getElementById("wizardRoleReview").textContent = selectedText(role);
        document.getElementById("wizardPresetReview").textContent = wizard.querySelector('input[name="verificationPreset"]:checked')?.value || "STANDARD";
    }
    function showStep(index) {
        current = Math.min(Math.max(index, 0), steps.length - 1);
        steps.forEach((step, stepIndex) => { step.hidden = stepIndex !== current; step.classList.toggle("active", stepIndex === current); });
        progress.forEach((item, stepIndex) => item.classList.toggle("active", stepIndex <= current));
        back.hidden = current === 0;
        next.hidden = current === steps.length - 1;
        launch.hidden = current !== steps.length - 1;
        number.textContent = String(current + 1);
        if (current === steps.length - 1) updateReview();
        steps[current].querySelector("h2")?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    next.addEventListener("click", () => {
        if (current === 1 && (!channel.reportValidity() || !role.reportValidity())) return;
        showStep(current + 1);
    });
    back.addEventListener("click", () => showStep(current - 1));
    wizard.addEventListener("keydown", event => {
        if (event.key === "Enter" && event.target.tagName !== "TEXTAREA" && current < steps.length - 1) {
            event.preventDefault();
            next.click();
        }
    });
    showStep(0);
}

const onboardingPreviewBindings = [
    ["onboardingWelcomeTitle", "onboardingPreviewTitle"],
    ["onboardingWelcomeMessage", "onboardingPreviewMessage"],
    ["onboardingRulesText", "onboardingPreviewRules"]
];
for (const [inputId, previewId] of onboardingPreviewBindings) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (input && preview) input.addEventListener("input", () => { preview.textContent = input.value; });
}

const settingsForm = document.getElementById("configuration");
const reportFrequency = settingsForm?.querySelector('select[name="reportFrequency"]');
if (reportFrequency && !reportFrequency.querySelector('option[value="MONTHLY"]')) {
    const monthly = new Option("Monthly", "MONTHLY", false, settingsForm.dataset.reportFrequency === "MONTHLY");
    reportFrequency.add(monthly);
}
if (reportFrequency && !settingsForm.querySelector('input[name="dataRetentionDays"]')) {
    const label = document.createElement("label");
    label.textContent = "Data retention (days)";
    const input = document.createElement("input");
    input.type = "number"; input.name = "dataRetentionDays"; input.min = "0"; input.max = "3650";
    input.value = settingsForm.dataset.retentionDays || "0";
    const help = document.createElement("small"); help.textContent = "0 retains security history indefinitely.";
    label.append(input, help);
    reportFrequency.closest(".form-grid")?.append(label);
}

for (const link of document.querySelectorAll('.export-actions a[href*="analytics.csv"], .export-actions a[href*="security-report.pdf"]')) {
    link.addEventListener("click", () => {
        const toolbar = link.closest(".analytics-toolbar");
        const start = toolbar?.querySelector('input[name="start"]')?.value;
        const end = toolbar?.querySelector('input[name="end"]')?.value;
        const url = new URL(link.href);
        if (start && end) { url.searchParams.set("start", start); url.searchParams.set("end", end); }
        link.href = url.toString();
    });
}
