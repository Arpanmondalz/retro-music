// --- 1. PLAYER LOGIC ---
function playTrack(videoId, title) {
    const titleClean = title || "UNKNOWN TRACK";
    document.getElementById('track-marquee').innerText = titleClean.substring(0, 24) + " - RADIO";
    
    document.getElementById('led').classList.add('active');
    document.getElementById('cassette-unit').classList.add('playing');
    document.getElementById('status-log').innerText = "PLAYING: " + titleClean;

    requestWakeLock(); 

    const origin = window.location.origin;
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&list=RD${videoId}&enablejsapi=1&origin=${origin}`;
    
    const player = document.getElementById('player-hide');
    player.innerHTML = '';
    
    setTimeout(() => {
        player.innerHTML = `<iframe width="200" height="200" src="${embedUrl}" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    }, 50);
}

function stopTrack() {
    document.getElementById('player-hide').innerHTML = '';
    document.getElementById('cassette-unit').classList.remove('playing');
    document.getElementById('led').classList.remove('active');
    document.getElementById('track-marquee').innerText = "SYSTEM IDLE";
    document.getElementById('status-log').innerText = "STOPPED.";
}


// --- 2. AI DJ (GEMINI) ---
// --- AI DJ (NOW USES CLOUDFLARE WORKER) ---
async function synthesizeTrack() {
    const log = document.getElementById('status-log');
    log.innerText = "CONTACTING AI...";
    
    const energy = document.getElementById('energy').value;     // Calm <-> Intense
    const valence = document.getElementById('valence').value;   // Sad <-> Happy
    const nostalgia = document.getElementById('nostalgia').value; // Modern <-> Retro
    const vocal = document.getElementById('vocal').value;       // Instrumental <-> Lyrical
    const discovery = document.getElementById('discovery').value; // Pop <-> Hidden Gem
    const language = document.getElementById('lang-select').value;
    
    // Your Cloudflare Worker URL 
    const WORKER_URL = 'https://retro-music.arpanmondal-ae18.workers.dev';
    
    const prompt = `
    Role: You are an expert music curator and audiophile DJ with deep knowledge of global music history.
    Task: Recommend exactly ONE track that perfectly matches the following "Sonic Fingerprint".

    Sonic Fingerprint:
    1. Energy Level: ${energy}% (0=Sleep/Ambient, 50=Groove, 100=Chaos/Rage)
    2. Emotional Valence: ${valence}% (0=Depressive/Dark, 50=Neutral, 100=Euphoric/Joyful)
    3. Era/Vibe: ${nostalgia}% (0=Futuristic/2024, 50=Timeless, 100=Vintage/80s/90s/Oldies)
    4. Vocal Presence: ${vocal}% (0=Pure Instrumental, 100=Lyrical/Storytelling)
    5. Obscurity: ${discovery}% (0=Mainstream Hit, 100=Deep Cut/Underground/Indie)
    6. Region/Language: ${language}

    Curator Rules:
    - If "Obscurity" is > 80%, DO NOT pick a song with >100M views. Dig deep.
    - If "Language" is 'Any', prioritize non-English tracks that fit the vibe (e.g., Hindi, Kannada, Tamil, Bengali).
    - STRICTLY respect the "Vocal" slider. If 0%, track must have NO words.

    Output Requirement:
    Return ONLY valid JSON. No markdown.
    Format: { "track": "Exact Track Title", "artist": "Exact Artist Name" }
    `;

    try {
        // 1. Call Your Worker (No API Key Exposed!)
        const response = await fetch(`${WORKER_URL}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                contents: [{ parts: [{ text: prompt }] }] 
            })
        });
        
        const rawText = await response.text();
        if (!response.ok) throw new Error("Worker Error: " + rawText);

        const data = JSON.parse(rawText);
        if (!data.candidates || !data.candidates[0].content) throw new Error("AI Returned Empty.");

        const rawAiText = data.candidates[0].content.parts[0].text;
        
        // Extract JSON
        const startIndex = rawAiText.indexOf('{');
        const endIndex = rawAiText.lastIndexOf('}') + 1;
        if (startIndex === -1) throw new Error("No JSON found");
        
        const cleanJson = rawAiText.substring(startIndex, endIndex);
        const songData = JSON.parse(cleanJson);
        
        log.innerText = `Searching YouTube: ${songData.track}...`;
        
        // 2. Search YouTube via Worker
        const ytRes = await fetch(`${WORKER_URL}/youtube`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                query: `${songData.track} ${songData.artist} official audio` 
            })
        });
        
        if (!ytRes.ok) throw new Error("YouTube Worker Error");
        const ytData = await ytRes.json();
        
        if (!ytData.items || ytData.items.length === 0) throw new Error("Song not found");
        
        playTrack(ytData.items[0].id.videoId, `${songData.track} - ${songData.artist}`);

    } catch (err) {
        console.error(err);
        alert("ERROR: " + err.message);
        log.innerText = "FAIL. Check Console.";
    }
}



// --- 3. SCANNER ---
let html5QrcodeScanner;
function toggleScanner() {
    const overlay = document.getElementById('scanner-overlay');
    // Keep it invisible - no preview shown
    overlay.style.display = 'block';
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    html5QrcodeScanner = new Html5Qrcode("scanner-overlay");
    html5QrcodeScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
            html5QrcodeScanner.stop().then(() => {
                overlay.style.display = 'none';
                let id = decodedText;
                if(decodedText.includes('v=')) id = decodedText.split('v=')[1].split('&')[0];
                else if(decodedText.includes('youtu.be/')) id = decodedText.split('youtu.be/')[1];
                playTrack(id, "CASSETTE LOADED");
            });
        }
    ).catch(err => {
        overlay.style.display = 'none';
        alert("Camera Error (Use HTTPS): " + err);
    });
}

// --- 4. SCREEN WAKE LOCK ---
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen Wake Lock Active');
      
      // If the user minimizes/switches tabs, the lock releases.
      // Re-acquire it when they come back.
      wakeLock.addEventListener('release', () => {
        console.log('Wake Lock Released');
      });
    }
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
}

// Handle visibility change (if user switches apps and comes back)
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
});



