"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./LandingPage.module.css";

/* ── Floating ember particle ─────────────────────────────────────── */
function Ember({ i }) {
  const x   = ((i * 137.508) % 100);
  const sz  = 2 + (i % 4) * 1.4;
  const dur = 6 + (i % 7) * 2.2;
  const del = (i * 0.55) % dur;
  return (
    <motion.div
      className={styles.ember}
      style={{ left: `${x}%`, width: sz, height: sz }}
      animate={{ y: ["0%", "-55vh"], opacity: [0, 0.85, 0], scale: [1, 0.6, 0.2] }}
      transition={{ duration: dur, delay: del, repeat: Infinity, ease: "easeOut" }}
    />
  );
}

/* ── Animated skull SVG ──────────────────────────────────────────── */
function SkullHero() {
  return (
    <motion.div
      className={styles.skullWrap}
      initial={{ opacity: 0, scale: 0.7, y: 40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
    >
      <motion.svg
        viewBox="0 0 220 260"
        className={styles.skullSvg}
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <radialGradient id="skullGrad" cx="50%" cy="38%" r="52%">
            <stop offset="0%" stopColor="#e06070"/>
            <stop offset="45%" stopColor="#c0394d"/>
            <stop offset="100%" stopColor="#5a0d1a"/>
          </radialGradient>
          <radialGradient id="eyeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff4060"/>
            <stop offset="70%" stopColor="#c0394d"/>
            <stop offset="100%" stopColor="#6b0d1a"/>
          </radialGradient>
          <radialGradient id="glowRad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c0394d" stopOpacity="0.6"/>
            <stop offset="100%" stopColor="#c0394d" stopOpacity="0"/>
          </radialGradient>
          <filter id="skullGlow">
            <feGaussianBlur stdDeviation="4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="eyeGlow">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Ambient glow behind skull */}
        <ellipse cx="110" cy="140" rx="90" ry="80" fill="url(#glowRad)" opacity="0.5"/>

        {/* Left horn */}
        <path d="M58 30 C48 8 62 -5 72 10 C78 25 74 52 70 68 C66 50 62 32 58 30Z"
          fill="url(#skullGrad)" filter="url(#skullGlow)"/>
        <path d="M60 30 C55 14 64 5 70 16 C73 26 71 46 68 60 C65 46 62 32 60 30Z"
          fill="#e06070" opacity="0.35"/>

        {/* Right horn */}
        <path d="M162 30 C172 8 158 -5 148 10 C142 25 146 52 150 68 C154 50 158 32 162 30Z"
          fill="url(#skullGrad)" filter="url(#skullGlow)"/>
        <path d="M160 30 C165 14 156 5 150 16 C147 26 149 46 152 60 C155 46 158 32 160 30Z"
          fill="#e06070" opacity="0.35"/>

        {/* Cranium */}
        <ellipse cx="110" cy="115" rx="72" ry="66" fill="url(#skullGrad)" filter="url(#skullGlow)"/>

        {/* Zygomatic arches */}
        <path d="M40 138 C36 155 40 172 50 182 L56 180 C47 170 42 158 44 144Z"
          fill="#c0394d" opacity="0.7"/>
        <path d="M180 138 C184 155 180 172 170 182 L164 180 C173 170 178 158 176 144Z"
          fill="#c0394d" opacity="0.7"/>

        {/* Jaw / chin */}
        <path d="M62 168 Q110 190 158 168 L155 205 Q110 220 65 205Z"
          fill="#8b1a28"/>
        <path d="M62 168 Q110 184 158 168" fill="none" stroke="#c0394d" strokeWidth="1.5" strokeOpacity="0.4"/>

        {/* Upper teeth */}
        <rect x="76"  y="185" width="10" height="16" rx="3" fill="#f0eaf5" opacity="0.92"/>
        <rect x="90"  y="184" width="10" height="19" rx="3" fill="#f0eaf5" opacity="0.95"/>
        <rect x="104" y="184" width="10" height="19" rx="3" fill="#f0eaf5" opacity="0.95"/>
        <rect x="118" y="184" width="10" height="16" rx="3" fill="#f0eaf5" opacity="0.92"/>
        <rect x="132" y="185" width="9"  height="14" rx="3" fill="#f0eaf5" opacity="0.80"/>
        <rect x="68"  y="186" width="8"  height="13" rx="3" fill="#f0eaf5" opacity="0.75"/>

        {/* Nasal cavity */}
        <path d="M97 118 L110 104 L123 118 L120 134 L100 134Z" fill="#3a0810" opacity="0.9"/>

        {/* Left eye socket */}
        <ellipse cx="77" cy="108" rx="24" ry="22" fill="#1a0308" opacity="0.95"/>
        <ellipse cx="77" cy="108" rx="17" ry="16" fill="url(#eyeGrad)" filter="url(#eyeGlow)"/>
        <ellipse cx="77" cy="108" rx="7"  ry="15" fill="#07060b"/>
        {/* Eye shine */}
        <ellipse cx="72" cy="101" rx="3.5" ry="5" fill="rgba(255,255,255,0.28)" transform="rotate(-12,72,101)"/>
        <ellipse cx="71" cy="100" rx="1.2" ry="1.8" fill="rgba(255,255,255,0.55)" transform="rotate(-12,71,100)"/>

        {/* Right eye socket */}
        <ellipse cx="143" cy="108" rx="24" ry="22" fill="#1a0308" opacity="0.95"/>
        <ellipse cx="143" cy="108" rx="17" ry="16" fill="url(#eyeGrad)" filter="url(#eyeGlow)"/>
        <ellipse cx="143" cy="108" rx="7"  ry="15" fill="#07060b"/>
        {/* Eye shine */}
        <ellipse cx="138" cy="101" rx="3.5" ry="5" fill="rgba(255,255,255,0.28)" transform="rotate(-12,138,101)"/>
        <ellipse cx="137" cy="100" rx="1.2" ry="1.8" fill="rgba(255,255,255,0.55)" transform="rotate(-12,137,100)"/>

        {/* Skull cracks */}
        <path d="M110 50 L108 70 L112 88 L109 105" fill="none" stroke="rgba(90,13,26,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M85 75 L92 90 L88 102" fill="none" stroke="rgba(90,13,26,0.4)" strokeWidth="1" strokeLinecap="round"/>
        <path d="M135 80 L128 94" fill="none" stroke="rgba(90,13,26,0.4)" strokeWidth="1" strokeLinecap="round"/>
      </motion.svg>

      {/* Pulsing glow beneath skull */}
      <motion.div
        className={styles.skullGlow}
        animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.9, 1.05, 0.9] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

/* ── Dialogue lines — typewriter ─────────────────────────────────── */
const LINES = [
  { text: "You shouldn’t be here. And yet… here you are.", delay: 0 },
  { text: "Thousands of anime await you in the dark. Some have already claimed your kind.", delay: 2400 },
  { text: "They sat down for one episode. They never left.", delay: 5200 },
  { text: "I can feel your resolve weakening already.", delay: 7600 },
  { text: "Good. The abyss is patient. It has always been patient.", delay: 9400 },
];

function TypewriterLine({ text, delay, onDone }) {
  const [displayed, setDisplayed] = useState("");
  const [started,   setStarted]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); onDone?.(); }
    }, 36);
    return () => clearInterval(iv);
  }, [started, text, onDone]);

  if (!started && !displayed) return null;

  return (
    <motion.p
      className={styles.dialogueLine}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {displayed}
      {displayed.length < text.length && <span className={styles.cursor}>|</span>}
    </motion.p>
  );
}

/* ── Main landing page ───────────────────────────────────────────── */
export default function LandingPage() {
  const router   = useRouter();
  const [done,   setDone]   = useState(false);
  const [linesShown, setLinesShown] = useState(0);
  const [leaving, setLeaving] = useState(false);

  // After last line completes, show CTA
  const totalLines = LINES.length;
  // Last line delay + ~3s for it to type out
  const lastLineEnd = LINES[LINES.length - 1].delay + LINES[LINES.length - 1].text.length * 36 + 600;
  useEffect(() => {
    const t = setTimeout(() => setDone(true), lastLineEnd);
    return () => clearTimeout(t);
  }, [lastLineEnd]);

  function enter() {
    setLeaving(true);
    // Mark as seen so home page doesn't redirect back
    try { sessionStorage.setItem("animedex_entered", "1"); } catch {}
    setTimeout(() => router.push("/"), 900);
  }

  function skip() {
    try { sessionStorage.setItem("animedex_entered", "1"); } catch {}
    router.push("/");
  }

  return (
    <AnimatePresence>
      {!leaving ? (
        <motion.div
          className={styles.page}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.8 }}
        >
          {/* Ambient embers */}
          <div className={styles.embers} aria-hidden>
            {Array.from({ length: 18 }, (_, i) => <Ember key={i} i={i} />)}
          </div>

          {/* Radial bg glow */}
          <div className={styles.radialGlow} />
          <div className={styles.radialGlow2} />

          {/* Skip button */}
          <motion.button
            className={styles.skipBtn}
            onClick={skip}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            Skip ↓
          </motion.button>

          {/* Content */}
          <div className={styles.content}>
            {/* Skull */}
            <SkullHero />

            {/* Title */}
            <motion.div
              className={styles.titleBlock}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className={styles.titleEyebrow}>Welcome to</p>
              <h1 className={styles.title}>
                <span className={styles.titleAnime}>Anime</span><span className={styles.titleDex}>Dex</span>
              </h1>
            </motion.div>

            {/* Dialogue box */}
            <motion.div
              className={styles.dialogueBox}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.6 }}
            >
              <div className={styles.speakerTag}>
                <span className={styles.speakerDot} />
                Unknown Entity
              </div>
              <div className={styles.dialogueLines}>
                {LINES.map((line, i) => (
                  <TypewriterLine
                    key={i}
                    text={line.text}
                    delay={line.delay + 1600}
                    onDone={i === totalLines - 1 ? () => {} : undefined}
                  />
                ))}
              </div>
            </motion.div>

            {/* CTA */}
            <AnimatePresence>
              {done && (
                <motion.div
                  className={styles.ctaBlock}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.button
                    className={styles.enterBtn}
                    onClick={enter}
                    whileHover={{ scale: 1.06, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    animate={{ boxShadow: ["0 4px 24px rgba(192,57,77,0.35)", "0 8px 48px rgba(192,57,77,0.65)", "0 4px 24px rgba(192,57,77,0.35)"] }}
                    transition={{ boxShadow: { duration: 2, repeat: Infinity } }}
                  >
                    Enter the Abyss
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                    </svg>
                  </motion.button>
                  <p className={styles.ctaNote}>No account needed. No soul required.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom red light streak */}
          <div className={styles.bottomStreak} />
        </motion.div>
      ) : (
        <motion.div
          key="leaving"
          className={styles.leavingOverlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
      )}
    </AnimatePresence>
  );
}
