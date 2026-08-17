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
    reverification: "reverification", policies: "policies", moderation: "moderation", activity: "activity" };

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
