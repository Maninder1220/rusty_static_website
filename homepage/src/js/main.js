/*
  ==========================================================
  JAVASCRIPT ORGANIZATION MAP
  ==========================================================
  01. DOM helper functions
  02. Dynamic year
  03. Cursor glow and card hover movement
  04. Reveal-on-scroll animation
  05. Theme color palette
  06. Scroll-based wind/shimmer effects
  07. Optional sitar-like click sound
  08. Lead form validation and copy-message behavior
  09. Keyboard shortcut

  Note:
  The script does not send form data to a backend.
  It only validates input and creates a copy-ready message.
  ==========================================================
*/

// 01. Small DOM helpers to avoid repeating querySelector/querySelectorAll
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// 02. Keep footer year current automatically
$("#year").textContent = String(new Date().getFullYear());

// 03. Cursor glow: moves a soft radial highlight under the pointer
const glow = $("#cursorGlow");

window.addEventListener("pointermove", (e) => {
  glow.style.left = e.clientX + "px";
  glow.style.top = e.clientY + "px";
}, { passive: true });

// Card parallax: updates CSS variables used by .card::before highlight
$$(".card, .mini").forEach((el) => {
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;

    el.style.setProperty("--mx", ((x - 0.5) * 40).toFixed(2) + "px");
    el.style.setProperty("--my", ((y - 0.5) * 40).toFixed(2) + "px");
  }, { passive: true });
});

// 04. Reveal-on-scroll: adds .on class when elements enter viewport
const io = new IntersectionObserver((entries) => {
  for (const ent of entries) {
    if (ent.isIntersecting) {
      ent.target.classList.add("on");
    }
  }
}, { threshold: 0.12 });

$$(".reveal").forEach((el) => io.observe(el));

// 05. Theme palette: changes the CSS --hue variable on the root element
const setHue = (deg) => {
  document.documentElement.style.setProperty("--hue", deg + "deg");
};

$$(".swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    setHue(btn.dataset.hue);

    // Gentle click micro feedback
    btn.animate([
      { transform: "translateY(0) scale(1)" },
      { transform: "translateY(1px) scale(.98)" },
      { transform: "translateY(0) scale(1)" }
    ], {
      duration: 220,
      easing: "cubic-bezier(.2,.8,.2,1)"
    });
  });
});

// 06. Scroll effects: shift background positions and increase shimmer opacity while scrolling
const wind = $("#wind");
const shimmer = $("#shimmer");

let lastY = 0;

window.addEventListener("scroll", () => {
  const y = window.scrollY || 0;
  const dy = y - lastY;
  lastY = y;

  // Shift backgrounds subtly
  const xShift = (y * 0.03) % 600;
  const yShift = (y * 0.08) % 600;

  wind.style.backgroundPosition = `${xShift}px ${yShift}px`;
  shimmer.style.backgroundPosition = `${(y * 0.12) % 1200}px 0px`;

  // Wind intensity based on scroll velocity
  const v = Math.min(1, Math.abs(dy) / 40);

  wind.style.opacity = (0.25 + v * 0.35).toFixed(2);
  shimmer.style.opacity = (0.14 + v * 0.22).toFixed(2);
}, { passive: true });

/*
  07. Optional sitar-like click sound

  Browser audio starts only after user interaction.
  So sound remains off until the user presses the Sound button.

  Serious code:
  - AudioContext
  - OscillatorNode
  - BiquadFilterNode
  - GainNode
  - WaveShaperNode
  - DelayNode
*/

let audioEnabled = false;
let audioCtx = null;

const soundBtn = $("#soundBtn");
const soundLabel = $("#soundLabel");

// Create AudioContext lazily only when sound is needed
function ensureAudio(){
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  return audioCtx;
}

// Play one short pluck sound when audio is enabled
function pluckSitar(){
  if (!audioEnabled) return;

  const ctx = ensureAudio();

  if (ctx.state === "suspended") {
    ctx.resume();
  }

  const now = ctx.currentTime;

  // Main pitch: slight randomization makes repeated clicks feel more natural
  const f0 = 220 + Math.random() * 120;

  // Main oscillator approximates the plucked string
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.985, now + 0.25);

  // Second oscillator adds a light resonant overtone
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(f0 * 2.01, now);

  // Filters shape the brightness so the sound stays soft
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1400, now);
  filter.Q.setValueAtTime(0.9, now);

  const filter2 = ctx.createBiquadFilter();
  filter2.type = "highpass";
  filter2.frequency.setValueAtTime(180, now);

  // Fast attack + quick decay creates the pluck envelope
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

  // Subtle buzz character through a soft clipping waveshaper
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSoftClipCurve(0.65);
  shaper.oversample = "4x";

  // Short delay feedback gives a small room/reverb-like tail
  const delay = ctx.createDelay(1.0);
  delay.delayTime.setValueAtTime(0.035, now);

  const fb = ctx.createGain();
  fb.gain.setValueAtTime(0.28, now);

  const wet = ctx.createGain();
  wet.gain.setValueAtTime(0.22, now);

  // Low-volume noise adds an airy tail behind the pluck
  const noise = makeNoiseNode(ctx);

  const nFilter = ctx.createBiquadFilter();
  nFilter.type = "bandpass";
  nFilter.frequency.setValueAtTime(900, now);
  nFilter.Q.setValueAtTime(0.7, now);

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.0001, now);
  nGain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

  // Audio routing: oscillators -> filters -> shaper -> gain -> output
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(shaper);
  shaper.connect(filter2);
  filter2.connect(gain);

  // Delay feedback loop for the small echo tail
  gain.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);

  // Final output mix
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.95, now);

  gain.connect(out);
  wet.connect(out);

  // Add the airy noise tail to the final mix
  noise.connect(nFilter);
  nFilter.connect(nGain);
  nGain.connect(out);

  out.connect(ctx.destination);

  osc.start(now);
  osc2.start(now);
  noise.start(now);

  osc.stop(now + 0.65);
  osc2.stop(now + 0.65);
  noise.stop(now + 0.55);
}

// Build a soft clipping curve for gentle harmonic color
function makeSoftClipCurve(amount = 0.6){
  const n = 2048;
  const curve = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * (2 + amount * 6));
  }

  return curve;
}

// Create a short random-noise buffer for the airy tail
function makeNoiseNode(ctx){
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.35;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  return src;
}

soundBtn.addEventListener("click", () => {
  audioEnabled = !audioEnabled;

  soundBtn.setAttribute("aria-pressed", String(audioEnabled));
  soundLabel.textContent = audioEnabled ? "Sound: On" : "Sound: Off";

  // Play a pluck when enabling sound
  pluckSitar();
});

// Play pluck on most page clicks when sound is enabled
document.addEventListener("click", (e) => {
  // Avoid double-pluck when clicking sound button itself
  if (e.target && (e.target === soundBtn || soundBtn.contains(e.target))) {
    return;
  }

  pluckSitar();
}, { passive: true });

/*
  08. Lead form behavior

  This part:
  - validates email and WhatsApp locally
  - builds a copy-ready message
  - does not submit data to any backend

  Serious code:
  - preventDefault()
  - regex email validation
  - navigator.clipboard.writeText()
  - fallback copy using temporary textarea
*/

const leadForm = $("#leadForm");
const okBox = $("#okBox");
const copyBtn = $("#copyBtn");

let lastMessage = "";

// Clean user input before building the copy-ready message
function sanitize(s){
  return String(s || "").replace(/[\r\n\t]+/g, " ").trim();
}

// Convert form values into a professional message format
function buildMessage({ name, email, whatsapp, message }){
  const lines = [];

  lines.push("Hello frndsnfamily.com,");
  lines.push("");
  lines.push("I’m looking for digital marketing advice. Please share meeting details.");
  lines.push("");

  if (name) {
    lines.push(`Name: ${name}`);
  }

  lines.push(`Email: ${email}`);
  lines.push(`WhatsApp: ${whatsapp}`);

  if (message) {
    lines.push(`Need help with: ${message}`);
  }

  lines.push("");
  lines.push("Thanks,");
  lines.push(name || "");

  return lines.filter(Boolean).join("\n");
}

leadForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = sanitize($("#name").value);
  const email = sanitize($("#email").value);
  const whatsapp = sanitize($("#whatsapp").value);
  const message = sanitize($("#message").value);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    okBox.style.display = "block";
    okBox.textContent = "Please enter a valid email.";
    okBox.animate([
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], {
      duration: 220,
      easing: "cubic-bezier(.2,.8,.2,1)"
    });
    return;
  }

  if (!whatsapp || whatsapp.length < 8) {
    okBox.style.display = "block";
    okBox.textContent = "Please enter a valid WhatsApp number. Include country code.";
    okBox.animate([
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" }
    ], {
      duration: 220,
      easing: "cubic-bezier(.2,.8,.2,1)"
    });
    return;
  }

  lastMessage = buildMessage({ name, email, whatsapp, message });

  okBox.style.display = "block";
  okBox.textContent = "Thanks. Your details are captured locally in this page. Click ‘Copy message’ to copy a ready-to-send note.";
  okBox.animate([
    { opacity: 0, transform: "translateY(6px)" },
    { opacity: 1, transform: "translateY(0)" }
  ], {
    duration: 260,
    easing: "cubic-bezier(.2,.8,.2,1)"
  });

  // Small UX feedback: bounce the copy button
  copyBtn.animate([
    { transform: "translateY(0)" },
    { transform: "translateY(-2px)" },
    { transform: "translateY(0)" }
  ], {
    duration: 260,
    easing: "cubic-bezier(.2,.8,.2,1)"
  });

  // Keep confirmation visible after submit
  okBox.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
});

copyBtn.addEventListener("click", async () => {
  if (!lastMessage) {
    lastMessage = buildMessage({
      name: sanitize($("#name").value),
      email: sanitize($("#email").value),
      whatsapp: sanitize($("#whatsapp").value),
      message: sanitize($("#message").value)
    });
  }

  try {
    await navigator.clipboard.writeText(lastMessage);

    okBox.style.display = "block";
    okBox.textContent = "Copied. Paste it into email or WhatsApp to request meeting details.";
  } catch (err) {
    // Fallback for older browsers where Clipboard API may fail
    const ta = document.createElement("textarea");

    ta.value = lastMessage;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";

    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);

    okBox.style.display = "block";
    okBox.textContent = "Copied. Paste it into email or WhatsApp to request meeting details.";
  }

  okBox.animate([
    { opacity: 0, transform: "translateY(4px)" },
    { opacity: 1, transform: "translateY(0)" }
  ], {
    duration: 220,
    easing: "cubic-bezier(.2,.8,.2,1)"
  });

  pluckSitar();
});

/*
  09. Keyboard shortcut

  Press "C" to cycle through theme palettes.
*/

const hues = [0, 210, 140, 300];
let hueIdx = 0;

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "c") {
    hueIdx = (hueIdx + 1) % hues.length;
    setHue(hues[hueIdx]);
    pluckSitar();
  }
});

// First paint: reveal visible sections quickly without waiting for scroll
requestAnimationFrame(() => {
  $$(".reveal").forEach((el, i) => {
    setTimeout(() => el.classList.add("on"), 120 + i * 60);
  });
});