import { send, onMessage } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");

// Off-screen canvas analysis to detect transparency and extract the most dominant color
function analyzeImage(base64Data, callback) {
    const img = new Image();
    img.src = base64Data;
    img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Scale down the image to 50x50 max for faster pixel iteration and analysis
        const maxDim = 50;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
            if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        try {
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;

            let transparentPixels = 0;
            const colorHistogram = {};
            const totalPixels = width * height;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                // Pixel is considered transparent if alpha is below 250
                if (a < 250) {
                    transparentPixels++;
                }

                // Gather colors for dominant color extraction if the pixel is mostly opaque
                if (a > 50) {
                    // Group similar colors using a bin size of 16 to cluster close shades
                    const binSize = 16;
                    const qr = Math.round(r / binSize) * binSize;
                    const qg = Math.round(g / binSize) * binSize;
                    const qb = Math.round(b / binSize) * binSize;
                    const key = `${qr},${qg},${qb}`;
                    colorHistogram[key] = (colorHistogram[key] || 0) + 1;
                }
            }

            // transparency threshold: > 2% of the image is transparent
            const hasTransparency = (transparentPixels / totalPixels) > 0.02;

            let dominantColor = null;
            let maxCount = 0;
            for (const key in colorHistogram) {
                if (colorHistogram[key] > maxCount) {
                    maxCount = colorHistogram[key];
                    dominantColor = key;
                }
            }

            callback({
                hasTransparency,
                dominantColor: dominantColor ? `rgb(${dominantColor})` : null
            });
        } catch (e) {
            console.error("Error analyzing image data:", e);
            callback({ hasTransparency: false, dominantColor: null });
        }
    };
    img.onerror = () => {
        callback({ hasTransparency: false, dominantColor: null });
    };
}

// Helper to set image child in containers (both foreground and background logos)
function updateDisplayLogo(team, base64Data) {
    if (team === "blue") {
        setLogoContainer("team-logo-1", base64Data, true); // foreground
        setLogoContainerByQuery('#logo-name-bg[data-team="blue"]', base64Data, false); // background
    } else if (team === "red") {
        setLogoContainer("team-logo-3", base64Data, true); // foreground
        setLogoContainerByQuery('#logo-name-bg[data-team="red"]', base64Data, false); // background
    }
}

function setLogoContainerByQuery(query, base64Data, processColor = false) {
    const container = document.querySelector(query);
    if (!container) return;

    container.innerHTML = "";
    container.style.backgroundColor = "transparent";

    // Setup alignment styles for logo containers (both foreground and background to center them)
    container.style.display = "flex";
    container.style.justifyContent = "center";
    container.style.alignItems = "center";
    container.style.overflow = "hidden";

    if (processColor) {
        container.style.padding = "5px";
        container.style.boxSizing = "border-box";
    } else {
        container.style.padding = "0";
    }

    if (base64Data) {
        const img = document.createElement("img");
        img.src = base64Data;

        if (processColor) {
            // Foreground logo: scale based on container width (width: 100%; height: auto)
            img.style.width = "100%";
            img.style.height = "auto";
            img.style.display = "block";

            // Asynchronously analyze transparency and extract dominant color
            analyzeImage(base64Data, (result) => {
                // Safeguard: Check if this image is still current before applying background
                const currentImg = container.querySelector("img");
                if (currentImg && currentImg.src === base64Data) {
                    if (result.hasTransparency && result.dominantColor) {
                        container.style.backgroundColor = result.dominantColor;
                    } else {
                        container.style.backgroundColor = "transparent";
                    }
                }
            });
        } else {
            // Background logo: scale to fill/fit container dimensions
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
        }

        container.appendChild(img);
    }
}

function setLogoContainer(id, base64Data, processColor = false) {
    setLogoContainerByQuery("#" + id, base64Data, processColor);
}

function clearDisplayLogos() {
    setLogoContainer("team-logo-1", null);
    setLogoContainerByQuery('#logo-name-bg[data-team="blue"]', null);
    setLogoContainer("team-logo-3", null);
    setLogoContainerByQuery('#logo-name-bg[data-team="red"]', null);
}

// Initialize on page load (runs on both controller and display pages)
function initLogos() {
    const blueLogo = localStorage.getItem("logo-blue");
    const redLogo = localStorage.getItem("logo-red");

    if (blueLogo) updateDisplayLogo("blue", blueLogo);
    if (redLogo) updateDisplayLogo("red", redLogo);

    // Controller Page Setup
    const logoUploads = document.querySelectorAll(".team-logo-upload");
    if (logoUploads.length > 0) {
        logoUploads.forEach(input => {
            input.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (!file) return;

                // Restrict to 2MB to prevent localStorage quota issues
                if (file.size > 2 * 1024 * 1024) {
                    alert("The uploaded image is too large. Please select an image smaller than 2MB.");
                    input.value = "";
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64Data = event.target.result;
                    const team = e.target.getAttribute("data-team"); // "blue" or "red"

                    // Save to localStorage
                    localStorage.setItem(`logo-${team}`, base64Data);

                    // Sync locally across tabs
                    channel.postMessage({ type: "logo-update", team, data: base64Data });

                    // Sync remotely via WebSocket
                    send({ type: "logo-update", team, data: base64Data });
                };
                reader.readAsDataURL(file);
            });
        });
    }

    const clearLogosBtn = document.getElementById("clear-logos");
    if (clearLogosBtn) {
        clearLogosBtn.addEventListener("click", () => {
            localStorage.removeItem("logo-blue");
            localStorage.removeItem("logo-red");

            // Reset inputs on the controller
            document.querySelectorAll(".team-logo-upload").forEach(input => {
                input.value = "";
            });

            // Sync clearing locally
            channel.postMessage({ type: "clear-logos" });

            // Sync clearing remotely
            send({ type: "clear-logos" });
        });
    }
}

// Register listeners for real-time synchronization
channel.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "logo-update") {
        updateDisplayLogo(msg.team, msg.data);
    } else if (msg.type === "clear-logos" || msg.type === "reset") {
        clearDisplayLogos();
    }
});

// WebSocket listener for remote sync
onMessage((data) => {
    if (data.type === "logo-update") {
        updateDisplayLogo(data.team, data.data);
    } else if (data.type === "clear-logos" || data.type === "reset") {
        clearDisplayLogos();
    }
});

// Storage listener for cross-tab sync when BroadcastChannel is not used
window.addEventListener("storage", (e) => {
    if (e.key === "logo-blue") {
        updateDisplayLogo("blue", e.newValue);
    } else if (e.key === "logo-red") {
        updateDisplayLogo("red", e.newValue);
    }
});

// Run initialization
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLogos);
} else {
    initLogos();
}
