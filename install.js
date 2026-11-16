const button = document.getElementById("install-app");
const dialog = document.getElementById("install-dialog");
const standalone = window.matchMedia("(display-mode: standalone)");
let installPrompt = null;

function updateButton() {
  button.hidden = standalone.matches || navigator.standalone === true;
}
updateButton();
standalone.addEventListener("change", updateButton);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  button.hidden = true;
  dialog.close();
});

button.addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") button.hidden = true;
      return;
    } catch {
      // Browsers can withdraw an install prompt; keep the manual route available.
    }
  }
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  document.getElementById("install-instructions").textContent = ios
    ? "브라우저의 공유 버튼(↑)을 누른 뒤 ‘홈 화면에 추가’를 선택하세요. 항목이 보이지 않으면 Safari에서 이 페이지를 열어 주세요."
    : "브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요. 컴퓨터에서는 주소창의 설치 아이콘도 사용할 수 있습니다. 설치 항목이 없다면 Chrome이나 Edge에서 열어 주세요.";
  dialog.showModal();
});
document
  .getElementById("install-close")
  .addEventListener("click", () => dialog.close());

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Manual home-screen instructions remain available if registration fails.
  });
}
