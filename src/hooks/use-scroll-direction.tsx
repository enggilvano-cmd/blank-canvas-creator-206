import { useState, useEffect, useRef } from 'react';

export function useScrollDirection(element?: HTMLElement | null) {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const prevScrollY = useRef(0);

  useEffect(() => {
    const scrollElement = element || document.documentElement;
    let ticking = false;

    const updateScrollDirection = () => {
      const scrollY = scrollElement.scrollTop;

      if (Math.abs(scrollY - prevScrollY.current) < 5) {
        ticking = false;
        return;
      }

      if (scrollY < 50) {
        setIsVisible(true);
        setScrollDirection('up');
      } else if (scrollY > prevScrollY.current) {
        setScrollDirection('down');
        setIsVisible(false);
      } else {
        setScrollDirection('up');
        setIsVisible(true);
      }

      prevScrollY.current = scrollY;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDirection);
        ticking = true;
      }
    };

    scrollElement.addEventListener('scroll', onScroll);

    return () => scrollElement.removeEventListener('scroll', onScroll);
  }, [element]);

  return { scrollDirection, isVisible };
}
