"use client";
let context: AudioContext | null = null;
export async function unlockChime() {
  context ??= new AudioContext();
  await context.resume();
  if(context.state !== "running") throw new Error("Tap Enable sound again to allow audio in this browser.");
}
export function soundReady() { return context?.state === "running"; }
export function playChime() {
  if(!context || context.state !== "running") return false;
  const now=context.currentTime;
  for(const [frequency,delay] of [[880,0],[1320,0.16]]) {
    const oscillator=context.createOscillator(), gain=context.createGain();
    oscillator.type="sine";oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0.0001,now+delay);
    gain.gain.exponentialRampToValueAtTime(0.16,now+delay+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+delay+0.65);
    oscillator.connect(gain);gain.connect(context.destination);
    oscillator.start(now+delay);oscillator.stop(now+delay+0.7);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  return true;
}
/** Web Locks serializes claim + playback across tabs. Without it, focused tab only. */
export async function chimeOnce(userId: string, messageId: string) {
  const key=`mc-chat-heard:${userId}`;
  const claim=()=>{
    if(document.visibilityState !== "visible" || !soundReady()) return;
    try {
      const heard=JSON.parse(localStorage.getItem(key) || "[]") as string[];
      if(heard.includes(messageId)) return;
      localStorage.setItem(key,JSON.stringify([...heard.slice(-199),messageId]));
      if(!playChime()) localStorage.setItem(key,JSON.stringify(heard));
    } catch { /* Storage unavailable: don't risk sounding the same message in several tabs. */ }
  };
  if(navigator.locks) await navigator.locks.request(key,claim);
  else if(document.hasFocus()) claim();
}

/** Distinct, louder attendance bell; output still obeys the device volume. */
export function playAttendanceChime() {
  if (!context || context.state !== "running") return false;
  const now = context.currentTime;
  for (const [frequency, delay] of [[880,0],[1320,0.45],[880,0.9],[1320,1.35]]) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type="sine";oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0.0001,now+delay);
    gain.gain.exponentialRampToValueAtTime(0.8,now+delay+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+delay+0.4);
    oscillator.connect(gain);gain.connect(context.destination);
    oscillator.start(now+delay);oscillator.stop(now+delay+0.42);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  return true;
}
export async function attendanceChimeOnce(userId: string, reminderId: string) {
  const key=`mc-attendance-heard:${userId}`;
  const claim=()=>{
    if(document.visibilityState !== "visible" || !soundReady()) return;
    try {
      if(localStorage.getItem(key)===reminderId) return;
      localStorage.setItem(key,reminderId);
      if(!playAttendanceChime()) localStorage.removeItem(key);
    } catch { /* Do not duplicate bells if browser storage is blocked. */ }
  };
  if(navigator.locks) await navigator.locks.request(key,claim);
  else if(document.hasFocus()) claim();
}
