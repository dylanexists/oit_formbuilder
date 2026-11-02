document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const dismissButton = event.target.closest("[data-dismiss-notice]");
  if (!dismissButton) {
    return;
  }

  const notice = dismissButton.closest("[data-dismissible-notice]");
  if (notice) {
    notice.remove();
  }
});
