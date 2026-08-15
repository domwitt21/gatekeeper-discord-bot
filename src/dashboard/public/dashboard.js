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
