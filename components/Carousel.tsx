import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Variants, useMotionValue, useSpring } from 'framer-motion';
import { usePinch, useDrag } from '@use-gesture/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IMAGES } from '../constants';
import { SwipeDirection } from '../types';

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

const variants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 1,
    zIndex: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    transition: {
      x: { type: "tween", duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }, // cubic-bezier for smooth motion
    },
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? '100%' : '-100%',
    opacity: 1,
    transition: {
      x: { type: "tween", duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
    },
  }),
};

const Carousel: React.FC = () => {
  const [[page, direction], setPage] = useState([0, 0]);

  // We wrap the index to allow infinite looping if desired,
  // but for a book/program, strictly linear (clamped) usually feels better.
  // Here we implement bounded linear navigation.
  const imageIndex = page;

  // Edge bounce feedback - subtle nudge when hitting boundaries
  const edgeBounceX = useMotionValue(0);
  const springEdgeBounce = useSpring(edgeBounceX, { stiffness: 400, damping: 25 });

  const triggerEdgeBounce = useCallback((direction: number) => {
    // Nudge in the opposite direction of the attempted swipe, then spring back
    const nudgeAmount = direction > 0 ? -15 : 15;
    edgeBounceX.set(nudgeAmount);
    setTimeout(() => edgeBounceX.set(0), 50);
  }, [edgeBounceX]);

  const paginate = useCallback((newDirection: number) => {
    const newPage = page + newDirection;
    if (newPage >= 0 && newPage < IMAGES.length) {
      setPage([newPage, newDirection]);
    } else {
      triggerEdgeBounce(newDirection);
    }
  }, [page, triggerEdgeBounce]);

  // Page counter auto-hide - shows on page change, fades after delay
  const [showPageCounter, setShowPageCounter] = useState(true);
  const pageCounterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setShowPageCounter(true);
    if (pageCounterTimeoutRef.current) {
      clearTimeout(pageCounterTimeoutRef.current);
    }
    pageCounterTimeoutRef.current = setTimeout(() => {
      setShowPageCounter(false);
    }, 1500);

    return () => {
      if (pageCounterTimeoutRef.current) {
        clearTimeout(pageCounterTimeoutRef.current);
      }
    };
  }, [page]);

  // Handle keyboard navigation for desktop accessibility
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') paginate(SwipeDirection.RIGHT);
      if (e.key === 'ArrowLeft') paginate(SwipeDirection.LEFT);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [paginate]);

  // Preload adjacent images for smooth transitions
  useEffect(() => {
    const preloadImage = (src: string) => {
      const img = new Image();
      img.src = src;
    };

    // Preload next image
    if (imageIndex < IMAGES.length - 1) {
      preloadImage(IMAGES[imageIndex + 1].url);
    }
    // Preload previous image
    if (imageIndex > 0) {
      preloadImage(IMAGES[imageIndex - 1].url);
    }
    // Also preload 2 ahead for faster forward navigation
    if (imageIndex < IMAGES.length - 2) {
      preloadImage(IMAGES[imageIndex + 2].url);
    }
  }, [imageIndex]);

  // Zoom state - shared by pinch, double-tap, and pan
  const zoomScale = useMotionValue(1);
  const zoomX = useMotionValue(0);
  const zoomY = useMotionValue(0);
  const springScale = useSpring(zoomScale, { stiffness: 300, damping: 30 });
  const springZoomX = useSpring(zoomX, { stiffness: 300, damping: 30 });
  const springZoomY = useSpring(zoomY, { stiffness: 300, damping: 30 });

  // Track if we're zoomed (for gesture mode switching)
  const [isZoomed, setIsZoomed] = useState(false);
  const isZoomedRef = useRef(false);

  // Reset zoom when page changes
  const panOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    zoomScale.set(1);
    zoomX.set(0);
    zoomY.set(0);
    isZoomedRef.current = false;
    setIsZoomed(false);
    panOffsetRef.current = { x: 0, y: 0 };
  }, [page, zoomScale, zoomX, zoomY]);

  // Smart tap detection: distinguish taps from swipes
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const TAP_THRESHOLD_MS = 200;      // Max duration for a tap
  const TAP_THRESHOLD_PX = 10;       // Max movement for a tap
  const EDGE_ZONE_PERCENT = 0.20;    // 20% on each side for tap zones
  const DOUBLE_TAP_MS = 300;         // Max time between taps for double-tap
  const DOUBLE_TAP_PX = 30;          // Max distance between taps for double-tap

  // Double-tap tracking
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  // Double-tap zoom handler
  const handleDoubleTapZoom = useCallback((tapX: number, tapY: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    if (isZoomedRef.current) {
      // Zoom out - reset to 1x
      zoomScale.set(1);
      zoomX.set(0);
      zoomY.set(0);
      isZoomedRef.current = false;
      setIsZoomed(false);
      panOffsetRef.current = { x: 0, y: 0 };
    } else {
      // Zoom in 2x centered on tap point
      const scale = 2;
      const offsetX = (centerX - tapX) * (scale - 1);
      const offsetY = (centerY - tapY) * (scale - 1);

      zoomScale.set(scale);
      zoomX.set(offsetX);
      zoomY.set(offsetY);
      isZoomedRef.current = true;
      setIsZoomed(true);
      panOffsetRef.current = { x: offsetX, y: offsetY };
    }
  }, [zoomScale, zoomX, zoomY]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || !containerRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    const duration = Date.now() - touchStartRef.current.time;

    // Check if it's a tap (short duration, minimal movement)
    const isTap = duration < TAP_THRESHOLD_MS && deltaX < TAP_THRESHOLD_PX && deltaY < TAP_THRESHOLD_PX;

    if (isTap) {
      const rect = containerRef.current.getBoundingClientRect();
      const tapX = touchStartRef.current.x - rect.left;
      const tapY = touchStartRef.current.y - rect.top;
      const now = Date.now();

      // Check for double-tap
      if (lastTapRef.current) {
        const timeSinceLastTap = now - lastTapRef.current.time;
        const distFromLastTap = Math.sqrt(
          Math.pow(tapX - lastTapRef.current.x, 2) +
          Math.pow(tapY - lastTapRef.current.y, 2)
        );

        if (timeSinceLastTap < DOUBLE_TAP_MS && distFromLastTap < DOUBLE_TAP_PX) {
          // Double-tap detected!
          handleDoubleTapZoom(tapX, tapY);
          lastTapRef.current = null;
          touchStartRef.current = null;
          return;
        }
      }

      // Store this tap for potential double-tap detection
      lastTapRef.current = { x: tapX, y: tapY, time: now };

      // Single tap handling (with slight delay to distinguish from double-tap)
      const containerWidth = rect.width;
      const relativeX = tapX / containerWidth;

      // Only handle edge taps for navigation if not zoomed
      if (!isZoomedRef.current) {
        // Tap on left edge → go back
        if (relativeX < EDGE_ZONE_PERCENT) {
          paginate(SwipeDirection.LEFT);
        }
        // Tap on right edge → go forward
        else if (relativeX > 1 - EDGE_ZONE_PERCENT) {
          paginate(SwipeDirection.RIGHT);
        }
      }
    }

    touchStartRef.current = null;
  }, [paginate, handleDoubleTapZoom]);

  // Pinch gesture refs
  const gestureRef = useRef<HTMLDivElement>(null);
  const pinchOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Safari gesture prevention
  useEffect(() => {
    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', preventDefault);
    document.addEventListener('gesturechange', preventDefault);
    return () => {
      document.removeEventListener('gesturestart', preventDefault);
      document.removeEventListener('gesturechange', preventDefault);
    };
  }, []);

  // Pinch gesture - always bounces back to 1x (for quick inspection)
  usePinch(
    ({ da: [d], origin: [ox, oy], first, active, memo }) => {
      if (!containerRef.current) return memo;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      if (first) {
        pinchOriginRef.current = {
          x: ox - rect.left,
          y: oy - rect.top,
        };
        return d;
      }

      const initialDistance = memo || d;
      const currentScale = d / initialDistance;
      const clampedScale = Math.min(Math.max(currentScale, 0.5), 3);

      zoomScale.set(clampedScale);

      const originX = pinchOriginRef.current?.x ?? centerX;
      const originY = pinchOriginRef.current?.y ?? centerY;

      const offsetX = (centerX - originX) * (clampedScale - 1);
      const offsetY = (centerY - originY) * (clampedScale - 1);

      zoomX.set(offsetX);
      zoomY.set(offsetY);

      // Always bounce back to 1x when pinch ends
      if (!active) {
        zoomScale.set(1);
        zoomX.set(0);
        zoomY.set(0);
        pinchOriginRef.current = null;
        // Reset zoom state so swipe navigation works again
        isZoomedRef.current = false;
        setIsZoomed(false);
        panOffsetRef.current = { x: 0, y: 0 };
      }

      return memo;
    },
    {
      target: gestureRef,
      eventOptions: { passive: false },
    }
  );

  // Pan gesture - only active when zoomed (via double-tap)
  useDrag(
    ({ movement: [mx, my], first, last }) => {
      if (!isZoomedRef.current || !containerRef.current) return;

      if (first) {
        // Store starting position
        panOffsetRef.current = {
          x: zoomX.get(),
          y: zoomY.get(),
        };
      }

      // Calculate new position from movement
      const newX = panOffsetRef.current.x + mx;
      const newY = panOffsetRef.current.y + my;

      // Get container dimensions for bounds
      const rect = containerRef.current.getBoundingClientRect();
      const scale = zoomScale.get();

      // Calculate how much extra space we have when zoomed
      // At 2x zoom, we can pan half the container size in each direction
      const maxPanX = (rect.width * (scale - 1)) / 2;
      const maxPanY = (rect.height * (scale - 1)) / 2;

      // Clamp to prevent panning into black space
      const clampedX = Math.max(-maxPanX, Math.min(maxPanX, newX));
      const clampedY = Math.max(-maxPanY, Math.min(maxPanY, newY));

      zoomX.set(clampedX);
      zoomY.set(clampedY);

      // Update ref on last gesture for next drag
      if (last) {
        panOffsetRef.current = { x: clampedX, y: clampedY };
      }
    },
    {
      target: gestureRef,
      eventOptions: { passive: false },
      filterTaps: true,
    }
  );

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-center overflow-hidden bg-stone-900">
      {/* Edge bounce wrapper - nudges when hitting boundaries */}
      <motion.div
        className="relative w-full h-full max-w-lg max-h-[90vh] aspect-[9/16] mx-auto"
        style={{ x: springEdgeBounce }}
      >
        {/* Viewport Container with smart tap detection */}
        <div
          ref={containerRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="relative w-full h-full touch-none overflow-hidden"
          style={{ contain: 'layout paint' }}
        >
        {/* Gesture target wrapper for pinch - zoom transforms applied here */}
        <motion.div
          ref={gestureRef}
          className="absolute inset-0 will-change-transform"
          style={{
            touchAction: 'none',
            scale: springScale,
            x: springZoomX,
            y: springZoomY,
            backfaceVisibility: 'hidden',
          }}
        >
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.img
              key={page}
              src={IMAGES[imageIndex].url}
              alt={IMAGES[imageIndex].alt}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              // Swipe navigation only when not zoomed
              drag={isZoomed ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={(e, { offset, velocity }) => {
                if (isZoomed) return; // Don't navigate when zoomed
                const swipe = swipePower(offset.x, velocity.x);
                if (swipe < -swipeConfidenceThreshold) {
                  paginate(SwipeDirection.RIGHT);
                } else if (swipe > swipeConfidenceThreshold) {
                  paginate(SwipeDirection.LEFT);
                }
              }}
              className="absolute w-full h-full object-contain cursor-grab active:cursor-grabbing rounded-sm touch-none will-change-transform"
              style={{ backfaceVisibility: 'hidden' }}
            />
          </AnimatePresence>
        </motion.div>

        {/* Page Counter - discreet position indicator, auto-hides */}
        <div
          className={`absolute top-4 right-4 z-20 px-2.5 py-1 rounded-full bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${
            showPageCounter ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="text-white/80 text-xs font-medium tabular-nums">
            {imageIndex + 1} / {IMAGES.length}
          </span>
        </div>

        {/* Classic Dot Indicators - inside viewport container */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-2 z-20">
          {IMAGES.map((_, idx) => (
            <div
              key={idx}
              className={`rounded-full transition-all duration-300 ${
                idx === imageIndex
                  ? 'w-2.5 h-2.5 bg-white/90'
                  : 'w-2 h-2 bg-white/40'
              }`}
            />
          ))}
        </div>
        </div>

        {/* Desktop Navigation Arrows (Hidden on touch devices largely via CSS logic or just subtle overlays) */}
        {page > 0 && (
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/70 backdrop-blur-sm transition-all hidden md:flex"
            onClick={() => paginate(SwipeDirection.LEFT)}
          >
            <ChevronLeft size={32} />
          </button>
        )}

        {page < IMAGES.length - 1 && (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/20 hover:bg-black/40 text-white/70 backdrop-blur-sm transition-all hidden md:flex"
            onClick={() => paginate(SwipeDirection.RIGHT)}
          >
            <ChevronRight size={32} />
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default Carousel;