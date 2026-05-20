import { send, onMessage } from "./websocketClient.js";

const channel = new BroadcastChannel("team_channel");

// Helper to set image child in containers (both foreground and background logos)
function updateDisplayLogo(team, base64Data) {
    if (team === "blue") {
        setLogoContainer("team-logo-1", base64Data);
        setLogoContainer("team-logo-2", base64Data);
    } else if (team === "red") {
        setLogoContainer("team-logo-3", base64Data);
        setLogoContainer("team-logo-4", base64Data);
    }
}

function setLogoContainer(id, base64Data) {
    const container = document.getElementById(id);
    if (!container) return;

    container.innerHTML = "";
    if (base64Data) {
        const img = document.createElement("img");
        img.src = base64Data;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        container.appendChild(img);
    }
}

function clearDisplayLogos() {
    setLogoContainer("team-logo-1", null);
    setLogoContainer("team-logo-2", null);
    setLogoContainer("team-logo-3", null);
    setLogoContainer("team-logo-4", null);
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
// Using addEventListener so we do not override display.js's channel.onmessage handler
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
