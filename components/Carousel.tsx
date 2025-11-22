import React, { useState, useCallback, useRef } from 'react';
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
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
    scale: 0.95,
    zIndex: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: "spring", stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 },
    },
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
    scale: 0.95,
    transition: {
      x: { type: "spring", stiffness: 300, damping: 30 },
      opacity: { duration: 0.2 },
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
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springScale = useSpring(scale, { stiffness: 300, damping: 30 });
  const springX = useSpring(x, { stiffness: 300, damping: 30 });
  const springY = useSpring(y, { stiffness: 300, damping: 30 });
  const imageRef = useRef<HTMLImageElement>(null);
  const pinchOriginRef = useRef<{ x: number; y: number } | null>(null);

  usePinch(
    ({ offset: [s], origin: [ox, oy], first, active }) => {
      if (!imageRef.current) return;

      const rect = imageRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Capture origin only at the start of the gesture
      if (first) {
        // Convert screen coords to element-relative coords
        pinchOriginRef.current = {
          x: ox - rect.left,
          y: oy - rect.top,
        };
      }

      // Use the captured origin throughout the gesture
      const originX = pinchOriginRef.current?.x ?? centerX;
      const originY = pinchOriginRef.current?.y ?? centerY;

      // Clamp scale between 0.5 and 3
      const clampedScale = Math.min(Math.max(s, 0.5), 3);
      scale.set(clampedScale);

      // Translate so the pinch point stays under the fingers
      const offsetX = (centerX - originX) * (clampedScale - 1);
      const offsetY = (centerY - originY) * (clampedScale - 1);

      x.set(offsetX);
      y.set(offsetY);

      // Bounce back to default when gesture ends
      if (!active) {
        scale.set(1);
        x.set(0);
        y.set(0);
        pinchOriginRef.current = null;
      }
    },
    {
      scaleBounds: { min: 0.5, max: 3 },
      rubberband: true,
      target: imageRef,
    }
  );

  return (
    <div className="relative w-full h-full flex flex-col justify-center items-center overflow-hidden bg-stone-900">
      {/* Viewport Container with smart tap detection */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full h-full max-w-lg max-h-[90vh] aspect-[9/16] mx-auto touch-pan-y"
      >
        <AnimatePresence initial={false} custom={direction}>
          <motion.img
            ref={imageRef}
            key={page}
            src={IMAGES[imageIndex].url}
            alt={IMAGES[imageIndex].alt}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            style={{ scale: springScale, x: springX, y: springY }}
            // Drag logic
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
            className="absolute w-full h-full object-contain drop-shadow-2xl cursor-grab active:cursor-grabbing rounded-sm touch-none"
          />
        </AnimatePresence>
      </div>

      {/* Progress Indicator at Bottom */}
      <div className="absolute bottom-6 left-2 right-2 flex justify-center items-center gap-1 z-20">
        {IMAGES.map((_, idx) => (
          <div
            key={idx}
            className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
              idx === imageIndex
                ? 'bg-white/90'
                : idx < imageIndex
                  ? 'bg-white/60'
                  : 'bg-white/30'
            }`}
          />
        ))}
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