(() => {
  const page = document.body.dataset.page;
  const channel = new BroadcastChannel('teamLogoChannel');

  if (page === 'controller') {
    window.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.team-logo-upload').forEach(input => {
        const team = input.dataset.team;
        input.addEventListener('change', event => {
          const file = event.target.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = e => {
            channel.postMessage({ type: `set-${team}-logo`, data: e.target.result });
          };
          reader.readAsDataURL(file);
        });
      });
    });
  }

  if (page === 'index') {
    channel.addEventListener('message', event => {
      const { type, data } = event.data;
      const match = type.match(/^set-(blue|red)-logo$/);
      if (!match) return;

      const team = match[1];

      // Get all potential containers for this team logo
      const containers = [
        document.querySelector(`.team-logo[data-team="${team}"]`),
        document.getElementById(`${team}-team-logo`)
      ];

      containers.forEach(container => {
        if (container) {
          container.innerHTML = `<img src="${data}" style="width: 100%; height: 100%; object-fit: cover;">`;
        }
      });
    });
  }
})();
