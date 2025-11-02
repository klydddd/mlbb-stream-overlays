# 🎮 MLBB Stream Overlay  

An **OBS browser source controller** built for **Mobile Legends: Bang Bang** tournaments and livestreams.  
This project provides an intuitive way for streamers and tournament hosts to **control team logos, names, scores, and overlays in real time** — all within a browser interface.  

---

## 🧩 Features  

- 🎯 **Live Overlay Updates** — Instantly update team names, scores, and visuals on stream.  
- 🖱️ **Drag-and-Drop Overlay Editing** — Easily position assets and elements for custom layouts.  
- ⚡ **Real-Time Scoreboard** — Reflects match progress dynamically without restarting sources.  
- 🔗 **One-Click Copy Link System** — Quickly share or access the overlay controller.  
- 📷 **Upcoming Feature:** Integrated camera setup support for caster and player cams.  

---

## 🛠️ Tech Stack  

| Technology | Purpose |
|-------------|----------|
| **HTML** | Structure and layout |
| **CSS** | Modern, responsive design |
| **JavaScript** | Interactivity and overlay control |

---

## 🚀 How to Use  

Follow these steps to integrate the **MLBB Overlay System** into OBS:  

### 🧭 OBS Setup Guide  

1. **Create a scene** in OBS named `Scene`.  
2. Go to **Tools > WebSocket Server Settings**  
   - ✅ Check **Enable WebSocket Server**  
   - ❌ Turn off **Authentication**  
3. Navigate to **Docks > Custom Browser Docks**  
   - Paste this URL into the *URL* field:  
     ```
     https://mlbb-stream-overlays.vercel.app/controller.html
     ```
4. Open the dock and click **"SHOW DISPLAY"** in the controller.  
5. In your **Draft Overlay Source**:  
   - ✅ Enable **Control Audio via OBS**  
   - ✅ Enable **Use Custom Frame Rate (60 FPS)**  
   - In **Custom CSS**, remove any existing code and **paste the following clean CSS**:  
     *(Your custom overlay CSS here — remove bloat code before pasting)*  

Once done, your overlay and controller are now linked!  
Any changes in the controller will automatically reflect in your live OBS scene.  

---

## 🧠 Developer Notes  

This project is still in **active development** — upcoming features include:  
- Integrated **camera setups**  
- Team logo and player data saving  
- Better **websocket synchronization** for large tournaments  

---

## 👤 Author  

**Developed by:** *klyduuu*  
> Built from scratch with HTML, CSS, and JavaScript for use in MLBB tournaments and esports productions.

---

## 🏗️ Project Status  

🔧 **Current Phase:** Stable MVP (Minimum Viable Product)  
🧩 **Next Phase:** Advanced overlay customization and camera system integration  

---

### 📜 License  
This project is open for educational and event use. Attribution is appreciated if used in tournaments or public broadcasts.

---

