const keyInput = document.getElementById("key");
const saveBtn = document.getElementById("save");
const errorEl = document.getElementById("error");

saveBtn.addEventListener("click", async () => {
  const key = keyInput.value.trim();
  if (!key) {
    errorEl.textContent = "Enter your API key first.";
    return;
  }
  saveBtn.disabled = true;
  errorEl.textContent = "";
  try {
    await window.darpanSetup.saveApiKey(key);
    // main.js starts the server, opens the bubble, and closes this window
    // once that succeeds — nothing further to do here.
  } catch (err) {
    errorEl.textContent = err?.message || "Something went wrong — try again.";
    saveBtn.disabled = false;
  }
});

keyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});
