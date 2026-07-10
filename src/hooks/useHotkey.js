import { useEffect } from 'react';

export function useHotkey(key, handler) {
  useEffect(() => {
    function onKeyDown(event) {
      const tag = document.activeElement?.tagName;
      if (event.key.toLowerCase() === key && tag !== 'INPUT') handler();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [key, handler]);
}
