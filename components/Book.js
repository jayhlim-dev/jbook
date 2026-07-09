'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Page } from './Page';

const MOBILE_FLIP_DURATION_MS = 260;
const ALWAYS_SHOW_OVERLAY = process.env.NEXT_PUBLIC_ALWAYS_SHOW_OVERLAY === 'true';

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
 * @param {{ sheets?: Sheet[], title?: string, fullScreen?: boolean, lockFullscreen?: boolean, onRequestClose?: () => void, orientation?: 'portrait' | 'landscape', showEmbeddedControls?: boolean, showFullscreenButton?: boolean, useCover?: boolean, contentPageCount?: number, fullscreenThumbnails?: Array<{ src: string, label?: string }>, overlayBackHref?: string, overlayBackLabel?: string }} props
 */
export function Book({
    sheets = DEFAULT_SHEETS,
    title = '3D Page Flip Book',
    fullScreen = false,
    lockFullscreen = false,
    onRequestClose,
    orientation = 'portrait',
    showEmbeddedControls = true,
    showFullscreenButton = true,
    useCover = true,
    contentPageCount,
    fullscreenThumbnails = [],
    overlayBackHref = '',
    overlayBackLabel = 'Back'
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
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [mobilePageIndex, setMobilePageIndex] = useState(0);
    const [mobileTurnDirection, setMobileTurnDirection] = useState('next');
    const [mobileTurnTick, setMobileTurnTick] = useState(0);
    const [mobilePreviousPageSrc, setMobilePreviousPageSrc] = useState('');
    const [mobileIsTurning, setMobileIsTurning] = useState(false);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const hideUiTimeoutRef = useRef(null);
    const mobileTurnTimerRef = useRef(null);
    const lastMousePositionRef = useRef({ x: null, y: null });
    const touchStartXRef = useRef(null);
    const goNextRef = useRef(() => { });
    const goPreviousRef = useRef(() => { });
    const closeFullscreenRef = useRef(() => { });
    const totalViews = maxPage - minPage + 1;
    const activeView = currentPage - minPage + 1;
    const activeThumbnailIndex = Math.max(0, currentPage - minPage);
    const isClosedCover = useCover && currentPage === 0;
    const isBackClosed = useCover && currentPage === totalSheets;
    const isTrailingSinglePage = !useCover && resolvedContentPages % 2 === 1 && currentPage === maxPage;
    const showMobileSinglePage = isFullscreen && isMobileViewport && fullscreenThumbnails.length > 0;
    const hasPageLevelPreview =
        fullscreenThumbnails.length > 0 &&
        ((contentPageCount != null && fullscreenThumbnails.length === contentPageCount) ||
            fullscreenThumbnails.length !== totalViews);
    const desktopPageProgress = (() => {
        if (!hasPageLevelPreview) {
            return { active: activeView, total: totalViews };
        }

        if (useCover) {
            const total = Math.max(1, fullscreenThumbnails.length - 1);
            const active = currentPage === 0 ? 1 : Math.min(fullscreenThumbnails.length, currentPage * 2);
            return { active: Math.min(active, total), total };
        }

        const relative = Math.max(0, currentPage - minPage);
        const active = Math.min(fullscreenThumbnails.length, relative * 2 + 1);
        return { active, total: fullscreenThumbnails.length };
    })();
    const navTotalViews = showMobileSinglePage ? fullscreenThumbnails.length : desktopPageProgress.total;
    const navActiveView = showMobileSinglePage ? mobilePageIndex + 1 : desktopPageProgress.active;
    const navProgressPercent = Math.round((navActiveView / Math.max(navTotalViews, 1)) * 100);
    const navRemainingViews = Math.max(navTotalViews - navActiveView, 0);
    const desktopLastContentPage = hasPageLevelPreview
        ? useCover
            ? Math.max(minPage, Math.ceil((fullscreenThumbnails.length - 1) / 2))
            : Math.max(minPage, Math.floor((fullscreenThumbnails.length - 1) / 2) + minPage)
        : maxPage;
    const isAtNavStart = showMobileSinglePage ? mobilePageIndex <= 0 : currentPage === minPage;
    const isAtNavEnd = showMobileSinglePage
        ? mobilePageIndex >= Math.max(fullscreenThumbnails.length - 1, 0)
        : currentPage >= desktopLastContentPage;
    const currentMobilePage = fullscreenThumbnails[mobilePageIndex];
    const activePreviewIndex = showMobileSinglePage
        ? mobilePageIndex
        : (() => {
            if (!hasPageLevelPreview) return activeThumbnailIndex;
            if (useCover) {
                return currentPage === 0 ? 0 : Math.min(fullscreenThumbnails.length - 1, currentPage * 2 - 1);
            }
            const relative = Math.max(0, currentPage - minPage);
            return Math.min(fullscreenThumbnails.length - 1, relative * 2);
        })();

    // Keep local fullscreen state in sync if parent passes a different default.
    useEffect(() => {
        setIsFullscreen(lockFullscreen ? true : fullScreen);
    }, [fullScreen, lockFullscreen]);

    // Reset reading position when sheet set or cover mode changes.
    useEffect(() => {
        setCurrentPage(initialPage);
    }, [initialPage, totalSheets]);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 640px)');
        const sync = () => setIsMobileViewport(media.matches);
        sync();
        media.addEventListener('change', sync);
        return () => media.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        setMobilePageIndex(0);
    }, [fullscreenThumbnails.length]);

    useEffect(() => {
        return () => {
            if (mobileTurnTimerRef.current) {
                clearTimeout(mobileTurnTimerRef.current);
                mobileTurnTimerRef.current = null;
            }
        };
    }, []);

    function beginMobileTurn(direction, nextIndex) {
        const currentSrc = fullscreenThumbnails[mobilePageIndex]?.src;
        if (!currentSrc || nextIndex === mobilePageIndex) {
            setMobilePageIndex(nextIndex);
            return;
        }

        if (mobileTurnTimerRef.current) {
            clearTimeout(mobileTurnTimerRef.current);
        }

        setMobileTurnDirection(direction);
        setMobileTurnTick((tick) => tick + 1);
        setMobilePreviousPageSrc(currentSrc);
        setMobilePageIndex(nextIndex);
        setMobileIsTurning(true);
        mobileTurnTimerRef.current = setTimeout(() => {
            setMobileIsTurning(false);
            setMobilePreviousPageSrc('');
            mobileTurnTimerRef.current = null;
        }, MOBILE_FLIP_DURATION_MS);
    }

    useEffect(() => {
        goNextRef.current = goNext;
        goPreviousRef.current = goPrevious;
        closeFullscreenRef.current = closeFullscreen;
    });

    // Lock page scroll, support keyboard controls, and auto-hide overlay UI.
    useEffect(() => {
        if (!isFullscreen) {
            setShowOverlayUi(true);
            document.body.style.cursor = '';
            lastMousePositionRef.current = { x: null, y: null };
            if (hideUiTimeoutRef.current) {
                clearTimeout(hideUiTimeoutRef.current);
                hideUiTimeoutRef.current = null;
            }
            return;
        }

        const originalOverflow = document.body.style.overflow;
        const HIDE_DELAY_MS = 2200;
        const MOVE_THRESHOLD_PX = 8;

        const restartHideTimer = () => {
            if (ALWAYS_SHOW_OVERLAY) return;

            if (hideUiTimeoutRef.current) {
                clearTimeout(hideUiTimeoutRef.current);
            }

            hideUiTimeoutRef.current = setTimeout(() => {
                setShowOverlayUi(false);
                document.body.style.cursor = 'none';
            }, HIDE_DELAY_MS);
        };

        const revealUi = () => {
            setShowOverlayUi(true);
            document.body.style.cursor = '';
            restartHideTimer();
        };

        const onPointerMove = (event) => {
            const last = lastMousePositionRef.current;
            const deltaX = last.x === null ? Infinity : Math.abs(event.clientX - last.x);
            const deltaY = last.y === null ? Infinity : Math.abs(event.clientY - last.y);

            lastMousePositionRef.current = { x: event.clientX, y: event.clientY };

            // Only reveal when cursor actually moves, not from synthetic/no-op mousemove events.
            if (deltaX < MOVE_THRESHOLD_PX && deltaY < MOVE_THRESHOLD_PX) {
                return;
            }

            revealUi();
        };

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeFullscreenRef.current();
                return;
            }

            // Left Arrow = previous sheet
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                goPreviousRef.current();
                return;
            }

            // Right Arrow and Space = next sheet
            if (event.key === 'ArrowRight' || event.key === ' ' || event.code === 'Space') {
                event.preventDefault();
                goNextRef.current();
            }
        };

        document.body.style.overflow = 'hidden';
        setShowOverlayUi(true);
        document.body.style.cursor = '';

        if (!ALWAYS_SHOW_OVERLAY) {
            revealUi();
        }

        // Netflix-style behavior requested: overlays return only on cursor movement.
        window.addEventListener('keydown', onKeyDown);
        if (!ALWAYS_SHOW_OVERLAY) {
            window.addEventListener('mousemove', onPointerMove);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('touchstart', revealUi, { passive: true });
        }

        return () => {
            document.body.style.overflow = originalOverflow;
            document.body.style.cursor = '';
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('mousemove', onPointerMove);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('touchstart', revealUi);
            lastMousePositionRef.current = { x: null, y: null };

            if (hideUiTimeoutRef.current) {
                clearTimeout(hideUiTimeoutRef.current);
                hideUiTimeoutRef.current = null;
            }
        };
    }, [isFullscreen, ALWAYS_SHOW_OVERLAY]);

    function goNext() {
        if (showMobileSinglePage) {
            const nextIndex = Math.min(mobilePageIndex + 1, Math.max(fullscreenThumbnails.length - 1, 0));
            beginMobileTurn('next', nextIndex);
            return;
        }
        setCurrentPage((prev) => Math.min(prev + 1, desktopLastContentPage));
    }

    function goPrevious() {
        if (showMobileSinglePage) {
            const nextIndex = Math.max(mobilePageIndex - 1, 0);
            beginMobileTurn('prev', nextIndex);
            return;
        }
        setCurrentPage((prev) => Math.max(prev - 1, minPage));
    }

    function closeFullscreen() {
        if (lockFullscreen) return;
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
            className={`book-demo ${isFullscreen ? 'book-demo-overlay' : ''} ${isFullscreen && !ALWAYS_SHOW_OVERLAY && !showOverlayUi ? 'book-cursor-hidden' : ''
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
                <header className={`book-overlay-top ${showOverlayUi || ALWAYS_SHOW_OVERLAY ? '' : 'controls-hidden'} `}>
                    <div className="book-overlay-top-left w-full flex justify-between px-6!">
                        <h2 className='items-center h-full flex'>{title}</h2>
                        {overlayBackHref && (
                            <a href={overlayBackHref} className="book-button no-underline">
                                {overlayBackLabel}
                            </a>
                        )}
                    </div>
                    {/* {!lockFullscreen && (
                        <button type="button" className="book-button" onClick={closeFullscreen}>
                            Exit Full Screen
                        </button>
                    )} */}
                </header>
            )}

            {/* Perspective scene gives depth to rotateY transforms */}
            <div
                className={`book-scene ${isFullscreen ? 'book-scene-overlay' : ''}`}
                onClick={onSceneClick}
                onTouchStart={onSceneTouchStart}
                onTouchEnd={onSceneTouchEnd}
            >
                {showMobileSinglePage ? (
                    <div className="book-mobile-page">
                        <img
                            src={currentMobilePage?.src}
                            alt={currentMobilePage?.label || `Page ${mobilePageIndex + 1}`}
                            className={`book-mobile-page-image book-mobile-page-image-incoming ${mobileIsTurning ? (mobileTurnDirection === 'prev' ? 'turn-prev' : 'turn-next') : ''
                                }`}
                        />
                        {mobileIsTurning && mobilePreviousPageSrc && (
                            <img
                                key={`${mobileTurnTick}-${mobileTurnDirection}`}
                                src={mobilePreviousPageSrc}
                                alt="Previous page"
                                className={`book-mobile-page-image book-mobile-page-image-outgoing ${mobileTurnDirection === 'prev' ? 'turn-prev' : 'turn-next'
                                    }`}
                            />
                        )}
                    </div>
                ) : (
                    <div
                        className={`book ${isFullscreen ? 'book-overlay-size' : ''} book-orientation-${orientation} ${isClosedCover ? 'book-closed' : ''
                            } ${isBackClosed ? 'book-back-closed' : ''} ${isTrailingSinglePage ? 'book-single-tail' : ''} ${isClosedCover ? 'book-cover-centered' : ''
                            }`}
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
                )}
            </div>

            {/* Standard controls for non-fullscreen mode */}
            {!isFullscreen && showEmbeddedControls && (
                <div className="book-controls">
                    <button
                        type="button"
                        className="book-button"
                        onClick={goPrevious}
                        disabled={currentPage === minPage}
                    >
                        Previous
                    </button>
                    <button type="button" className="book-button" onClick={goNext} disabled={currentPage === maxPage}>
                        Next
                    </button>
                    {showFullscreenButton && (
                        <button type="button" className="book-button" onClick={() => setIsFullscreen(true)}>
                            Full Screen
                        </button>
                    )}
                </div>
            )}

            {/* Netflix-like bottom bar while in fullscreen mode */}
            {isFullscreen && (
                <footer className={`book-overlay-bottom ${showOverlayUi || ALWAYS_SHOW_OVERLAY ? '' : 'controls-hidden'}`}>
                    <div className="book-overlay-nav-row">
                        {fullscreenThumbnails.length > 0 && (
                            <button
                                type="button"
                                className="book-button book-preview-open-button h-12 w-12 p-2!"
                                onClick={() => setIsPreviewModalOpen(true)}
                            >
                                <img src="/images/icon/apps-white.png" alt="" aria-hidden="true" className="book-preview-open-icon h-full w-full" />
                            </button>
                        )}
                        <div className="book-overlay-progress">
                            <div className="book-overlay-progress-top">
                                <p>
                                    Page {navActiveView} of {navTotalViews}
                                </p>
                                <p>
                                    {navRemainingViews === 0
                                        ? 'Last page'
                                        : `${navRemainingViews} page${navRemainingViews > 1 ? 's' : ''} left`}
                                </p>
                            </div>
                            <div className="book-overlay-progress-track" aria-hidden="true">
                                <div className="book-overlay-progress-fill" style={{ width: `${navProgressPercent}%` }} />
                            </div>
                        </div>

                        <div className="book-overlay-nav-actions">
                            <button
                                type="button"
                                className="book-button"
                                onClick={goPrevious}
                                disabled={isAtNavStart}
                            >
                                Previous
                            </button>
                            <button type="button" className="book-button" onClick={goNext} disabled={isAtNavEnd}>
                                Next
                            </button>
                        </div>
                    </div>
                </footer>
            )}

            {isPreviewModalOpen && (
                <div className="book-preview-modal-backdrop" onClick={() => setIsPreviewModalOpen(false)}>
                    <div className="book-preview-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="book-preview-modal-header">
                            <h3>Pages Preview</h3>
                            <button type="button" className="book-button" onClick={() => setIsPreviewModalOpen(false)}>
                                Close
                            </button>
                        </div>
                        <div className="book-preview-modal-grid">
                            {fullscreenThumbnails.map((thumbnail, index) => (
                                <button
                                    key={`preview-${thumbnail.src}-${index}`}
                                    type="button"
                                    className={`book-preview-modal-item ${activePreviewIndex === index ? 'active' : ''}`}
                                    onClick={() => {
                                        if (showMobileSinglePage) {
                                            beginMobileTurn(index < mobilePageIndex ? 'prev' : 'next', index);
                                        } else if (hasPageLevelPreview) {
                                            if (useCover) {
                                                setCurrentPage(index === 0 ? 0 : Math.min(maxPage, Math.ceil(index / 2)));
                                            } else {
                                                setCurrentPage(Math.min(maxPage, Math.floor(index / 2) + minPage));
                                            }
                                        } else {
                                            setCurrentPage(Math.min(maxPage, minPage + index));
                                        }
                                        setIsPreviewModalOpen(false);
                                    }}
                                >
                                    <img src={thumbnail.src} alt={thumbnail.label || `Page ${index + 1}`} />
                                    <span>{index + 1}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
