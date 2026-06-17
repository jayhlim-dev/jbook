'use client';

import { useEffect, useMemo, useState } from 'react';
import { Book } from './Book';
import Link from 'next/link';

function createContentPageNode(page, variant = 'page') {
    return (
        <div className={`flipbook-media-fill ${variant === 'cover' ? 'flipbook-media-fill-cover' : ''}`}>
            <img src={page.src} alt={page.label} className="h-full w-full object-cover" />
        </div>
    );
}

function createCoverNode(title, subtitle) {
    return (
        <div className="flex h-full flex-col justify-between">
            <div>
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">Flipbook Studio</p>
                <h3 className="mt-3 text-3xl font-black">{title}</h3>
                <p className="mt-2 text-white/80">{subtitle}</p>
            </div>
            <p className="text-sm text-white/65">Loaded from cloud storage.</p>
        </div>
    );
}

function buildSheetsFromPages(pages, useCover) {
    const coverFront = createCoverNode(
        'Your Flipbook',
        `${pages.length} generated page${pages.length === 1 ? '' : 's'}`
    );
    const blankPage = <div className="h-full w-full rounded-sm border border-white/10 bg-black/10" />;
    const pageNodes = pages.map((page, index) =>
        createContentPageNode(page, useCover && index === 0 ? 'cover' : 'page')
    );

    if (!pages.length) {
        return [{ front: coverFront, back: blankPage }];
    }

    if (!useCover) {
        const sheetCount = Math.max(1, Math.ceil((pageNodes.length + 1) / 2));
        const sheets = [];

        for (let i = 0; i < sheetCount; i += 1) {
            sheets.push({
                front: i === 0 ? blankPage : pageNodes[2 * i - 1] || blankPage,
                back: pageNodes[2 * i] || blankPage
            });
        }

        return sheets;
    }

    const coverNode = pageNodes[0] || coverFront;
    const insidePages = pageNodes.slice(1);
    const sheetCount = Math.max(1, Math.ceil((insidePages.length + 1) / 2));
    const sheets = [];
    let insideCursor = 0;

    for (let i = 0; i < sheetCount; i += 1) {
        if (i === 0) {
            sheets.push({
                front: coverNode,
                back: insidePages[insideCursor++] || blankPage
            });
            continue;
        }

        sheets.push({
            front: insidePages[insideCursor++] || blankPage,
            back: insidePages[insideCursor++] || blankPage
        });
    }

    return sheets;
}

export function HostedFlipbookViewer({ bookId }) {
    const [status, setStatus] = useState('loading');
    const [bookData, setBookData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let isMounted = true;

        async function loadBook() {
            setStatus('loading');
            setError('');

            try {
                const response = await fetch(`/api/flipbooks/${encodeURIComponent(bookId)}`);
                const result = await response.json().catch(() => null);

                if (!response.ok) {
                    throw new Error(result?.error || 'Could not load this flipbook.');
                }

                if (!isMounted) return;
                setBookData(result);
                setStatus('ready');
            } catch (fetchError) {
                if (!isMounted) return;
                setError(fetchError?.message || 'Could not load this flipbook.');
                setStatus('error');
            }
        }

        void loadBook();

        return () => {
            isMounted = false;
        };
    }, [bookId]);

    const pages = useMemo(() => {
        if (!bookData?.pages) return [];

        return bookData.pages.map((page, index) => ({
            src: page.signedUrl,
            label: `Page ${index + 1}`
        }));
    }, [bookData]);

    const sheets = useMemo(() => {
        return buildSheetsFromPages(pages, bookData?.useCover ?? true);
    }, [pages, bookData?.useCover]);

    const fullscreenThumbnails = useMemo(() => {
        if (!pages.length) return [];

        return pages.map((page, index) => ({
            src: page.src,
            label: `Page ${index + 1}`
        }));
    }, [pages]);

    if (status === 'loading') {
        return (
            <section className="mx-auto w-full max-w-6xl px-4 py-14 text-center">
                <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Loading</p>
                <h1 className="mt-3 text-4xl font-black text-slate-900">Opening your flipbook...</h1>
                <p className="mt-2 text-slate-600">Fetching pages from cloud storage.</p>
            </section>
        );
    }

    if (status === 'error') {
        return (
            <section className="mx-auto w-full max-w-4xl px-4 py-16 text-center">
                <p className="text-sm uppercase tracking-[0.2em] text-red-500">Error</p>
                <h1 className="mt-3 text-4xl font-black text-slate-900">Could not open this flipbook</h1>
                <p className="mt-2 text-slate-600">{error}</p>
                <Link href="/" className="book-button mt-6 inline-flex px-6 py-3 text-base no-underline">
                    Back to studio
                </Link>
            </section>
        );
    }

    return (
        <section>
            <Book
                sheets={sheets}
                title={
                    <span className="book-overlay-brand">
                        <img src="/images/logo/main-logo-black.png" alt="Flipy" className="book-overlay-brand-logo" />
                        <span className="book-overlay-brand-tag">Preview</span>
                    </span>
                }
                fullScreen
                lockFullscreen
                showEmbeddedControls={false}
                orientation={bookData?.orientation || 'portrait'}
                useCover={bookData?.useCover ?? true}
                contentPageCount={pages.length}
                fullscreenThumbnails={fullscreenThumbnails}
                overlayBackHref="/"
                overlayBackLabel="Back to studio"
            />
        </section>
    );
}
