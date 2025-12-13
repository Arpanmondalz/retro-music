// --- 1. PLAYER LOGIC ---
function playTrack(videoId, title) {
    const titleClean = title || "UNKNOWN TRACK";
    document.getElementById('track-marquee').innerText = titleClean.substring(0, 24) + " - RADIO";
    
    document.getElementById('led').classList.add('active');
    document.getElementById('cassette-unit').classList.add('playing');
    document.getElementById('status-log').innerText = "PLAYING: " + titleClean;

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
    
    const energy = document.getElementById('energy').value;
    const valence = document.getElementById('valence').value;
    const texture = document.getElementById('acoustic').value;
    const vocal = document.getElementById('vocal').value;
    const language = document.getElementById('lang-select').value;
    
    // Your Cloudflare Worker URL 
    const WORKER_URL = 'https://retro-music.arpanmondal-ae18.workers.dev';
    
    const prompt = `
        Role: You are an expert music curator and audiophile DJ.
        Task: Select exactly ONE track that perfectly matches the following sonic signature.
        
        Sonic Signature:
        - Energy: ${energy}% (0=Ambient/Drone, 50=Groovy, 100=High-Octane/Aggressive)
        - Mood: ${valence}% (0=Melancholic/Dark, 50=Neutral, 100=Euphoric/Uplifting)
        - Texture: ${texture}% (0=Purely Synthetic/Electronic, 50=Hybrid, 100=Acoustic/Organic/Folk)
        - Vocals: ${vocal}% (0=Instrumental, 50=Sparse/Chopped, 100=Lyrical/Song)
        - Language/Region: ${language}

        Selection Criteria:
        1. NO generic top 40 hits. Find hidden gems, cult classics, or critically acclaimed tracks.
        2. If Language is 'Any', prioritize music from non-Western regions (Japan, Brazil, India, West Africa).
        3. Match the 'Texture' strictly. If Texture is 0%, do not pick a rock song. If Texture is 100%, do not pick Techno.

        Output Requirement:
        Return ONLY valid JSON. No markdown, no conversation.
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
    overlay.style.display = 'block';

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

