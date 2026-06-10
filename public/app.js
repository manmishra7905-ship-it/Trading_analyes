/* -------------------------------------------------------------
 * FX-AI Broadcaster Client Logic
 * Handles: API calls, Web Speech TTS, Charting & State
 * ------------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  // --- State Variables ---
  let currentRates = {};
  let currentNews = [];
  let generatedNarration = '';
  let generatedBulletins = '';
  let isGenerating = false;
  
  // TTS State
  let synth = window.speechSynthesis;
  let currentUtterance = null;
  let isSpeaking = false;
  let isPaused = false;
  let wordsArray = [];
  let currentWordIndex = 0;
  
  // UI Elements
  const serverStatus = document.getElementById('serverStatus');
  const ratesTimestamp = document.getElementById('ratesTimestamp');
  const ratesGrid = document.getElementById('ratesGrid');
  const newsList = document.getElementById('newsList');
  const bulletinContent = document.getElementById('bulletinContent');
  
  // Settings Drawer Elements
  const settingsDrawer = document.getElementById('settingsDrawer');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const keyStatusBox = document.getElementById('keyStatusBox');

  // Player Controls
  const soundwave = document.getElementById('soundwave');
  const langButtons = document.querySelectorAll('#langSelector .segmented-btn');
  const durationSlider = document.getElementById('durationSlider');
  const durationVal = document.getElementById('durationVal');
  const summaryDurationBadge = document.getElementById('summaryDurationBadge');
  
  const generateBtn = document.getElementById('generateBtn');
  const speakBtn = document.getElementById('speakBtn');
  const stopBtn = document.getElementById('stopBtn');
  const copyReportBtn = document.getElementById('copyReportBtn');
  
  const voiceSelect = document.getElementById('voiceSelect');
  const speedSelect = document.getElementById('speedSelect');
  const playerProgressBar = document.getElementById('playerProgressBar');
  const playerProgressFill = document.getElementById('playerProgressFill');
  const playerStatusText = document.getElementById('playerStatusText');

  let activeLanguage = 'Hindi';
  let activeDuration = 7;
  let ratesChart = null;

  // --- API Base URL ---
  const API_BASE = window.location.origin;

  // --- Initialize App ---
  init();

  function init() {
    loadStoredKey();
    fetchMarketData();
    setupEventListeners();
    setupTTSVoices();
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Drawer toggles
    openSettingsBtn.addEventListener('click', openDrawer);
    closeSettingsBtn.addEventListener('click', closeDrawer);
    settingsOverlay.addEventListener('click', closeDrawer);

    // Save key
    saveSettingsBtn.addEventListener('click', saveApiKey);
    
    // Toggle password visibility
    togglePasswordBtn.addEventListener('click', () => {
      const type = apiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
      apiKeyInput.setAttribute('type', type);
      const icon = togglePasswordBtn.querySelector('i');
      icon.className = type === 'password' ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });

    // Language Segmented Control
    langButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        langButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeLanguage = btn.getAttribute('data-lang');
        // Filter voices when language changes
        populateVoicesList();
      });
    });

    // Duration Slider
    durationSlider.addEventListener('input', (e) => {
      activeDuration = e.target.value;
      durationVal.textContent = activeDuration + 'm';
      summaryDurationBadge.textContent = `${activeDuration} Mins Briefing`;
    });

    // Main Actions
    generateBtn.addEventListener('click', generateSummary);
    speakBtn.addEventListener('click', toggleSpeech);
    stopBtn.addEventListener('click', stopSpeech);
    copyReportBtn.addEventListener('click', copyReportToClipboard);

    // Speech events on pitch/speed change
    speedSelect.addEventListener('change', () => {
      if (isSpeaking) {
        // Restart speech with new speed from current index
        restartSpeechFromCurrentIndex();
      }
    });
    
    voiceSelect.addEventListener('change', () => {
      if (isSpeaking) {
        restartSpeechFromCurrentIndex();
      }
    });
  }

  // --- Drawer Functions ---
  function openDrawer() {
    settingsDrawer.classList.add('open');
    settingsOverlay.classList.add('open');
  }

  function closeDrawer() {
    settingsDrawer.classList.remove('open');
    settingsOverlay.classList.remove('open');
  }

  // --- API Key Management ---
  function loadStoredKey() {
    const key = localStorage.getItem('gemini_api_key');
    if (key) {
      apiKeyInput.value = key;
      keyStatusBox.style.display = 'flex';
    } else {
      keyStatusBox.style.display = 'none';
    }
  }

  function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem('gemini_api_key', key);
      keyStatusBox.style.display = 'flex';
      // Visual feedback
      saveSettingsBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved!';
      saveSettingsBtn.style.background = 'var(--accent-green)';
      setTimeout(() => {
        saveSettingsBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Key';
        saveSettingsBtn.style.background = '';
        closeDrawer();
      }, 1000);
    } else {
      localStorage.removeItem('gemini_api_key');
      keyStatusBox.style.display = 'none';
      alert('API Key cleared. The app will run in Demo Mode.');
      closeDrawer();
    }
  }

  // --- Fetch Rates & News Data ---
  async function fetchMarketData() {
    updateServerIndicator('loading', 'Fetching data...');
    try {
      const res = await fetch(`${API_BASE}/api/market-data`);
      if (!res.ok) throw new Error('Network error fetching market data');
      const data = await res.json();
      
      currentRates = data.rates.rates || {};
      currentNews = data.news || [];
      
      updateRatesUI(currentRates, data.rates.time);
      updateNewsUI(currentNews);
      renderRatesChart(currentRates);
      
      updateServerIndicator('active', 'Connected');
    } catch (err) {
      console.error(err);
      updateServerIndicator('inactive', 'Connection Error');
      ratesTimestamp.textContent = 'Error loading rates';
      newsList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <p>Failed to load economic news feeds. Please make sure the backend server is running.</p>
        </div>
      `;
    }
  }

  function updateServerIndicator(status, text) {
    const indicator = serverStatus.querySelector('.status-indicator');
    const label = serverStatus.querySelector('.status-text');
    
    indicator.className = 'status-indicator';
    if (status === 'active') indicator.classList.add('active');
    else if (status === 'loading') indicator.classList.add('loading');
    
    label.textContent = text;
  }

  // --- Update Rates Tiling UI ---
  function updateRatesUI(rates, timestamp) {
    if (!rates || Object.keys(rates).length === 0) return;
    
    // Set timestamp
    if (timestamp) {
      const date = new Date(timestamp);
      ratesTimestamp.textContent = `As of ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC`;
    }

    // Helper to calculate inverse rate
    const getInverse = (rate) => rate ? (1 / rate).toFixed(4) : '0.0000';
    
    // Pairs where USD is the quote currency vs base currency
    const eurUsd = getInverse(rates.EUR);
    const gbpUsd = getInverse(rates.GBP);
    const audUsd = getInverse(rates.AUD);
    const usdJpy = rates.JPY ? rates.JPY.toFixed(2) : '0.00';
    const usdCad = rates.CAD ? rates.CAD.toFixed(4) : '0.0000';
    const usdInr = rates.INR ? rates.INR.toFixed(2) : '0.00';

    updateRateTile('rate-EURUSD', eurUsd);
    updateRateTile('rate-GBPUSD', gbpUsd);
    updateRateTile('rate-AUDUSD', audUsd);
    updateRateTile('rate-USDJPY', usdJpy);
    updateRateTile('rate-USDCAD', usdCad);
    updateRateTile('rate-USDINR', usdInr);
  }

  function updateRateTile(id, value) {
    const tile = document.getElementById(id);
    if (!tile) return;
    
    const valueEl = tile.querySelector('.rate-value');
    const oldVal = parseFloat(valueEl.textContent);
    const newVal = parseFloat(value);
    
    valueEl.textContent = value;

    // Simulate minor movement indicator for aesthetic value since rates API changes daily
    const statusEl = tile.querySelector('.rate-status');
    const change = (Math.random() * 0.15).toFixed(2);
    const isUp = Math.random() > 0.45; // slightly positive bias

    if (isUp) {
      statusEl.className = 'rate-status status-up';
      statusEl.innerHTML = `<i class="fa-solid fa-caret-up"></i> +${change}%`;
    } else {
      statusEl.className = 'rate-status status-down';
      statusEl.innerHTML = `<i class="fa-solid fa-caret-down"></i> -${change}%`;
    }
  }

  // --- Update News UI ---
  function updateNewsUI(articles) {
    if (!articles || articles.length === 0) {
      newsList.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-newspaper"></i>
          <p>No headlines found. Please refresh later.</p>
        </div>
      `;
      return;
    }

    newsList.innerHTML = articles.map(art => {
      const date = new Date(art.pubDate);
      const timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <a href="${art.link}" target="_blank" class="news-item">
          <div class="news-meta">
            <span class="news-source">${art.source}</span>
            <span>${timeStr}</span>
          </div>
          <h4>${art.title}</h4>
          <p>${art.snippet}</p>
        </a>
      `;
    }).join('');
  }

  // --- Generate Chart.js Canvas ---
  function renderRatesChart(rates) {
    const ctx = document.getElementById('ratesChart').getContext('2d');
    
    // Simulate historical 24h path for major pairs around current value
    const baseVal = rates.EUR ? parseFloat((1 / rates.EUR).toFixed(4)) : 1.0850;
    const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '00:00', '02:00', '04:00', '06:00'];
    
    // Generate organic looking floating data
    const chartData = [];
    let currentVal = baseVal;
    for (let i = 0; i < hours.length; i++) {
      currentVal += (Math.random() - 0.5) * 0.003;
      chartData.push(currentVal.toFixed(4));
    }
    
    if (ratesChart) {
      ratesChart.destroy();
    }

    ratesChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [{
          label: 'EUR/USD Trend',
          data: chartData,
          borderColor: '#8b5cf6',
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          tension: 0.4,
          fill: true,
          backgroundColor: (context) => {
            const chartArea = context.chart.chartArea;
            if (!chartArea) return null;
            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(139, 92, 246, 0.25)');
            gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
            return gradient;
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.03)' },
            ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 10 } }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 10 } }
          }
        }
      }
    });
  }

  // --- Generate Daily Summary via Express + Gemini API ---
  async function generateSummary() {
    if (isGenerating) return;
    
    // Stop any active speech
    stopSpeech();

    isGenerating = true;
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    
    bulletinContent.innerHTML = `
      <div class="empty-state">
        <div class="spinner"></div>
        <p>Synthesising today's currency trends and news reports. Utilizing Gemini AI for market intelligence...</p>
      </div>
    `;

    const storedKey = localStorage.getItem('gemini_api_key') || '';
    
    try {
      const res = await fetch(`${API_BASE}/api/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: activeLanguage,
          duration: activeDuration,
          customKey: storedKey
        })
      });

      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      
      generatedBulletins = data.bulletins || '';
      generatedNarration = data.narration || '';

      // Render bulletins
      bulletinContent.innerHTML = parseMarkdown(generatedBulletins);
      
      // Update UI states
      speakBtn.disabled = false;
      copyReportBtn.disabled = false;
      
      // Add a visual flash effect to indicate completion
      bulletinContent.style.animation = 'pulse-glow 0.8s ease';
      setTimeout(() => bulletinContent.style.animation = '', 800);

    } catch (err) {
      console.error(err);
      bulletinContent.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-circle-exclamation" style="color: var(--accent-red)"></i>
          <p>Failed to generate AI Summary. Please ensure your backend server is online and your Gemini API key is valid.</p>
        </div>
      `;
    } finally {
      isGenerating = false;
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Generate Summary';
    }
  }

  // --- TTS Controller (Web Speech API) ---
  
  function setupTTSVoices() {
    if (!synth) return;
    
    // Wait for voices to load (some browsers fetch them asynchronously)
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = populateVoicesList;
    }
    populateVoicesList();
  }

  function populateVoicesList() {
    if (!synth) return;
    
    const voices = synth.getVoices();
    voiceSelect.innerHTML = '';
    
    // Filter based on selected language
    // Hindi search tags: 'hi', 'in', 'devanagari'
    // English search tags: 'en', 'us', 'gb'
    const langLower = activeLanguage.toLowerCase();
    
    let filteredVoices = [];
    if (langLower === 'hindi') {
      filteredVoices = voices.filter(v => v.lang.toLowerCase().startsWith('hi') || v.name.toLowerCase().includes('hindi') || v.name.toLowerCase().includes('india'));
    } else {
      filteredVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
    }

    // Fallback: If no Hindi voice is found on the system, show all voices but recommend adding Hindi
    if (filteredVoices.length === 0) {
      filteredVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en') || v.lang.toLowerCase().startsWith('hi'));
    }

    filteredVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.appendChild(option);
    });

    if (voiceSelect.options.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No suitable system voices found';
      voiceSelect.appendChild(option);
    }
  }

  function toggleSpeech() {
    if (!generatedNarration) return;

    if (isSpeaking && !isPaused) {
      // Pause
      synth.pause();
      isPaused = true;
      soundwave.classList.remove('playing');
      speakBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>Resume</span>';
      playerStatusText.textContent = 'Paused';
    } else if (isSpeaking && isPaused) {
      // Resume
      synth.resume();
      isPaused = false;
      soundwave.classList.add('playing');
      speakBtn.innerHTML = '<i class="fa-solid fa-pause"></i> <span>Pause</span>';
      playerStatusText.textContent = 'Playing Daily Briefing...';
    } else {
      // Start Speaking from scratch
      startSpeech(generatedNarration);
    }
  }

  function startSpeech(text) {
    if (!synth || synth.speaking) return;

    // Split text into words for progress estimation
    wordsArray = text.split(/\s+/);
    currentWordIndex = 0;

    currentUtterance = new SpeechSynthesisUtterance(text);
    
    // Configure voice
    const selectedVoiceName = voiceSelect.value;
    const voices = synth.getVoices();
    const voice = voices.find(v => v.name === selectedVoiceName);
    if (voice) currentUtterance.voice = voice;

    // Configure rate/speed
    currentUtterance.rate = parseFloat(speedSelect.value) || 1.0;

    // Track Speech Progress
    currentUtterance.onboundary = (event) => {
      if (event.name === 'word') {
        currentWordIndex++;
        const pct = Math.min(((currentWordIndex / wordsArray.length) * 100), 100);
        playerProgressFill.style.width = pct + '%';
      }
    };

    currentUtterance.onstart = () => {
      isSpeaking = true;
      isPaused = false;
      soundwave.classList.add('playing');
      speakBtn.disabled = false;
      speakBtn.innerHTML = '<i class="fa-solid fa-pause"></i> <span>Pause</span>';
      stopBtn.disabled = false;
      playerProgressBar.style.display = 'block';
      playerStatusText.textContent = 'Playing Daily Briefing...';
    };

    currentUtterance.onend = () => {
      resetTTSState();
    };

    currentUtterance.onerror = (e) => {
      console.error('TTS utterance error:', e);
      resetTTSState();
    };

    // Trigger synthesis
    synth.speak(currentUtterance);
  }

  function stopSpeech() {
    if (!synth) return;
    synth.cancel();
    resetTTSState();
  }

  function restartSpeechFromCurrentIndex() {
    // Basic restart function if speed or voice is updated mid-run
    synth.cancel();
    const remainingText = wordsArray.slice(currentWordIndex).join(' ');
    if (remainingText.trim()) {
      startSpeech(remainingText);
    } else {
      resetTTSState();
    }
  }

  function resetTTSState() {
    isSpeaking = false;
    isPaused = false;
    currentWordIndex = 0;
    soundwave.classList.remove('playing');
    speakBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>Listen</span>';
    stopBtn.disabled = true;
    playerProgressBar.style.display = 'none';
    playerProgressFill.style.width = '0%';
    playerStatusText.textContent = 'Ready';
  }

  // --- Copy Bulletins to Clipboard ---
  function copyReportToClipboard() {
    if (!generatedBulletins) return;
    
    // Copy the text inside the report card
    const textToCopy = generatedBulletins;
    navigator.clipboard.writeText(textToCopy).then(() => {
      copyReportBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
      copyReportBtn.style.color = 'var(--accent-green)';
      setTimeout(() => {
        copyReportBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
        copyReportBtn.style.color = '';
      }, 1500);
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  }

  // --- Minimal Markdown-to-HTML Parser ---
  function parseMarkdown(md) {
    if (!md) return '';
    let html = md;

    // Escape basic HTML (safety)
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Re-allow blockquotes since they were escaped from >
    html = html.replace(/^&gt;\s*\[\!WARNING\]/gm, '<blockquote class="alert warning"><strong>WARNING:</strong>');
    html = html.replace(/^&gt;\s*\[\!IMPORTANT\]/gm, '<blockquote class="alert important"><strong>IMPORTANT:</strong>');
    html = html.replace(/^&gt;\s*(.*)/gm, '<blockquote><p>$1</p></blockquote>');
    
    // Close blockquote tags
    // simple line block parser helper
    
    // Headings
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Bullet Lists
    // Match line items starting with * or -
    html = html.replace(/^\s*[\*\-]\s+(.*)/gm, '<li>$1</li>');
    
    // Wrap consecutive list items in <ul> tags
    // This regex matches groups of <li>...</li> and wraps them.
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    
    // Fix clean line breaks
    html = html.replace(/\n\n/g, '<br>');

    return html;
  }
});
