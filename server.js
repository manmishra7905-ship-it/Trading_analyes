const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const Parser = require('rss-parser');
const { GoogleGenAI } = require('@google/genai');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const parser = new Parser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  customFields: {
    item: [['media:content', 'media'], ['description', 'description']],
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache variables to avoid rate-limiting APIs
let rateCache = null;
let newsCache = null;
let cacheTime = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes cache

// Helper to fetch Exchange Rates
async function fetchExchangeRates() {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) throw new Error('Failed to fetch rates from API');
    const data = await response.json();
    return {
      success: true,
      time: data.time_last_update_utc,
      rates: data.rates
    };
  } catch (error) {
    console.error('Error fetching rates:', error);
    return { success: false, error: error.message };
  }
}

// Helper to fetch Forex News
async function fetchForexNews() {
  try {
    // ForexLive RSS is very active and focused on forex markets
    const feed = await parser.parseURL('https://www.forexlive.com/feed');
    const articles = feed.items.slice(0, 10).map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      snippet: item.contentSnippet || item.description || '',
      source: 'ForexLive'
    }));
    return { success: true, articles };
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
    // Fallback news feed using Yahoo Finance Currencies RSS
    try {
      const fallbackFeed = await parser.parseURL('https://finance.yahoo.com/news/rss/category-currencies');
      const articles = fallbackFeed.items.slice(0, 10).map(item => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        snippet: item.contentSnippet || item.description || '',
        source: item.creator || 'Yahoo Finance'
      }));
      return { success: true, articles };
    } catch (fbError) {
      console.error('Fallback RSS feed failed too:', fbError);
      return { success: false, error: error.message };
    }
  }
}

// Route to get current market data (Rates + News)
app.get('/api/market-data', async (req, res) => {
  const now = Date.now();
  if (rateCache && newsCache && cacheTime && (now - cacheTime < CACHE_DURATION)) {
    return res.json({
      cached: true,
      rates: rateCache,
      news: newsCache
    });
  }

  const ratesResult = await fetchExchangeRates();
  const newsResult = await fetchForexNews();

  if (ratesResult.success) {
    rateCache = ratesResult;
  } else if (!rateCache) {
    rateCache = { success: false, error: ratesResult.error };
  }

  if (newsResult.success) {
    newsCache = newsResult.articles;
  } else if (!newsCache) {
    newsCache = [];
  }
  
  cacheTime = now;

  res.json({
    cached: false,
    rates: rateCache,
    news: newsCache
  });
});

// Route to generate AI Summary using Gemini API
app.post('/api/generate-summary', async (req, res) => {
  const { language = 'Hindi', duration = '7', customKey } = req.body;
  
  // Use custom key from user request if provided, otherwise fallback to server's .env key
  const apiKey = customKey || process.env.GEMINI_API_KEY;

  // Fetch the latest market data if cache is empty
  if (!rateCache || !newsCache) {
    const ratesResult = await fetchExchangeRates();
    const newsResult = await fetchForexNews();
    if (ratesResult.success) rateCache = ratesResult;
    if (newsResult.success) newsCache = newsResult.articles;
    cacheTime = Date.now();
  }

  const ratesData = rateCache || { rates: {} };
  const newsData = newsCache || [];

  // If no API key is available, return a beautiful mock summary with instructions
  if (!apiKey) {
    console.log('No Gemini API Key found. Returning mock summary.');
    const mockSummary = getMockSummary(language, ratesData, newsData);
    return res.json({
      success: true,
      isMock: true,
      ...mockSummary
    });
  }

  try {
    // Initialize Google Gen AI SDK
    const ai = new GoogleGenAI({ apiKey });
    
    // Format rates for prompt
    const usd = ratesData.rates || {};
    const formattedRates = `
- EUR/USD: ${(1 / (usd.EUR || 0.92)).toFixed(4)} (USD to EUR: ${usd.EUR})
- GBP/USD: ${(1 / (usd.GBP || 0.78)).toFixed(4)} (USD to GBP: ${usd.GBP})
- USD/JPY: ${(usd.JPY || 156.4).toFixed(2)}
- AUD/USD: ${(1 / (usd.AUD || 1.50)).toFixed(4)} (USD to AUD: ${usd.AUD})
- USD/CAD: ${(usd.CAD || 1.36).toFixed(4)}
- USD/CHF: ${(usd.CHF || 0.90).toFixed(4)}
- USD/INR: ${(usd.INR || 83.5).toFixed(2)}
    `;

    // Format news for prompt
    const formattedNews = newsData.map((a, i) => `[News ${i+1}] Title: ${a.title}\nSource: ${a.source}\nSummary: ${a.snippet}`).join('\n\n');

    const prompt = `
You are an expert Forex Market Analyst and Podcast Host.
Generate a daily summary report of the Forex Market based on the data below.

Rates Data (Current Exchange Rates):
${formattedRates}

Top Market News / Events today:
${formattedNews}

User Request Details:
- Target Language: ${language} (Hindi or English)
- Desired Speech Duration: ${duration} minutes.

Instructions:
1. You MUST generate two distinct formats in your response. Output a JSON object with two fields:
   a. "bulletins": A markdown string containing a beautifully structured dashboard summary. Use section headers like "Market Overview", "Major Currency Movements", "Key Economic Factors", and "Technical Sentiment". Use bullet points and bold highlights.
   b. "narration": A plain text script designed to be read out loud via Text-to-Speech (TTS). It must be a continuous, natural flowing narrative (no markdown headers, no asterisks, no bullet symbols, no parenthetical expressions, no brackets). It should sound exactly like a professional daily radio financial news report that takes approximately ${duration} minutes to read at a normal pace. Use expressive transitions.
2. The language of BOTH parts must be: ${language}.
   - If language is "Hindi", write in standard Hindi (Devanagari script) that sounds professional (Hinglish terms like 'forex market', 'central bank', 'inflation', 'interest rates' are fine, but write them in Devanagari/Hindi format so the TTS engine reads it properly).
   - If language is "English", write in standard English.
3. Keep the narration highly detailed and comprehensive to fill a ${duration}-minute speaking duration. Analyze the news stories and rates deeply. Highlight how economic indicators like CPI, GDP, or Central Bank announcements affected the rate movements.
4. Output EXACTLY a valid JSON object matching this schema. Do not wrap it in any extra markdown wrappers other than standard \`\`\`json.
{
  "bulletins": "markdown text here",
  "narration": "continuous narration text here"
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const contentText = response.text;
    console.log("Raw response from Gemini:", contentText);
    const parsedResponse = JSON.parse(contentText);

    res.json({
      success: true,
      isMock: false,
      bulletins: parsedResponse.bulletins,
      narration: parsedResponse.narration
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error generating AI summary: ' + error.message,
      // Provide mock summary on error so the app remains usable
      fallback: getMockSummary(language, ratesData, newsData)
    });
  }
});

// Helper function to generate mock content if API key is not present
function getMockSummary(language, ratesData, newsData) {
  const isHindi = language.toLowerCase() === 'hindi';
  
  if (isHindi) {
    return {
      bulletins: `### 📢 दैनिक फॉरेक्स मार्केट बुलेटिन (डेमो मोड)
> [!WARNING]
> **Gemini API Key** सेट नहीं है। यह एक डेमो रिपोर्ट है। वास्तविक AI समरी देखने के लिए कृपया सेटिंग्स में अपनी API Key दर्ज करें।

#### 📈 मुख्य करेंसी कपल्स की हलचल
* **EUR/USD**: यूरोपीय सेंट्रल बैंक (ECB) की आगामी नीति से पहले EUR मजबूत स्थिति में है।
* **GBP/USD**: बैंक ऑफ इंग्लैंड (BoE) की ब्याज दरों में नरमी की आशंका से स्टर्लिंग स्थिर है।
* **USD/JPY**: बैंक ऑफ जापान (BoJ) द्वारा संभावित हस्तक्षेप की चर्चा से जापानी येन में उतार-चढ़ाव जारी है।
* **USD/INR**: घरेलू शेयर बाजार और विदेशी निवेश के प्रवाह से भारतीय रुपया एक सीमित दायरे में कारोबार कर रहा है।

#### 📰 महत्वपूर्ण बाजार खबरें
${newsData.length > 0 ? newsData.slice(0, 3).map(n => `* **${n.title}** (${n.source})`).join('\n') : '* कोई लाइव समाचार उपलब्ध नहीं है। कृपया इंटरनेट कनेक्शन जांचें।'}

#### 💡 आगामी ध्यान देने योग्य घटनाएं
* फेडरल रिजर्व के अधिकारियों के भाषण
* अमेरिकी बेरोजगारी दर के आंकड़े`,
      narration: `नमस्कार और फॉरेक्स डेली अपडेट में आपका स्वागत है। आज का बाजार मिला-जुला नजर आ रहा है। प्रमुख करेंसी कपल्स एक संकीर्ण दायरे में कारोबार कर रहे हैं क्योंकि वैश्विक निवेशक अमेरिकी मुद्रास्फीति और बेरोजगारी के आंकड़ों का इंतजार कर रहे हैं। यूरो-यूएसडी में थोड़ी मजबूती दिखाई दी है, जबकि पाउंड-डॉलर स्थिर बना हुआ है। जापानी येन में अमेरिकी डॉलर के मुकाबले हल्की गिरावट दर्ज की गई है क्योंकि बैंक ऑफ जापान की मौद्रिक नीति में बदलाव की धीमी रफ्तार निवेशकों को चिंतित कर रही है। भारत की बात करें तो, भारतीय रुपया डॉलर के मुकाबले स्थिर बना हुआ है। कृपया ध्यान दें कि यह एक डेमो सारांश है क्योंकि आपकी जेमिनी एपीआई की अभी तक कॉन्फ़िगर नहीं की गई है। पूर्ण विश्लेषण और रीयल-टाइम पॉडकास्ट अनुभव के लिए, कृपया डैशबोर्ड में अपनी जेमिनी की दर्ज करें। आपका दिन शुभ हो!`
    };
  } else {
    return {
      bulletins: `### 📢 Daily Forex Market Bulletin (Demo Mode)
> [!WARNING]
> **Gemini API Key** is not set. Showing demo report. Please enter your API Key in the settings to generate real-time AI summaries.

#### 📈 Major Currency Pair Movements
* **EUR/USD**: Trading slightly higher ahead of the upcoming European Central Bank (ECB) meeting.
* **GBP/USD**: Consolidation continues as traders digest Bank of England (BoE) rate expectations.
* **USD/JPY**: Higher volatility as speculation continues around Bank of Japan (BoJ) market intervention.
* **USD/INR**: The Indian Rupee is holding in a tight range supported by local equity inflows.

#### 📰 Key Market Headlines
${newsData.length > 0 ? newsData.slice(0, 3).map(n => `* **${n.title}** (${n.source})`).join('\n') : '* No live news headlines available.'}

#### 💡 Key Events Ahead
* Speeches by Federal Reserve voting members
* US weekly jobless claims and labor market indicators`,
      narration: `Welcome to your daily Forex Market Briefing. Today, we are seeing a mixed bag across major currency pairs. The US Dollar is trading in a consolidation phase as market participants gear up for the upcoming economic data releases, including the inflation indices and unemployment reports. The Euro has picked up some momentum, while the British Pound remains largely unchanged. The Japanese Yen continues to experience volatility amidst discussions of potential currency intervention by the authorities in Tokyo. In Asia, the Indian Rupee is hovering near its recent range, supported by domestic equity inflows. Please remember, this is a demonstration briefing because your Gemini API key is currently missing. To get a comprehensive 5-to-10 minute AI summary tailored to the latest market news, please enter your API key in the settings panel. Thank you for listening!`
    };
  }
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
