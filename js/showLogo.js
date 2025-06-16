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

      // Define target IDs for each team
      const targetIds = team === 'blue'
        ? ['team-logo-1', 'team-logo-2']
        : ['team-logo-3', 'team-logo-4'];

      targetIds.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
          container.innerHTML = `<img src="${data}" style="width: 100%; height: 100%; object-fit: cover;">`;
        }
      });
    });
  }
})();
