<p align="center">
  <img src="https://img.shields.io/badge/MLBB-Stream%20Overlay-blue?style=for-the-badge&logo=obs-studio" alt="MLBB Stream Overlay">
  <img src="https://img.shields.io/badge/Status-Active%20Development-green?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/License-Open%20Source-orange?style=for-the-badge" alt="License">
</p>

<h1 align="center">🎮 MLBB Stream Overlay System</h1>

<p align="center">
  <strong>A professional-grade OBS browser source overlay system built for Mobile Legends: Bang Bang tournaments and esports productions.</strong>
</p>

<p align="center">
  <a href="https://mlbb-stream-overlays.vercel.app/">🌐 Live Demo</a> •
  <a href="#-quick-start">📖 Quick Start</a> •
  <a href="#-features">✨ Features</a> •
  <a href="#-obs-setup-guide">🔧 OBS Setup</a>
</p>

---

## 📸 Preview

The MLBB Stream Overlay System provides a complete drafting interface for tournament broadcasts, featuring:

- **Professional Draft Display** — Clean, broadcast-ready hero pick/ban visualization
- **Real-time Controller** — Intuitive interface for managing all overlay elements
- **Team Branding** — Custom team logos, names, and player information

---

## ✨ Features

### 🎯 Core Functionality
| Feature | Description |
|---------|-------------|
| **Live Overlay Updates** | Instantly update team names, scores, and visuals during the stream |
| **Hero Pick/Ban System** | Complete 10-hero draft system with autocomplete for 130+ MLBB heroes |
| **Real-Time Scoreboard** | Dynamic score tracking with visual indicators (Best of 3/5 support) |
| **Team Logo Upload** | Custom logo upload for both teams with instant preview |
| **Player IGN Display** | Individual player name/IGN display for each position |

### 🔊 Immersive Audio
| Feature | Description |
|---------|-------------|
| **Hero Voicelines** | Authentic hero voicelines play when heroes are picked (130+ audio files) |
| **Draft Atmosphere** | Audio feedback enhances the broadcast experience |

### ⏱️ Draft Management
| Feature | Description |
|---------|-------------|
| **Phase Timer** | Configurable countdown timer for pick/ban phases |
| **14-Phase Draft System** | Standard professional MLBB draft format |
| **Progress Indicator** | Visual draft phase progress tracking |
| **Match Information** | Customizable game number, match number, and round name |

### 🛠️ Broadcast Controls
| Feature | Description |
|---------|-------------|
| **Switch Teams** | Instantly swap team positions (Blue ↔ Red) |
| **Reset Draft** | One-click draft reset for new games |
| **Clear Functions** | Granular clearing of names, picks, bans, scores, logos, and camera links |
| **OBS WebSocket Integration** | Direct integration with OBS for source management |

### 🎨 Design & Customization
| Feature | Description |
|---------|-------------|
| **Role Icons** | Position indicators (EXP, GOLD, JG, MID, ROAM) |
| **Responsive Layout** | Optimized for 1920x1080 broadcast resolution |
| **Modern UI** | Clean, professional aesthetic with smooth animations |

---

## 🚀 Quick Start

### Option 1: Use Hosted Version (Recommended)

1. **Copy the Controller Link**
   ```
   https://mlbb-stream-overlays.vercel.app/controller.html
   ```

2. **Copy the Display Link**
   ```
   https://mlbb-stream-overlays.vercel.app/display.html
   ```

3. Follow the [OBS Setup Guide](#-obs-setup-guide) below

### Option 2: Run Locally

1. **Clone the Repository**
   ```bash
   git clone https://github.com/klyduuu/mlbb-stream-overlays.git
   cd mlbb-stream-overlays
   ```

2. **Start a Local Server**
   ```bash
   # Using Python
   python -m http.server 8080
   
   # Or using Node.js (http-server)
   npx http-server -p 8080
   
   # Or using VS Code Live Server extension
   ```

3. **Access the Application**
   - Controller: `http://localhost:8080/controller.html`
   - Display: `http://localhost:8080/display.html`

---

## 🔧 OBS Setup Guide

### Prerequisites
- OBS Studio (v28+ recommended)
- OBS WebSocket Server enabled

### Step-by-Step Configuration

#### 1️⃣ Enable WebSocket Server
1. Open OBS Studio
2. Go to **Tools → WebSocket Server Settings**
3. ✅ Check **Enable WebSocket Server**
4. ❌ Disable **Enable Authentication** (for easier setup)
5. Note the port (default: `4455`)

#### 2️⃣ Add Controller as Custom Browser Dock
1. Go to **Docks → Custom Browser Docks**
2. Create a new dock:
   - **Dock Name:** `MLBB Controller`
   - **URL:** `https://mlbb-stream-overlays.vercel.app/controller.html`
3. Click **Apply**

#### 3️⃣ Add Display as Browser Source
1. In your scene, add a new **Browser Source**
2. Configure settings:
   - **URL:** `https://mlbb-stream-overlays.vercel.app/display.html`
   - **Width:** `1920`
   - **Height:** `1080`
   - ✅ **Control audio via OBS**
   - ✅ **Use custom frame rate:** `60`
3. Click **OK**

#### 4️⃣ Quick Setup (One-Click)
Alternatively, use the **"SHOW DISPLAY"** button in the controller to automatically create the browser source in OBS (requires WebSocket connection).

---

## 📁 Project Structure

```
mlbb-stream-overlays/
├── 📄 index.html          # Landing page with quick copy link
├── 📄 controller.html     # Main control panel for operators
├── 📄 display.html        # Broadcast display overlay
├── 📄 gameController.html # Game-specific controller (WIP)
├── 📄 gameDisplay.html    # Game-specific display (WIP)
│
├── 📁 css/
│   ├── controller.css     # Controller panel styling
│   ├── display.css        # Overlay display styling
│   ├── default.css        # Default theme
│   └── animation.css      # Animation definitions
│
├── 📁 js/
│   ├── control.js         # Main controller logic
│   ├── display.js         # Display update handlers
│   ├── hero.js            # Hero data and pick/ban logic
│   ├── autocomplete.js    # Hero search autocomplete
│   ├── timer.js           # Draft timer (controller)
│   ├── displayTimer.js    # Draft timer (display)
│   ├── activePick.js      # Active pick highlighting
│   ├── swap.js            # Position swapping logic
│   ├── switchSides.js     # Team side switching
│   ├── showLogo.js        # Logo upload handling
│   ├── clear.js           # Clear/reset functions
│   └── obsWebsocket/
│       └── showDisplay.js # OBS WebSocket integration
│
└── 📁 Assets/
    ├── 📁 HeroPick/       # 130+ hero portrait images
    ├── 📁 Voicelines/     # 130+ hero voiceline audio files
    ├── 📁 defaults/       # Default role icons (EXP, GOLD, JG, MID, ROAM)
    └── 📁 gameProper/     # In-game assets (WIP)
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **HTML5** | Structure and semantic markup |
| **CSS3** | Modern styling with custom properties and animations |
| **JavaScript (ES6+)** | Modular application logic |
| **BroadcastChannel API** | Cross-tab communication between controller and display |
| **LocalStorage** | Persistent data storage for draft state |
| **OBS WebSocket** | Direct OBS Studio integration |

---

## 🎮 How It Works

### Communication Flow
```
┌─────────────────┐     BroadcastChannel     ┌─────────────────┐
│   Controller    │ ◄──────────────────────► │    Display      │
│  (controller.   │     + LocalStorage       │  (display.html) │
│     html)       │                          │                 │
└────────┬────────┘                          └────────┬────────┘
         │                                            │
         │ OBS WebSocket                              │ Browser Source
         ▼                                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        OBS Studio                                │
└─────────────────────────────────────────────────────────────────┘
```

1. **Operator** uses the Controller panel to manage draft
2. **Controller** updates localStorage and broadcasts messages
3. **Display** listens for changes and updates the overlay in real-time
4. **OBS** captures the display as a browser source for the stream

---

## 🚧 Roadmap

### Current Phase: ✅ Stable MVP
- [x] Complete draft pick/ban system
- [x] Hero voicelines integration
- [x] Team logo and name management
- [x] Real-time synchronization
- [x] OBS WebSocket integration
- [x] Timer system

### Next Phase: 🔄 In Development
- [ ] Advanced overlay customization/themes
- [ ] Camera system integration (player/caster cams)
- [ ] Team/player data presets (save & load)
- [ ] Multiple tournament format support
- [ ] Improved WebSocket sync for network tournaments
- [ ] In-game overlay (game stats, gold diff, objectives)

### Future Plans
- [ ] Admin dashboard for tournament management
- [ ] Multiple overlay style templates
- [ ] Integration with MLBB statistics APIs
- [ ] Mobile-friendly controller

---

## 🤝 Contributing

Contributions are welcome! If you'd like to contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 👤 Author

**Developed by:** [klyduuu](https://github.com/klyduuu)

> Built from scratch with HTML, CSS, and JavaScript for use in MLBB tournaments and esports productions.

---

## 📜 License

This project is open for educational and event use. Attribution is appreciated if used in tournaments or public broadcasts.

---

<p align="center">
  <strong>⭐ Star this repository if you find it useful! ⭐</strong>
</p>

<p align="center">
  Made with ❤️ for the MLBB Esports Community
</p>
