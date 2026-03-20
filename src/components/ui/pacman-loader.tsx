"use client";

import { useState, useEffect } from "react";

const FRAME_PATHS = [
  <g key="f0">
    <path opacity="0.25" d="M27.6071 55.2142C42.854 55.2142 55.2142 42.854 55.2142 27.6071C55.2142 12.3601 42.854 0 27.6071 0C12.3601 0 0 12.3601 0 27.6071C0 42.854 12.3601 55.2142 27.6071 55.2142Z" fill="url(#pl0)"/>
    <defs><linearGradient id="pl0" x1="0" y1="27.6071" x2="55.2049" y2="27.6071" gradientUnits="userSpaceOnUse"><stop stopColor="#45B184"/><stop offset="1" stopColor="#6AC186"/></linearGradient></defs>
  </g>,
  <g key="f1">
    <path opacity="0.5" d="M27.711 27.5236L50.4217 20.7911C52.4897 20.179 53.5283 17.87 52.6103 15.9225C48.2239 6.51924 38.6723 0 27.609 0C11.8627 0 -0.795579 13.1683 0.0390325 29.0908C0.799456 43.5389 12.8086 55.0472 27.2845 55.2049C39.0988 55.3347 49.2255 48.055 53.2965 37.7151C54.0847 35.7121 52.9348 33.4679 50.839 32.9764L27.7203 27.5236H27.711Z" fill="url(#pl1)"/>
    <defs><linearGradient id="pl1" x1="0.0019387" y1="27.6071" x2="53.5469" y2="27.6071" gradientUnits="userSpaceOnUse"><stop stopColor="#45B184"/><stop offset="1" stopColor="#6AC186"/></linearGradient></defs>
  </g>,
  <g key="f2">
    <path opacity="0.75" d="M27.7168 27.5236L47.8494 15.0508C49.6856 13.9102 50.0658 11.4156 48.6748 9.76495C43.6022 3.79284 36.0536 0 27.6055 0C12.1373 0 -0.354005 12.7232 0.00766027 28.2748C0.360052 43.307 12.9256 55.3996 27.9671 55.2049C36.7676 55.0936 44.5852 50.8556 49.5557 44.3457C50.854 42.6394 50.344 40.1819 48.4707 39.134L27.7168 27.5236Z" fill="url(#pl2)"/>
    <defs><linearGradient id="pl2" x1="0.00766027" y1="27.6071" x2="50.2791" y2="27.6071" gradientUnits="userSpaceOnUse"><stop stopColor="#45B184"/><stop offset="1" stopColor="#6AC186"/></linearGradient></defs>
  </g>,
];

const SEQUENCE = [0, 1, 2, 1];

interface PacmanLoaderProps {
  size?: number;
  className?: string;
}

export default function PacmanLoader({ size = 48, className = "" }: PacmanLoaderProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SEQUENCE.length);
    }, 42);
    return () => clearInterval(interval);
  }, []);

  const frame = SEQUENCE[frameIndex];

  return (
    <div
      className={`inline-block ${className}`}
      style={{ width: size, height: size, overflow: "hidden" }}
    >
      <svg
        viewBox="0 0 56 56"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        {FRAME_PATHS[frame]}
      </svg>
    </div>
  );
}
