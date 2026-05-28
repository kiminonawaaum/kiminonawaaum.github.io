/* ===== STATE MACHINE ===== */
const STATE = {
    LOADING: 'loading',
    CAMERA_REQUEST: 'camera_request',
    GESTURE: 'gesture',
    FALLBACK: 'fallback',
    SURPRISE: 'surprise'
};

let currentState = STATE.LOADING;
let gestureStep = 0; // 0, 1, 2, 3
let holdStartTime = null;
let currentDetectedFingers = 0;
let hands, camera;
let isTransitioning = false;

const HOLD_DURATION = 600; // ms
const SURPRISE_DELAY = 2000; // ms

/* ===== DOM ELEMENTS ===== */
const els = {
    loadingScreen: document.getElementById('loading-screen'),
    cameraScreen: document.getElementById('camera-screen'),
    fallbackScreen: document.getElementById('fallback-screen'),
    gestureScene: document.getElementById('gesture-scene'),
    surpriseScene: document.getElementById('surprise-scene'),
    
    startCameraBtn: document.getElementById('start-camera-btn'),
    fallbackBtn: document.getElementById('fallback-btn'),
    webcam: document.getElementById('webcam'),
    gestureCanvas: document.getElementById('gesture-canvas'),
    numberText: document.getElementById('number-text'),
    gestureHint: document.getElementById('gesture-hint'),
    handIndicator: document.getElementById('hand-indicator'),
    
    dot1: document.getElementById('dot-1'),
    dot2: document.getElementById('dot-2'),
    dot3: document.getElementById('dot-3'),
    
    confettiContainer: document.getElementById('confetti-container'),
    floatingHearts: document.getElementById('floating-hearts'),
    sparkles: document.getElementById('sparkles'),
    gestureParticles: document.getElementById('gesture-particles'),
    
    lottieBear: document.getElementById('lottie-bear'),
    lottieBunny: document.getElementById('lottie-bunny'),
    lottieHeart: document.getElementById('lottie-heart'),
    lottieFlower: document.getElementById('lottie-flower'),
    lottieStar: document.getElementById('lottie-star'),
    
    surpriseTitle: document.getElementById('surprise-title'),
    photoGallery: document.getElementById('photo-gallery'),
    secretHeart: document.getElementById('secret-heart'),
    secretMessageCard: document.getElementById('secret-message-card'),
    secretClose: document.getElementById('secret-close'),
    trailCanvas: document.getElementById('trail-canvas'),
};

/* ===== LOTTIE URLS (Public free animations) ===== */
const LOTTIE_URLS = {
    bear: 'https://lottie.host/8b7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c/7c7c7c7c7c.json', // placeholder, will fallback
    bunny: 'https://lottie.host/9b7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c/9c7c7c7c7c.json',
    heart: 'https://lottie.host/5b7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c/5c7c7c7c7c.json',
    flower: 'https://lottie.host/6b7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c/6c7c7c7c7c.json',
    star: 'https://lottie.host/4b7c7c7c-7c7c-4c7c-8c7c-7c7c7c7c7c7c/4c7c7c7c7c.json',
};

/* ===== UTILITY ===== */
function showScreen(screenEl) {
    Object.values(els).forEach(el => {
        if (el && el.classList && el.classList.contains('screen')) {
            el.classList.remove('active');
        }
        if (el && el.classList && el.classList.contains('scene')) {
            el.classList.remove('active');
        }
    });
    if (screenEl) {
        screenEl.classList.add('active');
    }
}

function updateDots() {
    els.dot1.classList.toggle('active', gestureStep >= 1);
    els.dot2.classList.toggle('active', gestureStep >= 2);
    els.dot3.classList.toggle('active', gestureStep >= 3);
    // Step guide highlights
    const s1 = document.getElementById('step-1');
    const s2 = document.getElementById('step-2');
    const s3 = document.getElementById('step-3');
    if (s1) s1.classList.toggle('active', gestureStep === 0);
    if (s2) s2.classList.toggle('active', gestureStep === 1);
    if (s3) s3.classList.toggle('active', gestureStep === 2);
}

function updateHint() {
    const hints = [
        'ชู 1 นิ้วให้เห็นนะ~',
        'เก่งมาก! ต่อด้วย 2 นิ้ว~',
        'สุดยอด! สุดท้าย 3 นิ้ว~',
        'เย้! เตรียมตัว...'
    ];
    els.gestureHint.textContent = hints[gestureStep] || hints[0];
}

function popNumber(num) {
    els.numberText.textContent = num;
    els.numberText.classList.remove('pop');
    void els.numberText.offsetWidth; // force reflow
    els.numberText.classList.add('pop');
}

/* ===== FINGER COUNTING (IMPROVED) ===== */
function countFingers(landmarks) {
    // Use wrist (0) as reference point for more robust detection
    const wrist = landmarks[0];
    
    // Helper: distance between two points
    function dist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }
    
    // Helper: check if finger is extended by comparing tip-to-wrist vs pip-to-wrist distance
    // Extended finger: tip is much farther from wrist than PIP
    function isFingerExtended(tipIdx, pipIdx) {
        const tip = landmarks[tipIdx];
        const pip = landmarks[pipIdx];
        const tipToWrist = dist(tip, wrist);
        const pipToWrist = dist(pip, wrist);
        // If tip is significantly farther from wrist than PIP, finger is extended
        return tipToWrist > pipToWrist * 1.05;
    }
    
    let count = 0;
    
    if (isFingerExtended(8, 6)) count++;
    if (isFingerExtended(12, 10)) count++;
    if (isFingerExtended(16, 14)) count++;
    if (isFingerExtended(20, 18)) count++;
    
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const pinkyBase = landmarks[17];
    if (dist(thumbTip, pinkyBase) > dist(thumbIP, pinkyBase) * 1.05) count++;
    
    return count;
}

/* ===== MEDIAPIPE SETUP ===== */
function initMediaPipe() {
    return new Promise((resolve, reject) => {
        try {
            hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
                }
            });
            
            hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            
            hands.onResults(onHandResults);
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

function startCamera() {
    return new Promise((resolve, reject) => {
        try {
            camera = new Camera(els.webcam, {
                onFrame: async () => {
                    await hands.send({ image: els.webcam });
                },
                width: 320,
                height: 240
            });
            camera.start()
                .then(() => resolve())
                .catch((e) => reject(e));
        } catch (e) {
            reject(e);
        }
    });
}

function onHandResults(results) {
    if (currentState !== STATE.GESTURE || isTransitioning) return;
    
    const canvas = els.gestureCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = els.webcam.videoWidth || 320;
    canvas.height = els.webcam.videoHeight || 240;
    
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // Update finger trail
        updateFingerTrail(landmarks);
        
        // Update hand indicator
        if (els.handIndicator) {
            els.handIndicator.textContent = `✋ พบมือ! (${currentDetectedFingers} นิ้ว)`;
            els.handIndicator.classList.add('detected');
        }
        
        // Draw landmarks
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
            color: '#FF8FA3',
            lineWidth: 2
        });
        drawLandmarks(ctx, landmarks, {
            color: '#C7CEEA',
            lineWidth: 1,
            radius: 3
        });
        
        // Count fingers
        const fingerCount = countFingers(landmarks);
        handleFingerDetection(fingerCount);
        
        // Update indicator with current count
        if (els.handIndicator) {
            els.handIndicator.textContent = `✋ พบมือ! (${fingerCount} นิ้ว)`;
        }
    } else {
        // No hand detected
        if (els.handIndicator) {
            els.handIndicator.textContent = '✋ รอมือ...';
            els.handIndicator.classList.remove('detected');
        }
        currentDetectedFingers = 0;
        holdStartTime = null;
    }
    
    ctx.restore();
}

function handleFingerDetection(count) {
    const target = gestureStep + 1; // expecting 1, 2, or 3
    
    if (count === target) {
        if (holdStartTime === null) {
            holdStartTime = Date.now();
            popNumber(count);
        } else {
            const held = Date.now() - holdStartTime;
            if (held >= HOLD_DURATION) {
                // Step complete
                gestureStep++;
                updateDots();
                updateHint();
                holdStartTime = null;
                
                if (gestureStep >= 3) {
                    // All steps complete, trigger surprise after delay
                    isTransitioning = true;
                    const hintEl = document.getElementById('gesture-hint');
                    if (hintEl) hintEl.textContent = 'เย้! เซอร์ไพรส์มาแล้ว~ 💕';
                    setTimeout(() => {
                        goToSurprise();
                    }, SURPRISE_DELAY);
                }
            }
        }
    } else if (count !== 0 && count !== target) {
        // Wrong number, reset hold
        holdStartTime = null;
    } else if (count === 0) {
        // No fingers shown, reset
        holdStartTime = null;
    }
    
    currentDetectedFingers = count;
}

/* ===== SURPRISE SCENE ===== */
async function goToSurprise() {
    currentState = STATE.SURPRISE;
    
    // Fade out gesture
    els.gestureScene.classList.add('fade-out');
    
    setTimeout(async () => {
        els.gestureScene.classList.remove('active', 'fade-out');
        els.surpriseScene.classList.add('active', 'fade-in');
        
        // Start all surprise effects
        startConfetti();
        startFloatingHearts();
        startSparkles();
        initLottieCharacters();
        initPhotoGallery();
        initSecretHeart();
        initMusic();
        
        // Fade-in title lines
        if (els.surpriseTitle) {
            els.surpriseTitle.innerHTML = `
                <span class="title-line" style="opacity:0;animation:fadeInDown 0.8s 0.2s ease forwards">Happy</span>
                <span class="title-line" style="opacity:0;animation:fadeInDown 0.8s 0.6s ease forwards">2 Years 3 Months</span>
            `;
        }
    }, 500);
}

/* ===== PARTICLE EFFECTS ===== */
function startConfetti() {
    const shapes = ['💖', '✨', '🌸', '🎀', '🌟', '💕', '🎉', '🎊'];
    const colors = ['#FF8FA3', '#C7CEEA', '#B5EAD7', '#FFDAC1', '#FFD1DC', '#E6E6FA'];
    
    function createConfetti() {
        if (currentState !== STATE.SURPRISE) return;
        
        const el = document.createElement('div');
        el.className = 'confetti';
        el.textContent = shapes[Math.floor(Math.random() * shapes.length)];
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (3 + Math.random() * 4) + 's';
        el.style.fontSize = (1 + Math.random() * 1.5) + 'rem';
        el.style.color = colors[Math.floor(Math.random() * colors.length)];
        els.confettiContainer.appendChild(el);
        
        setTimeout(() => el.remove(), 7000);
    }
    
    // Burst at start
    for (let i = 0; i < 30; i++) {
        setTimeout(createConfetti, i * 50);
    }
    
    // Continuous
    setInterval(() => {
        if (currentState === STATE.SURPRISE) createConfetti();
    }, 300);
}

function startFloatingHearts() {
    const hearts = ['💖', '💕', '💗', '💝', '💘', '🩷'];
    
    function createHeart() {
        if (currentState !== STATE.SURPRISE) return;
        
        const el = document.createElement('div');
        el.className = 'floating-heart';
        el.textContent = hearts[Math.floor(Math.random() * hearts.length)];
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (6 + Math.random() * 6) + 's';
        el.style.fontSize = (1.2 + Math.random() * 1.5) + 'rem';
        els.floatingHearts.appendChild(el);
        
        setTimeout(() => el.remove(), 12000);
    }
    
    setInterval(() => {
        if (currentState === STATE.SURPRISE) createHeart();
    }, 500);
}

function startSparkles() {
    function createSparkle() {
        if (currentState !== STATE.SURPRISE) return;
        
        const el = document.createElement('div');
        el.className = 'sparkle';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.top = Math.random() * 100 + 'vh';
        el.style.animationDuration = (1.5 + Math.random() * 2) + 's';
        el.style.background = ['#FFD1DC', '#C7CEEA', '#B5EAD7', '#FFDAC1'][Math.floor(Math.random() * 4)];
        els.sparkles.appendChild(el);
        
        setTimeout(() => el.remove(), 4000);
    }
    
    setInterval(() => {
        if (currentState === STATE.SURPRISE) createSparkle();
    }, 200);
}

function createGestureParticles() {
    const colors = ['#FFD1DC', '#E6E6FA', '#B5EAD7', '#FFDAC1', '#C7CEEA'];
    
    function createParticle() {
        if (currentState !== STATE.GESTURE) return;
        
        const el = document.createElement('div');
        el.className = 'floating-particle';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.width = (4 + Math.random() * 12) + 'px';
        el.style.height = el.style.width;
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        el.style.animationDuration = (8 + Math.random() * 10) + 's';
        els.gestureParticles.appendChild(el);
        
        setTimeout(() => el.remove(), 18000);
    }
    
    setInterval(() => {
        if (currentState === STATE.GESTURE) createParticle();
    }, 800);
}

/* ===== LOTTIE CHARACTERS ===== */
function initLottieCharacters() {
    // Characters are now pure CSS emoji with no external Lottie loading
    // All animations are defined in style.css
    console.log('[Characters] Cute emoji characters ready!');
}

/* ===== TYPEWRITER EFFECT ===== */
function typewriterEffect(element, text, speed = 100) {
    return new Promise((resolve) => {
        if (!element) { resolve(); return; }
        element.innerHTML = '';
        const cursor = document.createElement('span');
        cursor.className = 'typewriter-cursor';
        element.appendChild(cursor);
        
        let i = 0;
        function type() {
            if (i < text.length) {
                cursor.before(text.charAt(i));
                i++;
                setTimeout(type, speed);
            } else {
                cursor.remove();
                resolve();
            }
        }
        type();
    });
}

/* ===== FILM STRIP GALLERY ===== */
const PHOTO_LIST = [
    'image/103603_0.jpg',
    'image/103604_0.jpg',
    'image/103605_0.jpg',
    'image/103606_0.jpg',
    'image/103607_0.jpg',
    'image/103608_0.jpg',
    'image/103609_0.jpg',
    'image/103610_0.jpg',
    'image/103611_0.jpg',
];

function initPhotoGallery() {
    const track = document.getElementById('film-track');
    if (!track) return;
    track.innerHTML = '';

    // Build TWO sets of frames for seamless infinite loop
    function buildSet() {
        const frag = document.createDocumentFragment();
        PHOTO_LIST.forEach((src, i) => {
            const frame = document.createElement('div');
            frame.className = 'film-frame';
            frame.dataset.index = i;

            const img = document.createElement('img');
            img.src = src;
            img.alt = 'memory ' + (i + 1);
            img.loading = 'lazy';

            frame.appendChild(img);
            frag.appendChild(frame);
        });
        return frag;
    }

    track.appendChild(buildSet());
    track.appendChild(buildSet()); // duplicate for seamless loop

    // Click any frame -> open lightbox
    track.addEventListener('click', (e) => {
        const frame = e.target.closest('.film-frame');
        if (!frame) return;
        openLightbox(parseInt(frame.dataset.index));
    });
}

/* ===== LIGHTBOX ===== */
let lightboxIndex = 0;

function openLightbox(index) {
    lightboxIndex = ((index % PHOTO_LIST.length) + PHOTO_LIST.length) % PHOTO_LIST.length;
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    const counter = document.getElementById('lightbox-counter');
    if (!lb || !img) return;

    img.src = PHOTO_LIST[lightboxIndex];
    counter.textContent = (lightboxIndex + 1) + ' / ' + PHOTO_LIST.length;
    lb.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (lb) lb.classList.remove('active');
    document.body.style.overflow = '';
}

function lightboxNav(dir) {
    lightboxIndex = ((lightboxIndex + dir) + PHOTO_LIST.length) % PHOTO_LIST.length;
    const img = document.getElementById('lightbox-img');
    const counter = document.getElementById('lightbox-counter');
    img.style.opacity = '0';
    setTimeout(() => {
        img.src = PHOTO_LIST[lightboxIndex];
        counter.textContent = (lightboxIndex + 1) + ' / ' + PHOTO_LIST.length;
        img.style.opacity = '1';
    }, 150);
}

function initLightbox() {
    document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
    document.getElementById('lightbox-backdrop').addEventListener('click', closeLightbox);
    document.getElementById('lightbox-prev').addEventListener('click', () => lightboxNav(-1));
    document.getElementById('lightbox-next').addEventListener('click', () => lightboxNav(1));
    document.addEventListener('keydown', (e) => {
        const lb = document.getElementById('lightbox');
        if (!lb || !lb.classList.contains('active')) return;
        if (e.key === 'ArrowLeft') lightboxNav(-1);
        if (e.key === 'ArrowRight') lightboxNav(1);
        if (e.key === 'Escape') closeLightbox();
    });
}

/* ===== BACKGROUND MUSIC ===== */
function initMusic() {
    const bgm = document.getElementById('bgm');
    const btn = document.getElementById('music-btn');
    if (!bgm || !btn) return;

    // Fade in from volume 0
    bgm.volume = 0;
    bgm.play().then(() => {
        let vol = 0;
        const fade = setInterval(() => {
            vol = Math.min(vol + 0.05, 0.6);
            bgm.volume = vol;
            if (vol >= 0.6) clearInterval(fade);
        }, 150);
    }).catch(() => {
        // Autoplay blocked - show button so user can tap to start
    });

    btn.classList.add('visible');

    btn.addEventListener('click', () => {
        if (bgm.paused) {
            bgm.play();
            btn.textContent = '🎵';
            btn.classList.remove('muted');
        } else {
            bgm.pause();
            btn.textContent = '🔇';
            btn.classList.add('muted');
        }
    });
}

/* ===== SECRET HEART ===== */
function initSecretHeart() {
    if (!els.secretHeart || !els.secretMessageCard || !els.secretClose) return;
    
    els.secretHeart.addEventListener('click', () => {
        els.secretHeart.classList.add('opened');
        els.secretMessageCard.classList.add('show');
    });
    
    els.secretClose.addEventListener('click', () => {
        els.secretMessageCard.classList.remove('show');
        setTimeout(() => {
            els.secretHeart.classList.remove('opened');
        }, 300);
    });
}

/* ===== FINGER TRAIL ===== */
let trailParticles = [];

function updateFingerTrail(landmarks) {
    if (!els.trailCanvas) return;
    const canvas = els.trailCanvas;
    const ctx = canvas.getContext('2d');
    
    // Match canvas size to webcam
    const w = els.webcam.videoWidth || 320;
    const h = els.webcam.videoHeight || 240;
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
    }
    
    // Get index finger tip (landmark 8)
    const tip = landmarks[8];
    if (!tip) return;
    
    // Add new particle at finger tip (scaleX(-1) is applied via CSS, so we flip x)
    trailParticles.push({
        x: (1 - tip.x) * canvas.width,
        y: tip.y * canvas.height,
        life: 1.0,
        size: 3 + Math.random() * 4,
        color: ['#FFD1DC', '#C7CEEA', '#B5EAD7', '#FFDAC1'][Math.floor(Math.random() * 4)]
    });
}

function drawTrail() {
    if (!els.trailCanvas || currentState !== STATE.GESTURE) {
        trailParticles = [];
        return;
    }
    
    const canvas = els.trailCanvas;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = trailParticles.length - 1; i >= 0; i--) {
        const p = trailParticles[i];
        p.life -= 0.03;
        
        if (p.life <= 0) {
            trailParticles.splice(i, 1);
            continue;
        }
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 0.7;
        ctx.fill();
        
        // Glow effect
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life * 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 0.2;
        ctx.fill();
    }
    
    ctx.globalAlpha = 1;
    requestAnimationFrame(drawTrail);
}

/* ===== SCENE TRANSITIONS ===== */
function goToCameraRequest() {
    currentState = STATE.CAMERA_REQUEST;
    showScreen(els.cameraScreen);
}

function goToGesture() {
    currentState = STATE.GESTURE;
    showScreen(els.gestureScene);
    // Activate first step guide
    const s1 = document.getElementById('step-1');
    if (s1) s1.classList.add('active');
    
    // Start gesture particles
    createGestureParticles();
    
    // Initialize MediaPipe and camera
    initMediaPipe()
        .then(() => startCamera())
        .then(() => {
        })
        .catch((err) => {
            goToFallback();
        });
}

function goToFallback() {
    currentState = STATE.FALLBACK;
    showScreen(els.fallbackScreen);
}

async function goToSurpriseFromFallback() {
    els.fallbackScreen.classList.add('fade-out');
    setTimeout(async () => {
        els.fallbackScreen.classList.remove('active', 'fade-out');
        els.surpriseScene.classList.add('active', 'fade-in');
        currentState = STATE.SURPRISE;
        startConfetti();
        startFloatingHearts();
        startSparkles();
        initLottieCharacters();
        initPhotoGallery();
        initSecretHeart();
        initMusic();
        
        if (els.surpriseTitle) {
            els.surpriseTitle.innerHTML = `
                <span class="title-line" style="opacity:0;animation:fadeInDown 0.8s 0.2s ease forwards">Happy</span>
                <span class="title-line" style="opacity:0;animation:fadeInDown 0.8s 0.6s ease forwards">2 Years 3 Months</span>
            `;
        }
    }, 500);
}

/* ===== INITIALIZATION ===== */
function init() {
    // Start finger trail animation loop
    requestAnimationFrame(drawTrail);
    
    // Lightbox
    initLightbox();

    // Button events
    els.startCameraBtn.addEventListener('click', () => {
        goToGesture();
    });
    
    els.fallbackBtn.addEventListener('click', () => {
        goToSurpriseFromFallback();
    });
    
    // Start sequence
    setTimeout(() => {
        els.loadingScreen.classList.add('fade-out');
        setTimeout(() => {
            els.loadingScreen.classList.remove('active');
            goToCameraRequest();
        }, 500);
    }, 1500);
}

// Start on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
