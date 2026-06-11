'use client';

import React, { useEffect, useRef, useState } from 'react';
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
                <h3>The Moon Journal</h3>
                <p>A short illustrated tale.</p>
                <p>Press Next to open the cover.</p>
            </>
        ),
        back: (
            <>
                <h3>Page 1</h3>
                <p>The letter arrived before sunrise, with wax still warm from a distant city.</p>
            </>
        )
    },
    {
        front: (
            <>
                <h3>Page 2</h3>
                <p>By noon they crossed the bridge, following marks carved under the old stone rail.</p>
            </>
        ),
        back: (
            <>
                <h3>Page 3</h3>
                <p>In the valley, wind carried a melody that matched the symbols from the letter.</p>
            </>
        )
    },
    {
        front: (
            <>
                <h3>Page 4</h3>
                <p>The observatory doors opened with a metallic sigh, and starlight filled the chamber.</p>
            </>
        ),
        back: (
            <>
                <h3>Page 5</h3>
                <p>A hidden room waited behind the clockwork wall, lined with hand-drawn constellations.</p>
            </>
        )
    },
    {
        front: (
            <>
                <h3>Page 6</h3>
                <p>At dawn they returned home, carrying stories written between ink and moonlight.</p>
            </>
        ),
        back: (
            <>
                <h3>Back Cover</h3>
                <p>The End</p>
            </>
        )
    }
];

/**
 * Book container handling navigation and sheet stacking.
 * Uses pure CSS 3D transforms (no external page-flip library).
 * @param {{ sheets?: Sheet[], title?: string, fullScreen?: boolean, onRequestClose?: () => void, orientation?: 'portrait' | 'landscape', showEmbeddedControls?: boolean, useCover?: boolean, contentPageCount?: number }} props
 */
export function Book({
    sheets = DEFAULT_SHEETS,
    title = '3D Page Flip Book',
    fullScreen = false,
    onRequestClose,
    orientation = 'portrait',
    showEmbeddedControls = true,
    useCover = true,
    contentPageCount
}) {
    const totalSheets = sheets.length;
    const resolvedContentPages = contentPageCount ?? Math.max(0, totalSheets * 2 - 2);
    const minPage = useCover ? 0 : Math.min(1, Math.max(totalSheets, 1));
    const maxPage = useCover ? totalSheets : Math.max(minPage, Math.ceil(resolvedContentPages / 2));
    const initialPage = minPage;

    // Index of the next sheet to flip. All sheets before this index are "flipped".
    const [currentPage, setCurrentPage] = useState(initialPage);
    const [isFullscreen, setIsFullscreen] = useState(fullScreen);
    const [showOverlayUi, setShowOverlayUi] = useState(true);
    const hideUiTimeoutRef = useRef(null);
    const lastMousePositionRef = useRef({ x: null, y: null });
    const touchStartXRef = useRef(null);
    const totalViews = maxPage - minPage + 1;
    const activeView = currentPage - minPage + 1;
    const isClosedCover = useCover && currentPage === 0;
    const isBackClosed = useCover && currentPage === totalSheets;
    const isTrailingSinglePage = !useCover && resolvedContentPages % 2 === 1 && currentPage === maxPage;

    // Keep local fullscreen state in sync if parent passes a different default.
    useEffect(() => {
        setIsFullscreen(fullScreen);
    }, [fullScreen]);

    // Reset reading position when sheet set or cover mode changes.
    useEffect(() => {
        setCurrentPage(initialPage);
    }, [initialPage, totalSheets]);

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
                closeFullscreen();
                return;
            }

            // Left Arrow = previous sheet
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setCurrentPage((prev) => Math.max(prev - 1, minPage));
                return;
            }

            // Right Arrow and Space = next sheet
            if (event.key === 'ArrowRight' || event.key === ' ' || event.code === 'Space') {
                event.preventDefault();
                setCurrentPage((prev) => Math.min(prev + 1, maxPage));
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
    }, [isFullscreen, maxPage, minPage, totalSheets]);

    function goNext() {
        setCurrentPage((prev) => Math.min(prev + 1, maxPage));
    }

    function goPrevious() {
        setCurrentPage((prev) => Math.max(prev - 1, minPage));
    }

    function closeFullscreen() {
        setIsFullscreen(false);
        if (onRequestClose) onRequestClose();
    }

    function onSceneClick(event) {
        if (!isFullscreen) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const isRightSide = event.clientX > rect.left + rect.width / 2;
        if (isRightSide) {
            goNext();
        } else {
            goPrevious();
        }
    }

    function onSceneTouchStart(event) {
        if (!isFullscreen) return;
        touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
    }

    function onSceneTouchEnd(event) {
        if (!isFullscreen || touchStartXRef.current === null) return;
        const endX = event.changedTouches[0]?.clientX ?? touchStartXRef.current;
        const delta = endX - touchStartXRef.current;
        touchStartXRef.current = null;

        // Swipe threshold avoids accidental turns on tiny touch movement.
        if (Math.abs(delta) < 30) return;
        if (delta < 0) {
            goNext();
        } else {
            goPrevious();
        }
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
                        Page {activeView} of {totalViews}
                    </p>
                </header>
            )}

            {isFullscreen && (
                <header className={`book-overlay-top ${showOverlayUi ? '' : 'controls-hidden'}`}>
                    <h2>{title}</h2>
                    <button type="button" className="book-button" onClick={closeFullscreen}>
                        Exit Full Screen
                    </button>
                </header>
            )}

            {/* Perspective scene gives depth to rotateY transforms */}
            <div
                className={`book-scene ${isFullscreen ? 'book-scene-overlay' : ''}`}
                onClick={onSceneClick}
                onTouchStart={onSceneTouchStart}
                onTouchEnd={onSceneTouchEnd}
            >
                <div
                    className={`book ${isFullscreen ? 'book-overlay-size' : ''} book-orientation-${orientation} ${
                        isClosedCover ? 'book-closed' : ''
                    } ${isBackClosed ? 'book-back-closed' : ''} ${isTrailingSinglePage ? 'book-single-tail' : ''}`}
                >
                    {/* <div className="book-spine" />
                    <div className="book-base-page book-base-left" />
                    <div className="book-base-page book-base-right" /> */}

                    {/* Sheets live on the right side and flip from center spine to the left side. */}
                    {sheets.map((sheet, index) => {
                        const isFlipped = index < currentPage;
                        const zIndex = isFlipped ? index + 1 : totalSheets - index + totalSheets;

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
            {!isFullscreen && showEmbeddedControls && (
                <div className="book-controls">
                    <button type="button" className="book-button" onClick={goPrevious} disabled={currentPage === minPage}>
                        Previous
                    </button>
                    <button
                        type="button"
                        className="book-button"
                        onClick={goNext}
                        disabled={currentPage === maxPage}
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
                    <button type="button" className="book-button" onClick={goPrevious} disabled={currentPage === minPage}>
                        Previous
                    </button>
                    <p>
                        Page {activeView} of {totalViews}
                    </p>
                    <button
                        type="button"
                        className="book-button"
                        onClick={goNext}
                        disabled={currentPage === maxPage}
                    >
                        Next
                    </button>
                </footer>
            )}
        </section>
    );
}
