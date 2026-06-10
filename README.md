# FX-AI Broadcaster 📈🎙️
> Your 5 to 10 Minutes Daily Forex Market Summary AI Bot.

FX-AI Broadcaster is a full-stack web application designed to fetch real-time Forex exchange rates and financial news, synthesize a comprehensive summary using Google's **Gemini API**, and read it to you out loud as a customized audio briefing in **Hindi** or **English**.

---

## ✨ Features
- **Real-Time Data Aggregation**: Fetches major exchange rates (`EUR/USD`, `GBP/USD`, `USD/JPY`, `AUD/USD`, `USD/CAD`, `USD/INR`) and financial news RSS feeds.
- **Gemini AI Summarization**: Uses Gemini 2.5 Flash to generate:
  - Structured, markdown-formatted dashboard bullet points (bulletins).
  - A continuous, natural spoken script (narration) designed for a 5-10 minute read.
- **Multilingual Support**: Choose between **हिंदी (Hindi)** and **English** for both the written text and voice podcast.
- **Audio Briefing Player**: Free, fully responsive local Text-to-Speech (TTS) integration with play, pause, stop, speed rate, and voice controls.
- **Interactive Visualizations**: Interactive 24-hour comparative rates trajectory chart using Chart.js.
- **Sleek Glassmorphic Dark UI**: Premium glowing dark mode layout designed with Outfit & Plus Jakarta fonts, pulsing soundwave animations, and a sliders sidebar.

---

## 🛠️ Tech Stack
- **Backend**: Node.js, Express, RSS-Parser, @google/generative-ai SDK.
- **Frontend**: HTML5, Vanilla CSS3 (custom CSS variables & keyframe animations), Vanilla JS.
- **APIs**:
  - Exchange Rates: Open Exchange Rates API (Free wrapper).
  - News Feeds: Yahoo Finance RSS & DailyFX feeds.
  - Text-to-Speech: Web Speech API (`window.speechSynthesis`).

---

## ⚙️ Installation & Setup

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (v18.0.0 or higher).

### 2. Configure Environment
1. Open the project folder `forex-ai-bot`.
2. Open the `.env` file.
3. Paste your Google Gemini API key:
   ```env
   PORT=3000
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
   *Note: If you don't have a key, you can get one for free at [Google AI Studio](https://aistudio.google.com/). You can also input this key directly in the Frontend Settings gear.*

### 3. Run the Bot
Inside the `forex-ai-bot` folder, open your terminal and run:

```bash
# To run in production mode:
npm start

# Or to run in development mode (with hot reloading):
npm run dev
```

### 4. Access the Dashboard
Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 💡 How to Get a Free Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Log in with your Google Account.
3. Click on **"Create API Key"** at the top left.
4. Copy the generated API Key and paste it into the settings drawer in the app or the `.env` file.
