const triggers = document.querySelectorAll('.card-trigger');

triggers.forEach((button) => {
  button.addEventListener('click', () => {
    const detailId = button.getAttribute('aria-controls');
    const detail = detailId ? document.getElementById(detailId) : null;
    if (!detail) return;

    const isOpen = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!isOpen));
    detail.hidden = isOpen;

    const icon = button.querySelector('.card-more span');
    if (icon) icon.textContent = isOpen ? '+' : '−';
  });
});

const motionToggle = document.getElementById('motionToggle');
if (motionToggle) {
  motionToggle.addEventListener('click', () => {
    const reduced = document.body.classList.toggle('reduce-motion');
    motionToggle.setAttribute('aria-pressed', String(reduced));
    motionToggle.textContent = reduced ? '움직임 켜기' : '움직임 줄이기';
  });
}
