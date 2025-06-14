let selectedSwapIndex = null;

for (let i = 1; i <= 10; i++) {
  const btn = document.getElementById(`swap-${i}`);
  if (!btn) continue;

  btn.addEventListener("click", () => {
    if (selectedSwapIndex === null) {
      // First click: mark index
      selectedSwapIndex = i;
      btn.classList.add("swap-selected"); // Optional highlight
    } else {
      // Second click: perform swap with current button i
      if (selectedSwapIndex !== i) {
        performHeroSwap(selectedSwapIndex, i);
      }

      // Clear selection and button highlights
      const prevBtn = document.getElementById(`swap-${selectedSwapIndex}`);
      if (prevBtn) prevBtn.classList.remove("swap-selected");
      selectedSwapIndex = null;
    }
  });
}

function performHeroSwap(indexA, indexB) {
  const inputA = document.getElementById(`pick-${indexA}`);
  const inputB = document.getElementById(`pick-${indexB}`);

  if (!inputA || !inputB) return;

  const heroA = inputA.value;
  const heroB = inputB.value;

  // Swap input values
  inputA.value = heroB;
  inputB.value = heroA;

  // Swap localStorage
  const storageKeyA = `heroPick-${indexA}`;
  const storageKeyB = `heroPick-${indexB}`;
  const tempStorage = localStorage.getItem(storageKeyA);
  localStorage.setItem(storageKeyA, localStorage.getItem(storageKeyB) || '');
  localStorage.setItem(storageKeyB, tempStorage || '');

  // Re-render hero portraits
//   updateHeroPick(indexA - 1, heroB, true);
//   updateHeroPick(indexB - 1, heroA, true);
}
