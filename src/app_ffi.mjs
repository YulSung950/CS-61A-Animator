/** One-shot window Escape listener for dismissing the canvas error overlay. */
export function listenEscape(callback) {
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") callback();
  });
}
