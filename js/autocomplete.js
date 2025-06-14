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

      const matches = heroes.filter(h => h.name.toLowerCase().startsWith(query));
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
          input.value = hero.name;
          dropdown.innerHTML = "";
          dropdown.style.display = "none";
          localStorage.setItem(`${localStorageKeyPrefix}-${i}`, hero.name);
          onSelect(i, hero.name);
        });

        dropdown.appendChild(option);
      });

      dropdown.style.display = "block";

      // Highlight the first option by default
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
  updateHeroPick(i - 1, name);
});

setupHeroDropdown("ban", "dropdown-ban", 10, "banPick", (i, name) => {
  updateBanPick(i - 1, name);
});
