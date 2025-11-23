import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Variants, useMotionValue, useSpring } from 'framer-motion';
import { usePinch } from '@use-gesture/react';
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

  const paginate = useCallback((newDirection: number) => {
    const newPage = page + newDirection;
    if (newPage >= 0 && newPage < IMAGES.length) {
      setPage([newPage, newDirection]);
    } else {
      // Optional: Visual feedback for end of book?
    }
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

  // Smart tap detection: distinguish taps from swipes
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const TAP_THRESHOLD_MS = 200;      // Max duration for a tap
  const TAP_THRESHOLD_PX = 10;       // Max movement for a tap
  const EDGE_ZONE_PERCENT = 0.20;    // 20% on each side for tap zones

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

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
      const containerWidth = rect.width;
      const relativeX = tapX / containerWidth;

      // Tap on left edge → go back
      if (relativeX < EDGE_ZONE_PERCENT) {
        paginate(SwipeDirection.LEFT);
      }
      // Tap on right edge → go forward
      else if (relativeX > 1 - EDGE_ZONE_PERCENT) {
        paginate(SwipeDirection.RIGHT);
      }
      // Tap in center → do nothing (could add pause/play for video in future)
    }

    touchStartRef.current = null;
  }, [paginate]);

  // Pinch-to-zoom with "zoom where you pinch" and bounce-back
  const zoomScale = useMotionValue(1);
  const zoomX = useMotionValue(0);
  const zoomY = useMotionValue(0);
  const springScale = useSpring(zoomScale, { stiffness: 300, damping: 30 });
  const springZoomX = useSpring(zoomX, { stiffness: 300, damping: 30 });
  const springZoomY = useSpring(zoomY, { stiffness: 300, damping: 30 });

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

  // Only pinch gesture - let framer-motion handle drag for swipe
  usePinch(
    ({ da: [d], origin: [ox, oy], first, active, memo }) => {
      // Use containerRef for stable rect (no transforms applied)
      if (!containerRef.current) return memo;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // On first pinch event, capture origin and initial distance
      if (first) {
        pinchOriginRef.current = {
          x: ox - rect.left,
          y: oy - rect.top,
        };
        return d; // Store initial distance as memo
      }

      // Calculate scale from distance change
      const initialDistance = memo || d;
      const currentScale = d / initialDistance;
      const clampedScale = Math.min(Math.max(currentScale, 0.5), 3);

      zoomScale.set(clampedScale);

      // Use captured origin for stable zoom point
      const originX = pinchOriginRef.current?.x ?? centerX;
      const originY = pinchOriginRef.current?.y ?? centerY;

      // Translate to keep pinch point stationary
      const offsetX = (centerX - originX) * (clampedScale - 1);
      const offsetY = (centerY - originY) * (clampedScale - 1);

      zoomX.set(offsetX);
      zoomY.set(offsetY);

      // Bounce back when gesture ends
      if (!active) {
        zoomScale.set(1);
        zoomX.set(0);
        zoomY.set(0);
        pinchOriginRef.current = null;
      }

      return memo;
    },
    {
      target: gestureRef,
      eventOptions: { passive: false },
    }
  );

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-center overflow-hidden bg-stone-900">
      {/* Viewport Container with smart tap detection */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full h-full max-w-lg max-h-[90vh] aspect-[9/16] mx-auto touch-none overflow-hidden"
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
              // No extra style - zoom handled by wrapper, variants handle transitions
              // Let framer-motion handle drag for swipe
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={(e, { offset, velocity }) => {
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
      
    </div>
  );
};

export default Carousel;