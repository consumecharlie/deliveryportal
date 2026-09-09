/**
 * The "Powering Up" window from the sign-in art, centered on the empty
 * desktop for the boot moment. The SVG is the one from
 * `src/components/arcade-background.tsx` (static lights, same 10-segment bar).
 */
export function BootScreen() {
  return (
    <div className="portal-boot" role="status" aria-label="Powering up">
      <svg width="280" height="176" viewBox="0 0 224 141" fill="none" aria-hidden="true" focusable="false">
        <rect width="212" height="130" transform="translate(12 11)" fill="#151919" />
        <path d="M17 11.5H219C221.485 11.5 223.5 13.5147 223.5 16V42.5H12.5V16C12.5 13.5147 14.5147 11.5 17 11.5Z" fill="#151919" />
        <path d="M17 11.5H219C221.485 11.5 223.5 13.5147 223.5 16V42.5H12.5V16C12.5 13.5147 14.5147 11.5 17 11.5Z" stroke="#F4FBF6" />
        <circle cx="27" cy="27" r="6.5" stroke="white" />
        <circle cx="46" cy="27" r="6.5" stroke="white" />
        <circle cx="65" cy="27" r="6.5" stroke="white" />
        <path d="M223.5 42.5V136C223.5 138.485 221.485 140.5 219 140.5H17C14.5147 140.5 12.5 138.485 12.5 136V42.5H223.5Z" stroke="#F4FBF6" />

        <rect width="212" height="130" fill="#151919" />
        <path d="M5 0.5H207C209.485 0.5 211.5 2.51472 211.5 5V31.5H0.5V5C0.5 2.51472 2.51472 0.5 5 0.5Z" fill="#151919" />
        <path d="M5 0.5H207C209.485 0.5 211.5 2.51472 211.5 5V31.5H0.5V5C0.5 2.51472 2.51472 0.5 5 0.5Z" stroke="#F4FBF6" />
        <circle cx="15" cy="16" r="6.5" stroke="white" />
        <circle cx="34" cy="16" r="6.5" stroke="white" />
        <circle cx="53" cy="16" r="6.5" stroke="white" />
        <path d="M211.5 31.5V125C211.5 127.485 209.485 129.5 207 129.5H5C2.51472 129.5 0.5 127.485 0.5 125V31.5H211.5Z" stroke="#F4FBF6" />

        <path d="M64.3744 51H69.9744V51.8H70.7744V55H69.9744V55.8H65.9744V59H64.3744V51ZM65.9744 54.2H69.1744V52.6H65.9744V54.2ZM72.0575 51.8H72.8575V51H77.6575V51.8H78.4575V58.2H77.6575V59H72.8575V58.2H72.0575V51.8ZM73.6575 57.4H76.8575V52.6H73.6575V57.4ZM79.7407 51H81.3407V57.4H82.1407V54.2H83.7407V57.4H84.5407V51H86.1407V58.2H85.3407V59H83.7407V58.2H82.1407V59H80.5407V58.2H79.7407V51ZM87.4238 51H93.8238V52.6H89.0238V54.2H93.0238V55.8H89.0238V57.4H93.8238V59H87.4238V51ZM95.1069 51H100.707V51.8H101.507V55H100.707V55.8H99.1069V56.6H99.9069V57.4H100.707V58.2H101.507V59H99.1069V58.2H98.3069V57.4H97.5069V56.6H96.7069V59H95.1069V51ZM96.7069 54.2H99.9069V52.6H96.7069V54.2ZM104.39 51H107.59V52.6H106.79V57.4H107.59V59H104.39V57.4H105.19V52.6H104.39V51ZM110.473 51H111.273V51.8H112.073V52.6H112.873V53.4H113.673V54.2H114.473V55H115.273V51H116.873V59H116.073V58.2H115.273V57.4H114.473V56.6H113.673V55.8H112.873V55H112.073V59H110.473V51ZM118.156 51.8H118.956V51H123.756V51.8H124.556V53.4H122.956V52.6H119.756V57.4H122.956V55.8H121.356V54.2H124.556V58.2H123.756V59H118.956V58.2H118.156V51.8ZM134.319 51H135.919V57.4H139.119V51H140.719V58.2H139.919V59H135.119V58.2H134.319V51ZM142.003 51H147.603V51.8H148.403V55H147.603V55.8H143.603V59H142.003V51ZM143.603 54.2H146.803V52.6H143.603V54.2Z" fill="white" />

        <rect x="21.79" y="71.5" width="170" height="26.8419" rx="13.4209" stroke="white" />
        <path d="M25.29 84.9182C25.29 79.522 29.4412 75.1187 34.5913 75V94.8419C29.4412 94.7178 25.29 90.3199 25.29 84.9236V84.9182Z" fill="url(#bpg0)"><animate attributeName="opacity" values="0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M39.7569 94.8419C39.7 94.8419 39.6482 94.8419 39.5913 94.8365V75.0054C39.6482 75.0054 39.7 75 39.7569 75H47.1896V94.8419H39.7569Z" fill="url(#bpg1)"><animate attributeName="opacity" values="0;0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M52.3553 94.8419C52.2983 94.8419 52.2466 94.8419 52.1896 94.8365V75.0054C52.2466 75.0054 52.2983 75 52.3553 75H59.788V94.8419H52.3553Z" fill="url(#bpg2)"><animate attributeName="opacity" values="0;0;0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M64.9536 94.8419C64.8967 94.8419 64.8449 94.8419 64.788 94.8365V75.0054C64.8449 75.0054 64.8967 75 64.9536 75H72.3863V94.8419H64.9536Z" fill="url(#bpg3)"><animate attributeName="opacity" values="0;0;0;0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M77.5519 94.8419C77.495 94.8419 77.4432 94.8419 77.3863 94.8365V75.0054C77.4432 75.0054 77.495 75 77.5519 75H84.9846V94.8419H77.5519Z" fill="url(#bpg4)"><animate attributeName="opacity" values="0;0;0;0;0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M90.1503 94.8419C90.0933 94.8419 90.0416 94.8419 89.9846 94.8365V75.0054C90.0416 75.0054 90.0933 75 90.1503 75H97.583V94.8419H90.1503Z" fill="url(#bpg5)"><animate attributeName="opacity" values="0;0;0;0;0;0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M102.749 94.8419C102.692 94.8419 102.64 94.8419 102.583 94.8365V75.0054C102.64 75.0054 102.692 75 102.749 75H110.181V94.8419H102.749Z" fill="url(#bpg6)"><animate attributeName="opacity" values="0;0;0;0;0;0;0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M115.347 94.8419C115.29 94.8419 115.238 94.8419 115.181 94.8365V75.0054C115.238 75.0054 115.29 75 115.347 75H122.78V94.8419H115.347Z" fill="url(#bpg7)"><animate attributeName="opacity" values="0;0;0;0;0;0;0;0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M127.945 94.8419C127.888 94.8419 127.837 94.8419 127.78 94.8365V75.0054C127.837 75.0054 127.888 75 127.945 75H135.378V94.8419H127.945Z" fill="url(#bpg8)"><animate attributeName="opacity" values="0;0;0;0;0;0;0;0;0;1;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>
        <path d="M140.544 94.8419C140.487 94.8419 140.435 94.8419 140.378 94.8365V75.0054C140.435 75.0054 140.487 75 140.544 75H147.976V94.8419H140.544Z" fill="url(#bpg9)"><animate attributeName="opacity" values="0;0;0;0;0;0;0;0;0;0;1" dur="1.4s" begin="0s" repeatCount="indefinite" /></path>

        <defs>
          <linearGradient id="bpg0" x1="29.42" y1="75" x2="35.35" y2="112.45" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg1" x1="42.97" y1="75" x2="50.13" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg2" x1="55.57" y1="75" x2="62.73" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg3" x1="68.17" y1="75" x2="75.33" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg4" x1="80.76" y1="75" x2="87.93" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg5" x1="93.36" y1="75" x2="100.53" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg6" x1="105.96" y1="75" x2="113.12" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg7" x1="118.56" y1="75" x2="125.72" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg8" x1="131.16" y1="75" x2="138.32" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
          <linearGradient id="bpg9" x1="143.76" y1="75" x2="150.92" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D" /><stop offset="0.53" stopColor="#DBEA1C" /></linearGradient>
        </defs>
      </svg>
    </div>
  );
}
