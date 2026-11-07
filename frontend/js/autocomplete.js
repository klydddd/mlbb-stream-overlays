import { heroes, updateBanPick, updateHeroPick } from "./hero.js";
import { send } from "./websocketClient.js";
import { heroIsTaken, rejectTakenHero } from "./draftGuard.js";

function setupHeroDropdown(inputPrefix, dropdownPrefix, count, localStorageKeyPrefix, onSelect) {
  for (let i = 1; i <= count; i++) {
    const input = document.getElementById(`${inputPrefix}-${i}`);
    const dropdown = document.getElementById(`${dropdownPrefix}-${i}`);

    if (!input || !dropdown) continue;

    let currentFocus = -1;
    let currentMatches = [];

    input.addEventListener("input", () => {
      const query = input.value.toLowerCase().trim();
      dropdown.innerHTML = "";
      currentMatches = [];

      if (!query) {
        dropdown.style.display = "none";
        currentFocus = -1;
        return;
      }

      // Heroes already picked or banned in another slot are not suggested
      const slotKey = `${localStorageKeyPrefix}-${i}`;
      const matches = heroes.filter(h => h.name.toLowerCase().startsWith(query) && !heroIsTaken(h.name, slotKey));
      currentMatches = matches;

      if (matches.length === 0) {
        dropdown.style.display = "none";
        currentFocus = -1;
        return;
      }

      matches.forEach((hero, index) => {
        const option = document.createElement("div");
        option.className = "dropdown-option";
        option.textContent = hero.name;

        option.addEventListener("mousedown", () => {
          // The list can be stale if another slot took this hero after it was shown
          if (heroIsTaken(hero.name, `${localStorageKeyPrefix}-${i}`)) {
            dropdown.innerHTML = "";
            dropdown.style.display = "none";
            rejectTakenHero(input, `${localStorageKeyPrefix}-${i}`, hero.name);
            return;
          }
          input.value = hero.name;
          dropdown.innerHTML = "";
          dropdown.style.display = "none";
          localStorage.setItem(`${localStorageKeyPrefix}-${i}`, hero.name);

          if (localStorageKeyPrefix === 'heroPick') {
            send({ heroPick: { index: i, name: hero.name } });
          } else if (localStorageKeyPrefix === 'banPick') {
            send({ banPick: { index: i, name: hero.name } });
          }

          onSelect(i, hero.name);
        });

        dropdown.appendChild(option);
      });

      dropdown.style.display = "block";
      currentFocus = 0;
      setActive(dropdown.querySelectorAll(".dropdown-option"), currentFocus);
    });

    input.addEventListener("keydown", (e) => {
      const items = dropdown.querySelectorAll(".dropdown-option");
      if (!items.length) return;

      if (e.key === "ArrowDown") {
        currentFocus = (currentFocus + 1) % items.length;
        setActive(items, currentFocus);
        e.preventDefault();
      }

      if (e.key === "ArrowUp") {
        currentFocus = (currentFocus - 1 + items.length) % items.length;
        setActive(items, currentFocus);
        e.preventDefault();
      }

      if (e.key === "Enter") {
        if (currentFocus >= 0 && currentFocus < items.length) {
          items[currentFocus].dispatchEvent(new Event("mousedown"));
          e.preventDefault();
        }
      }
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        dropdown.style.display = "none";
      }, 150);
    });

    function setActive(options, index) {
      options.forEach(opt => opt.classList.remove("active"));
      if (options[index]) {
        options[index].classList.add("active");
      }
    }
  }
}

setupHeroDropdown("pick", "dropdown", 10, "heroPick", (i, name) => {
  updateHeroPick(i - 1, name, false);
});

setupHeroDropdown("ban", "dropdown-ban", 10, "banPick", (i, name) => {
  updateBanPick(i - 1, name);
});
