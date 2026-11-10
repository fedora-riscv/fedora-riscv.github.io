// Runs before first paint: apply the saved light/dark choice.
try { var t = localStorage.getItem("fvf-theme"); if (t === "dark" || t === "light") document.documentElement.dataset.theme = t } catch (e) {}
