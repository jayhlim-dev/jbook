'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Book } from './Book';

function createContentPageNode(page) {
    return (
        <div className="flipbook-media-fill">
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
    const coverFront = createCoverNode('Your Flipbook', `${pages.length} generated page${pages.length === 1 ? '' : 's'}`);
    const blankPage = <div className="h-full w-full rounded-sm border border-white/10 bg-black/10" />;
    const pageNodes = pages.map((page) => createContentPageNode(page));

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

function formatBookDate(value) {
    if (!value) return 'Recently';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Recently';
    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
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

    const createdAtText = formatBookDate(bookData?.createdAt);
    const bookTitle = `Book ${bookId.slice(0, 8)}`;

    return (
        <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
            <div className="rounded-[30px] border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.08)] sm:p-6">
                <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-8">
                        <img src="/images/logo/main-logo-black.png" alt="Flipy logo" className="h-10 w-auto" />
                        <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 lg:flex">
                            <Link href="/" className="no-underline">
                                Home
                            </Link>
                            <span className="border-b-2 border-indigo-500 pb-1 text-indigo-600">My Books</span>
                            <button type="button">Templates</button>
                            <button type="button">Pricing</button>
                            <button type="button">Resources</button>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                            Share
                        </button>
                        <button type="button" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                            Download
                        </button>
                    </div>
                </header>

                <div className="mt-5 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <aside className="rounded-2xl border border-slate-200 bg-[#f8f7fc] p-4">
                        <Link href="/" className="text-sm font-semibold text-slate-600 no-underline">
                            ← Back to My Books
                        </Link>

                        <div className="mt-4 flex items-start gap-3 rounded-xl bg-white p-3">
                            <div className="h-20 w-14 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                {pages[0]?.src && <img src={pages[0].src} alt="Book cover" className="h-full w-full object-cover" />}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">{bookTitle}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {createdAtText} · {pages.length} pages
                                </p>
                                <p className="mt-2 text-xs font-semibold text-emerald-600">Uploaded successfully</p>
                            </div>
                        </div>

                        <ul className="mt-4 space-y-1 text-sm font-semibold text-slate-600">
                            <li className="rounded-lg bg-indigo-100 px-3 py-2 text-indigo-700">View Flipbook</li>
                            <li className="rounded-lg px-3 py-2">Customize</li>
                            <li className="rounded-lg px-3 py-2">Pages</li>
                            <li className="rounded-lg px-3 py-2">Share</li>
                            <li className="rounded-lg px-3 py-2">Download</li>
                            <li className="rounded-lg px-3 py-2">Analytics</li>
                            <li className="rounded-lg px-3 py-2">Settings</li>
                        </ul>
                    </aside>

                    <main className="rounded-2xl border border-slate-200 bg-[#f8f7fc] p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h1 className="text-xl font-black text-slate-900">{bookTitle}</h1>
                                <p className="text-xs text-slate-500">Book ID: {bookId}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                >
                                    Orientation: {bookData?.orientation || 'portrait'}
                                </button>
                                <button
                                    type="button"
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                >
                                    Cover: {bookData?.useCover ? 'On' : 'Off'}
                                </button>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <Book
                                sheets={sheets}
                                title="Generated Flipbook"
                                orientation={bookData?.orientation || 'portrait'}
                                useCover={bookData?.useCover ?? true}
                                contentPageCount={pages.length}
                            />
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Page strip</p>
                            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                                {pages.slice(0, 8).map((page, index) => (
                                    <article
                                        key={page.src}
                                        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-1 text-center"
                                    >
                                        <div className="aspect-3/4 overflow-hidden rounded-md bg-slate-200">
                                            <img src={page.src} alt={page.label} className="h-full w-full object-cover" />
                                        </div>
                                        <p className="mt-1 text-[10px] font-semibold text-slate-500">{index + 1}</p>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </section>
    );
}
