"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface DraggableElement {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  baseWidth: number;
  baseHeight: number;
  resizable: boolean;
  closeable: boolean;
  visible: boolean;
  minimized: boolean;
  animationClass: string;
}

const INITIAL_ELEMENTS: DraggableElement[] = [
  { id: "cherry-1", src: "/cherry-icon.svg", x: 6, y: 10, width: 70, height: 70, baseWidth: 70, baseHeight: 70, resizable: true, closeable: false, visible: true, minimized: false, animationClass: "animate-float-slow" },
  { id: "ghost-1", src: "/ghost-icon.svg", x: 85, y: 12, width: 70, height: 70, baseWidth: 70, baseHeight: 70, resizable: true, closeable: false, visible: true, minimized: false, animationClass: "animate-float-medium" },
  { id: "folder-1", src: "/folder-1.svg", x: 8, y: 75, width: 115, height: 92, baseWidth: 115, baseHeight: 92, resizable: false, closeable: false, visible: true, minimized: false, animationClass: "animate-float-medium" },
  { id: "folder-2", src: "/folder-2.svg", x: 82, y: 50, width: 115, height: 72, baseWidth: 115, baseHeight: 72, resizable: false, closeable: false, visible: true, minimized: false, animationClass: "animate-float-slow" },
  { id: "power-1", src: "powering-up", x: 75, y: 70, width: 224, height: 141, baseWidth: 224, baseHeight: 141, resizable: false, closeable: true, visible: true, minimized: false, animationClass: "animate-float-slow" },
  { id: "cherry-2", src: "/cherry-icon.svg", x: 25, y: 65, width: 50, height: 50, baseWidth: 50, baseHeight: 50, resizable: true, closeable: false, visible: true, minimized: false, animationClass: "animate-float-fast" },
  { id: "ghost-2", src: "/ghost-icon.svg", x: 3, y: 40, width: 50, height: 50, baseWidth: 50, baseHeight: 50, resizable: true, closeable: false, visible: true, minimized: false, animationClass: "animate-float-fast" },
  { id: "power-2", src: "powering-up", x: 35, y: 5, width: 170, height: 107, baseWidth: 170, baseHeight: 107, resizable: false, closeable: true, visible: true, minimized: false, animationClass: "animate-float-medium" },
  { id: "folder-3", src: "/folder-1.svg", x: 70, y: 30, width: 80, height: 64, baseWidth: 80, baseHeight: 64, resizable: false, closeable: false, visible: true, minimized: false, animationClass: "animate-float-fast" },
];

export function ArcadeBackground() {
  const [elements, setElements] = useState<DraggableElement[]>(INITIAL_ELEMENTS);

  const updateElement = useCallback((id: string, updates: Partial<DraggableElement>) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...updates } : el)));
  }, []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(207, 238, 220, 0.06) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(207, 238, 220, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: "62px 62px",
        }}
      />

      {elements
        .filter((el) => el.visible)
        .map((el) => (
          <DraggableItem
            key={el.id}
            element={el}
            onUpdate={updateElement}
          />
        ))}
    </div>
  );
}

function DraggableItem({
  element,
  onUpdate,
}: {
  element: DraggableElement;
  onUpdate: (id: string, updates: Partial<DraggableElement>) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; elX: number; elY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = elRef.current?.parentElement?.getBoundingClientRect();
      if (!rect) return;

      const currentX = (element.x / 100) * rect.width;
      const currentY = (element.y / 100) * rect.height;

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        elX: currentX,
        elY: currentY,
      };
      setIsDragging(true);
    },
    [element.x, element.y]
  );

  const handleResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: element.width,
        startH: element.height,
      };
      setIsResizing(true);
    },
    [element.width, element.height]
  );

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && dragRef.current) {
        const rect = elRef.current?.parentElement?.getBoundingClientRect();
        if (!rect) return;

        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const newX = ((dragRef.current.elX + dx) / rect.width) * 100;
        const newY = ((dragRef.current.elY + dy) / rect.height) * 100;

        onUpdate(element.id, {
          x: Math.max(-5, Math.min(95, newX)),
          y: Math.max(-5, Math.min(95, newY)),
        });
      }

      if (isResizing && resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        const delta = Math.max(dx, dy);
        const aspect = element.baseWidth / element.baseHeight;
        const newW = Math.max(30, Math.min(200, resizeRef.current.startW + delta));
        const newH = newW / aspect;

        onUpdate(element.id, { width: newW, height: newH });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      dragRef.current = null;
      resizeRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, element.id, element.baseWidth, element.baseHeight, onUpdate]);

  const isActive = isDragging || isResizing;
  const isPoweringUp = element.src === "powering-up";

  return (
    <div
      ref={elRef}
      className={`absolute ${isActive ? "" : element.animationClass} select-none`}
      style={{
        left: `${element.x}%`,
        top: `${element.y}%`,
        cursor: isDragging ? "grabbing" : "grab",
        transition: element.minimized ? "transform 0.3s ease, opacity 0.3s ease" : undefined,
        transform: element.minimized ? "scale(0.05)" : undefined,
        opacity: element.minimized ? 0 : 1,
      }}
      onMouseDown={isPoweringUp ? undefined : handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        if (!isActive) setIsHovered(false);
      }}
    >
      <div className="relative">
        {isPoweringUp ? (
          <PoweringUpWindow
            width={element.width}
            height={element.height}
            onClose={() => onUpdate(element.id, { visible: false })}
            onMinimize={() => onUpdate(element.id, { minimized: true })}
            onMaximize={() => {
              const aspect = element.baseWidth / element.baseHeight;
              const newW = Math.min(element.width * 1.5, 400);
              onUpdate(element.id, { width: newW, height: newW / aspect });
            }}
            onDragStart={handleMouseDown}
          />
        ) : (
          <img
            src={element.src}
            alt=""
            draggable={false}
            style={{ width: element.width, height: element.height }}
          />
        )}

        {/* Resize handles for resizable items */}
        {element.resizable && isHovered && !element.minimized && (
          <>
            {[
              { pos: "-top-1 -left-1", cursor: "nw-resize" },
              { pos: "-top-1 -right-1", cursor: "ne-resize" },
              { pos: "-bottom-1 -left-1", cursor: "sw-resize" },
              { pos: "-bottom-1 -right-1", cursor: "se-resize" },
            ].map(({ pos, cursor }) => (
              <div
                key={pos}
                className={`absolute ${pos} w-2.5 h-2.5 border border-[#6AC387] bg-[#151919]`}
                style={{ cursor }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleResizeDown(e);
                }}
              />
            ))}
            <div className="absolute inset-0 border border-[#6AC387]/50 pointer-events-none" />
          </>
        )}
      </div>
    </div>
  );
}

function PoweringUpWindow({
  width,
  height,
  onClose,
  onMinimize,
  onMaximize,
  onDragStart,
}: {
  width: number;
  height: number;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  const [hoveredBtn, setHoveredBtn] = useState<"close" | "minimize" | "maximize" | null>(null);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 224 141"
      fill="none"
      style={{ cursor: "grab" }}
      onMouseDown={onDragStart}
    >
      {/* Back window */}
      <rect width="212" height="130" transform="translate(12 11)" fill="#151919" />
      <path d="M17 11.5H219C221.485 11.5 223.5 13.5147 223.5 16V42.5H12.5V16C12.5 13.5147 14.5147 11.5 17 11.5Z" fill="#151919" />
      <path d="M17 11.5H219C221.485 11.5 223.5 13.5147 223.5 16V42.5H12.5V16C12.5 13.5147 14.5147 11.5 17 11.5Z" stroke="#F4FBF6" />
      <circle cx="27" cy="27" r="6.5" stroke="white" />
      <circle cx="46" cy="27" r="6.5" stroke="white" />
      <circle cx="65" cy="27" r="6.5" stroke="white" />
      <path d="M223.5 42.5V136C223.5 138.485 221.485 140.5 219 140.5H17C14.5147 140.5 12.5 138.485 12.5 136V42.5H223.5Z" stroke="#F4FBF6" />

      {/* Front window */}
      <rect width="212" height="130" fill="#151919" />
      <path d="M5 0.5H207C209.485 0.5 211.5 2.51472 211.5 5V31.5H0.5V5C0.5 2.51472 2.51472 0.5 5 0.5Z" fill="#151919" />
      <path d="M5 0.5H207C209.485 0.5 211.5 2.51472 211.5 5V31.5H0.5V5C0.5 2.51472 2.51472 0.5 5 0.5Z" stroke="#F4FBF6" />

      {/* Close button */}
      <circle
        cx="15"
        cy="16"
        r="6.5"
        stroke={hoveredBtn === "close" ? "#FF5F57" : "white"}
        fill={hoveredBtn === "close" ? "#FF5F57" : "transparent"}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHoveredBtn("close")}
        onMouseLeave={() => setHoveredBtn(null)}
        onMouseDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      {hoveredBtn === "close" && (
        <g style={{ pointerEvents: "none" }}>
          <line x1="12" y1="13" x2="18" y2="19" stroke="#4A0000" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="18" y1="13" x2="12" y2="19" stroke="#4A0000" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}

      {/* Minimize button */}
      <circle
        cx="34"
        cy="16"
        r="6.5"
        stroke={hoveredBtn === "minimize" ? "#FEBC2E" : "white"}
        fill={hoveredBtn === "minimize" ? "#FEBC2E" : "transparent"}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHoveredBtn("minimize")}
        onMouseLeave={() => setHoveredBtn(null)}
        onMouseDown={(e) => {
          e.stopPropagation();
          onMinimize();
        }}
      />
      {hoveredBtn === "minimize" && (
        <line x1="30" y1="16" x2="38" y2="16" stroke="#9A6C00" strokeWidth="1.5" strokeLinecap="round" style={{ pointerEvents: "none" }} />
      )}

      {/* Maximize button */}
      <circle
        cx="53"
        cy="16"
        r="6.5"
        stroke={hoveredBtn === "maximize" ? "#28C840" : "white"}
        fill={hoveredBtn === "maximize" ? "#28C840" : "transparent"}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHoveredBtn("maximize")}
        onMouseLeave={() => setHoveredBtn(null)}
        onMouseDown={(e) => {
          e.stopPropagation();
          onMaximize();
        }}
      />
      {hoveredBtn === "maximize" && (
        <g style={{ pointerEvents: "none" }}>
          <polyline points="49,13 49,19 55,19" fill="none" stroke="#006500" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="57,19 57,13 51,13" fill="none" stroke="#006500" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* Window body */}
      <path d="M211.5 31.5V125C211.5 127.485 209.485 129.5 207 129.5H5C2.51472 129.5 0.5 127.485 0.5 125V31.5H211.5Z" stroke="#F4FBF6" />

      {/* Pixel art "Powering Up" text */}
      <path d="M64.3744 51H69.9744V51.8H70.7744V55H69.9744V55.8H65.9744V59H64.3744V51ZM65.9744 54.2H69.1744V52.6H65.9744V54.2ZM72.0575 51.8H72.8575V51H77.6575V51.8H78.4575V58.2H77.6575V59H72.8575V58.2H72.0575V51.8ZM73.6575 57.4H76.8575V52.6H73.6575V57.4ZM79.7407 51H81.3407V57.4H82.1407V54.2H83.7407V57.4H84.5407V51H86.1407V58.2H85.3407V59H83.7407V58.2H82.1407V59H80.5407V58.2H79.7407V51ZM87.4238 51H93.8238V52.6H89.0238V54.2H93.0238V55.8H89.0238V57.4H93.8238V59H87.4238V51ZM95.1069 51H100.707V51.8H101.507V55H100.707V55.8H99.1069V56.6H99.9069V57.4H100.707V58.2H101.507V59H99.1069V58.2H98.3069V57.4H97.5069V56.6H96.7069V59H95.1069V51ZM96.7069 54.2H99.9069V52.6H96.7069V54.2ZM104.39 51H107.59V52.6H106.79V57.4H107.59V59H104.39V57.4H105.19V52.6H104.39V51ZM110.473 51H111.273V51.8H112.073V52.6H112.873V53.4H113.673V54.2H114.473V55H115.273V51H116.873V59H116.073V58.2H115.273V57.4H114.473V56.6H113.673V55.8H112.873V55H112.073V59H110.473V51ZM118.156 51.8H118.956V51H123.756V51.8H124.556V53.4H122.956V52.6H119.756V57.4H122.956V55.8H121.356V54.2H124.556V58.2H123.756V59H118.956V58.2H118.156V51.8ZM134.319 51H135.919V57.4H139.119V51H140.719V58.2H139.919V59H135.119V58.2H134.319V51ZM142.003 51H147.603V51.8H148.403V55H147.603V55.8H143.603V59H142.003V51ZM143.603 54.2H146.803V52.6H143.603V54.2Z" fill="white" />

      {/* Progress bar */}
      <rect x="21.79" y="71.5" width="170" height="26.8419" rx="13.4209" stroke="white" />
      <path d="M25.29 84.9182C25.29 79.522 29.4412 75.1187 34.5913 75V94.8419C29.4412 94.7178 25.29 90.3199 25.29 84.9236V84.9182Z" fill="url(#pg0)"><animate attributeName="opacity" values="0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M39.7569 94.8419C39.7 94.8419 39.6482 94.8419 39.5913 94.8365V75.0054C39.6482 75.0054 39.7 75 39.7569 75H47.1896V94.8419H39.7569Z" fill="url(#pg1)"><animate attributeName="opacity" values="0;0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M52.3553 94.8419C52.2983 94.8419 52.2466 94.8419 52.1896 94.8365V75.0054C52.2466 75.0054 52.2983 75 52.3553 75H59.788V94.8419H52.3553Z" fill="url(#pg2)"><animate attributeName="opacity" values="0;0;0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M64.9536 94.8419C64.8967 94.8419 64.8449 94.8419 64.788 94.8365V75.0054C64.8449 75.0054 64.8967 75 64.9536 75H72.3863V94.8419H64.9536Z" fill="url(#pg3)"><animate attributeName="opacity" values="0;0;0;0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M77.5519 94.8419C77.495 94.8419 77.4432 94.8419 77.3863 94.8365V75.0054C77.4432 75.0054 77.495 75 77.5519 75H84.9846V94.8419H77.5519Z" fill="url(#pg4)"><animate attributeName="opacity" values="0;0;0;0;0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M90.1503 94.8419C90.0933 94.8419 90.0416 94.8419 89.9846 94.8365V75.0054C90.0416 75.0054 90.0933 75 90.1503 75H97.583V94.8419H90.1503Z" fill="url(#pg5)"><animate attributeName="opacity" values="0;0;0;0;0;0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M102.749 94.8419C102.692 94.8419 102.64 94.8419 102.583 94.8365V75.0054C102.64 75.0054 102.692 75 102.749 75H110.181V94.8419H102.749Z" fill="url(#pg6)"><animate attributeName="opacity" values="0;0;0;0;0;0;0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M115.347 94.8419C115.29 94.8419 115.238 94.8419 115.181 94.8365V75.0054C115.238 75.0054 115.29 75 115.347 75H122.78V94.8419H115.347Z" fill="url(#pg7)"><animate attributeName="opacity" values="0;0;0;0;0;0;0;0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M127.945 94.8419C127.888 94.8419 127.837 94.8419 127.78 94.8365V75.0054C127.837 75.0054 127.888 75 127.945 75H135.378V94.8419H127.945Z" fill="url(#pg8)"><animate attributeName="opacity" values="0;0;0;0;0;0;0;0;0;1;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>
      <path d="M140.544 94.8419C140.487 94.8419 140.435 94.8419 140.378 94.8365V75.0054C140.435 75.0054 140.487 75 140.544 75H147.976V94.8419H140.544Z" fill="url(#pg9)"><animate attributeName="opacity" values="0;0;0;0;0;0;0;0;0;0;1" dur="3s" begin="0s" repeatCount="indefinite" /></path>

      <defs>
        <linearGradient id="pg0" x1="29.42" y1="75" x2="35.35" y2="112.45" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg1" x1="42.97" y1="75" x2="50.13" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg2" x1="55.57" y1="75" x2="62.73" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg3" x1="68.17" y1="75" x2="75.33" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg4" x1="80.76" y1="75" x2="87.93" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg5" x1="93.36" y1="75" x2="100.53" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg6" x1="105.96" y1="75" x2="113.12" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg7" x1="118.56" y1="75" x2="125.72" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg8" x1="131.16" y1="75" x2="138.32" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
        <linearGradient id="pg9" x1="143.76" y1="75" x2="150.92" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#49B66D"/><stop offset="0.53" stopColor="#DBEA1C"/></linearGradient>
      </defs>
    </svg>
  );
}
