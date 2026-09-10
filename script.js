const triggers = document.querySelectorAll(".card-trigger");

triggers.forEach((button) => {
  button.addEventListener("click", () => {
    const detail = document.getElementById(button.getAttribute("aria-controls"));
    const open = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!open));
    detail.hidden = open;
    const icon = button.querySelector(".card-more span");
    icon.textContent = open ? "+" : "−";
  });
});

const motionToggle = document.getElementById("motionToggle");
motionToggle.addEventListener("click", () => {
  const reduced = document.body.classList.toggle("reduce-motion");
  motionToggle.setAttribute("aria-pressed", String(reduced));
  motionToggle.textContent = reduced ? "움직임 켜기" : "움직임 줄이기";
});
