"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";

/**
 * Fájl behúzása egérrel. Visszaadja a dobóterületre tehető eseménykezelőket és
 * azt, hogy épp fölötte van-e valami — így a keret ki tud világosodni.
 *
 * A böngésző alapból megnyitná a ráejtett fájlt, ezért minden lépésnél
 * `preventDefault` kell, nem csak a dropnál.
 */
export function useFileDrop(onFile: (file: File) => void | Promise<void>) {
  const [dragging, setDragging] = useState(false);
  // A gyerekelemek fölé húzva a dragleave is elsül, ezért számoljuk a mélységet.
  const depth = useRef(0);

  const onDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    depth.current += 1;
    if (event.dataTransfer?.types.includes("Files")) setDragging(true);
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const file = event.dataTransfer?.files?.[0];
      if (file) void onFile(file);
    },
    [onFile],
  );

  return {
    dragging,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
