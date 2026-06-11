'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Page } from './Page';

/**
 * @typedef {Object} Sheet
 * @property {React.ReactNode} front
 * @property {React.ReactNode} back
 */

/**
 * Dummy sheets so the component renders immediately in any Next.js page.
 * Each sheet has a front and a back side.
 */
const DEFAULT_SHEETS = [
    {
        front: (
            <>
                <h3>Chapter 1</h3>
                <p>Once upon a time, this first sheet started the story with a calm morning and a quiet village.</p>
            </>
        ),
        back: (
            <>
                <h3>Chapter 1 (Back)</h3>
                <p>The wind changed, a letter arrived, and everything began to move toward adventure.</p>
            </>
        )
    },
    {
        front: (
            <>
                <h3>Chapter 2</h3>
                <p>Through forests and old bridges, the hero followed clues hidden inside weathered journals.</p>
            </>
        ),
        back: (
            <>
                <h3>Chapter 2 (Back)</h3>
                <p>By dusk, a forgotten map finally revealed the path to the mountain observatory.</p>
            </>
        )
    },
    {
        front: (
            <>
                <h3>Chapter 3</h3>
                <p>Inside the observatory, gears turned slowly while moonlight traced symbols on the floor.</p>
            </>
        ),
        back: (
            <>
                <h3>Chapter 3 (Back)</h3>
                <p>With one final mechanism, the hidden room opened and the mystery gave its answer.</p>
            </>
        )
    },
    {
        front: (
            <>
                <h3>Epilogue</h3>
                <p>The village celebrated, the journals were archived, and new travelers came to learn the tale.</p>
            </>
        ),
        back: (
            <>
                <h3>The End</h3>
                <p>Close the cover, take a breath, and flip back anytime you want to revisit the story.</p>
            </>
        )
    }
];

/**
 * Book container handling navigation and sheet stacking.
 * Uses pure CSS 3D transforms (no external page-flip library).
 * @param {{ sheets?: Sheet[], title?: string, fullScreen?: boolean }} props
 */
export function Book({ sheets = DEFAULT_SHEETS, title = '3D Page Flip Book', fullScreen = false }) {
    // Index of the next sheet to flip. All sheets before this index are "flipped".
    const [currentPage, setCurrentPage] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(fullScreen);
    const [showOverlayUi, setShowOverlayUi] = useState(true);
    const hideUiTimeoutRef = useRef(null);
    const lastMousePositionRef = useRef({ x: null, y: null });

    // Memoized total count keeps math and button logic simple.
    const totalSheets = useMemo(() => sheets.length, [sheets.length]);
    const activeSheetLabel = Math.min(currentPage + 1, totalSheets);

    // Keep local fullscreen state in sync if parent passes a different default.
    useEffect(() => {
        setIsFullscreen(fullScreen);
    }, [fullScreen]);

    // Lock page scroll, support keyboard controls, and auto-hide overlay UI.
    useEffect(() => {
        if (!isFullscreen) {
            setShowOverlayUi(true);
            lastMousePositionRef.current = { x: null, y: null };
            if (hideUiTimeoutRef.current) {
                clearTimeout(hideUiTimeoutRef.current);
                hideUiTimeoutRef.current = null;
            }
            return;
        }

        const originalOverflow = document.body.style.overflow;
        const HIDE_DELAY_MS = 2200;

        const restartHideTimer = () => {
            if (hideUiTimeoutRef.current) {
                clearTimeout(hideUiTimeoutRef.current);
            }

            hideUiTimeoutRef.current = setTimeout(() => {
                setShowOverlayUi(false);
            }, HIDE_DELAY_MS);
        };

        const revealUi = () => {
            setShowOverlayUi(true);
            restartHideTimer();
        };

        const onMouseMove = (event) => {
            const last = lastMousePositionRef.current;
            const deltaX = last.x === null ? Infinity : Math.abs(event.clientX - last.x);
            const deltaY = last.y === null ? Infinity : Math.abs(event.clientY - last.y);

            lastMousePositionRef.current = { x: event.clientX, y: event.clientY };

            // Only reveal when cursor actually moves, not from synthetic/no-op mousemove events.
            if (deltaX < 2 && deltaY < 2) {
                return;
            }

            revealUi();
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsFullscreen(false);
                return;
            }

            // Left Arrow = previous sheet
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setCurrentPage((prev) => Math.max(prev - 1, 0));
                return;
            }

            // Right Arrow and Space = next sheet
            if (event.key === 'ArrowRight' || event.key === ' ' || event.code === 'Space') {
                event.preventDefault();
                setCurrentPage((prev) => Math.min(prev + 1, totalSheets));
            }
        };

        document.body.style.overflow = 'hidden';
        revealUi();

        // Netflix-style behavior requested: overlays return only on cursor movement.
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('mousemove', onMouseMove);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mousemove', onMouseMove);
            lastMousePositionRef.current = { x: null, y: null };

            if (hideUiTimeoutRef.current) {
                clearTimeout(hideUiTimeoutRef.current);
                hideUiTimeoutRef.current = null;
            }
        };
    }, [isFullscreen, totalSheets]);

    function goNext() {
        setCurrentPage((prev) => Math.min(prev + 1, totalSheets));
    }

    function goPrevious() {
        setCurrentPage((prev) => Math.max(prev - 1, 0));
    }

    return (
        <section
            className={`book-demo ${isFullscreen ? 'book-demo-overlay' : ''} ${
                isFullscreen && !showOverlayUi ? 'book-cursor-hidden' : ''
            }`}
            aria-label={title}
        >
            {!isFullscreen && (
                <header className="book-toolbar">
                    <h2>{title}</h2>
                    <p>
                        Sheet {activeSheetLabel} of {totalSheets}
                    </p>
                </header>
            )}

            {isFullscreen && (
                <header className={`book-overlay-top ${showOverlayUi ? '' : 'controls-hidden'}`}>
                    <h2>{title}</h2>
                    <button type="button" className="book-button" onClick={() => setIsFullscreen(false)}>
                        Exit Full Screen
                    </button>
                </header>
            )}

            {/* Perspective scene gives depth to rotateY transforms */}
            <div className={`book-scene ${isFullscreen ? 'book-scene-overlay' : ''}`}>
                <div className={`book ${isFullscreen ? 'book-overlay-size' : ''}`}>
                    <div className="book-spine" />

                    {/* Render from first to last; z-index keeps top sheet clickable/visible */}
                    {sheets.map((sheet, index) => {
                        const isFlipped = index < currentPage;
                        const zIndex = totalSheets - index;

                        return (
                            <Page
                                key={`sheet-${index}`}
                                index={index}
                                flipped={isFlipped}
                                zIndex={zIndex}
                                frontContent={sheet.front}
                                backContent={sheet.back}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Standard controls for non-fullscreen mode */}
            {!isFullscreen && (
                <div className="book-controls">
                    <button type="button" className="book-button" onClick={goPrevious} disabled={currentPage === 0}>
                        Previous
                    </button>
                    <button
                        type="button"
                        className="book-button"
                        onClick={goNext}
                        disabled={currentPage === totalSheets}
                    >
                        Next
                    </button>
                    <button type="button" className="book-button" onClick={() => setIsFullscreen(true)}>
                        Full Screen
                    </button>
                </div>
            )}

            {/* Netflix-like bottom bar while in fullscreen mode */}
            {isFullscreen && (
                <footer className={`book-overlay-bottom ${showOverlayUi ? '' : 'controls-hidden'}`}>
                    <button type="button" className="book-button" onClick={goPrevious} disabled={currentPage === 0}>
                        Previous
                    </button>
                    <p>
                        Sheet {activeSheetLabel} of {totalSheets}
                    </p>
                    <button
                        type="button"
                        className="book-button"
                        onClick={goNext}
                        disabled={currentPage === totalSheets}
                    >
                        Next
                    </button>
                </footer>
            )}
        </section>
    );
}
