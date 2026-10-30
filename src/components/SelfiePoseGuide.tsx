import {SELFIE_THEMES,type SelfieThemeKey} from "@/lib/selfieThemes";
const skin="#e8b18e",outline="#663e36";
function VHand({x,y,flip=false}:{x:number;y:number;flip?:boolean}){return <g transform={`translate(${x} ${y}) scale(${flip?-1:1} 1)`} stroke={outline} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill={skin}><path d="M-14 24 L-17 4 L-27 -28 Q-29 -37 -23 -38 Q-18 -38 -16 -31 L-6 -5 L-1 -37 Q0 -45 6 -43 Q11 -42 9 -33 L6 4 Q16 -2 19 5 L20 19 Q17 31 5 33 L-6 33Z"/><path d="M6 4 L-3 15 M15 7 L6 18 M-13 11 Q-4 5 2 15 L-2 21" fill="none"/></g>;}
function MiniHeart({x,y,scale=1}:{x:number;y:number;scale?:number}){return <g transform={`translate(${x} ${y}) scale(${scale})`} stroke={outline} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill={skin}><path d="M-16 35 L-20 10 Q-22 1 -15 0 Q-9 0 -7 9 Q-11 -2 -4 -5 Q3 -7 5 3 Q2 -9 10 -9 Q17 -9 17 2 L17 24 Q16 36 4 40Z"/><path d="M7 15 L-8 -18 Q-12 -27 -6 -30 Q0 -32 4 -24 L21 9"/><path d="M-16 24 Q-19 13 -10 8 L15 -18 Q22 -25 27 -19 Q31 -14 24 -8 L4 16"/><path d="M-16 8 L-11 18 M-5 5 L-1 14 M7 4 L10 10" fill="none"/></g>;}
function HeartHands({x,y,scale=1}:{x:number;y:number;scale?:number}){return <g transform={`translate(${x} ${y}) scale(${scale})`} stroke={outline} strokeWidth="3" strokeLinejoin="round" fill={skin}>
 <path d="M-87 30 L-58 22 Q-54 0 -47 -17 Q-38 -40 -20 -37 Q-9 -36 0 -22 L0 -9 Q-11 -22 -22 -24 Q-34 -25 -38 -8 L-42 15 L0 49 Q3 55 -2 58 Q-7 61 -12 56 L-54 32 L-84 44Z"/>
 <path d="M87 30 L58 22 Q54 0 47 -17 Q38 -40 20 -37 Q9 -36 0 -22 L0 -9 Q11 -22 22 -24 Q34 -25 38 -8 L42 15 L0 49 Q-3 55 2 58 Q7 61 12 56 L54 32 L84 44Z"/>
 <path d="M-58 22 L-50 11 M58 22 L50 11" fill="none"/>
 </g>;}
export function PoseIllustration({theme}:{theme:SelfieThemeKey}){
 return <svg viewBox="0 0 440 330" role="img" aria-label={`${SELFIE_THEMES[theme].name}: ${SELFIE_THEMES[theme].instruction}`} className="w-full rounded-xl bg-[#fff8f0]">
 <rect width="440" height="330" rx="20" fill="#fff8f0"/>
 <circle cx="220" cy="139" r="108" fill="#fce7de"/>
 <path d="M143 315 L151 241 Q160 204 198 201 L242 201 Q280 204 289 241 L297 315Z" fill="#557b72"/>
 <path d="M202 178 L202 209 Q220 225 238 209 L238 178" fill={skin} stroke={outline} strokeWidth="2"/>
 <ellipse cx="220" cy="132" rx="44" ry="55" fill={skin} stroke={outline} strokeWidth="2"/>
 <path d="M177 122 Q164 67 215 69 Q271 65 264 126 L253 112 Q237 112 223 92 Q209 112 181 111Z" fill="#342c30"/>
 <path d="M199 132 L207 132 M233 132 L241 132" stroke="#342c30" strokeWidth="4" strokeLinecap="round"/>
 <path d="M220 137 L216 149 L222 150 M206 161 Q220 172 234 161" fill="none" stroke={outline} strokeWidth="2.5" strokeLinecap="round"/>
 {theme==="BUNNY"&&<><path d="M163 241 L124 188 L122 143 M277 241 L316 188 L318 143" fill="none" stroke={outline} strokeWidth="23" strokeLinecap="round"/><path d="M163 241 L124 188 L122 143 M277 241 L316 188 L318 143" fill="none" stroke={skin} strokeWidth="18" strokeLinecap="round"/><VHand x={119} y={108}/><VHand x={321} y={108} flip/></>}
 {theme==="POWER"&&<><path d="M159 225 L92 202 L95 131 M281 225 L348 202 L345 131" fill="none" stroke={outline} strokeWidth="32" strokeLinejoin="round" strokeLinecap="round"/><path d="M159 225 L92 202 L95 131 M281 225 L348 202 L345 131" fill="none" stroke={skin} strokeWidth="26" strokeLinejoin="round" strokeLinecap="round"/>{[95,345].map(x=><g key={x} stroke={outline} strokeWidth="2" fill={skin}><rect x={x-16} y="100" width="32" height="36" rx="10"/><path d={`M${x-10} 110v9 m7 -9v9 m7 -9v9 M${x+13} 124l-15 2`} fill="none"/></g>)}</>}
 {theme==="MINI_HEART"&&<><path d="M280 245 Q319 216 307 170" fill="none" stroke={outline} strokeWidth="22" strokeLinecap="round"/><path d="M280 245 Q319 216 307 170" fill="none" stroke={skin} strokeWidth="17" strokeLinecap="round"/><MiniHeart x={306} y={145}/></>}
 {theme==="SPREAD_LOVE"&&<><path d="M159 242 L146 280 L183 263 M281 242 L294 280 L257 263" fill="none" stroke={skin} strokeWidth="21" strokeLinecap="round"/><HeartHands x={220} y={240} scale={.72}/></>}
 </svg>;
}
export default function SelfiePoseGuide({theme}:{theme:SelfieThemeKey}){const t=SELFIE_THEMES[theme];return <section className="space-y-3 rounded-2xl border border-border bg-surface p-4"><h3 className="text-lg font-semibold">{t.name}</h3><PoseIllustration theme={theme}/><p className="font-medium">{t.instruction}</p>
 {(theme==="MINI_HEART"||theme==="SPREAD_LOVE")&&<div className="rounded-xl bg-[#fff8f0] p-3"><p className="text-sm font-semibold text-[#663e36]">Finger close-up</p><svg viewBox="0 0 320 180" className="w-full max-h-48" role="img" aria-label={theme==="MINI_HEART"?"Thumb crosses the index finger near the tips; the other fingers are curled.":"Curve both index fingers into the top lobes and join thumbs at the bottom to outline a heart."}>
 {theme==="MINI_HEART"?<><MiniHeart x={160} y={80} scale={1.7}/><text x="14" y="35" fontSize="13" fill={outline}>Index finger</text><path d="M89 39 L144 26" stroke={outline}/><text x="230" y="60" fontSize="13" fill={outline}>Thumb</text><path d="M225 64 L191 74" stroke={outline}/></>:<><HeartHands x={160} y={75} scale={1.1}/><text x="160" y="17" textAnchor="middle" fontSize="12" fill={outline}>Curved fingers form the top</text><text x="160" y="169" textAnchor="middle" fontSize="12" fill={outline}>Thumbs meet at the bottom</text></>}
 </svg></div>}
 <p className="text-sm text-foreground/65">{t.tip} Keep your face uncovered. You can follow the example on either side.</p></section>;}
