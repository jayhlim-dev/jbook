'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Book } from './Book';

const MAX_FILES = 10;
const MAX_PAGES = 10;
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const MAX_TOTAL_UPLOAD_BYTES = 60 * 1024 * 1024; // 60 MB combined
const ADMIN_MODE = process.env.NEXT_PUBLIC_ADMIN_MODE === 'true';

function isSupportedFile(file) {
    return file.type.startsWith('image/') || file.type === 'application/pdf';
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function convertPdfToPageImages(file) {
    // Lazy-load PDF.js so image-only flows stay fast.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // Use local bundled worker (no CDN dependency) for reliable loading.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        import.meta.url
    ).toString();
    const data = await file.arrayBuffer();
    let pdf;

    try {
        pdf = await pdfjs.getDocument({ data }).promise;
    } catch (primaryError) {
        // Fallback path: some files parse better through blob URL loading.
        const blobUrl = URL.createObjectURL(file);
        try {
            pdf = await pdfjs.getDocument({ url: blobUrl }).promise;
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }
    const pageImages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const maxDim = 1800;
        const scale = Math.min(maxDim / baseViewport.width, maxDim / baseViewport.height, 1.8);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) {
            throw new Error('Canvas context unavailable while rendering PDF page.');
        }

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;
        pageImages.push(canvas.toDataURL('image/jpeg', 0.92));
    }

    return pageImages;
}

function createPreviewPageNode(page) {
    return (
        <div className="flipbook-media-fill">
            <img src={page.src} alt={page.label} className="h-full w-full object-cover" />
        </div>
    );
}

function buildPreviewSheets(pages, useCover) {
    const blankPage = <div className="h-full w-full bg-white" />;
    const pageNodes = pages.map((page) => createPreviewPageNode(page));

    if (!pageNodes.length) return [];

    if (!useCover) {
        const sheetCount = Math.max(1, Math.ceil((pageNodes.length + 1) / 2));
        return Array.from({ length: sheetCount }, (_, i) => ({
            front: i === 0 ? blankPage : pageNodes[2 * i - 1] || blankPage,
            back: pageNodes[2 * i] || blankPage
        }));
    }

    const coverNode = pageNodes[0];
    const insidePages = pageNodes.slice(1);
    const sheetCount = Math.max(1, Math.ceil((insidePages.length + 1) / 2));
    let insideCursor = 0;

    return Array.from({ length: sheetCount }, (_, i) => {
        if (i === 0) {
            return {
                front: coverNode,
                back: insidePages[insideCursor++] || blankPage
            };
        }

        return {
            front: insidePages[insideCursor++] || blankPage,
            back: insidePages[insideCursor++] || blankPage
        };
    });
}

export function FlipbookStudio() {
    const router = useRouter();
    const [orientation, setOrientation] = useState('portrait');
    const [useCover, setUseCover] = useState(true);
    const [items, setItems] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessingUploads, setIsProcessingUploads] = useState(false);
    const [showLoadingModal, setShowLoadingModal] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState('');
    const [isSavingBook, setIsSavingBook] = useState(false);
    const [cloudSaveError, setCloudSaveError] = useState('');
    const [cloudSaveMessage, setCloudSaveMessage] = useState('');
    const inputRef = useRef(null);
    const itemsRef = useRef(items);

    const totalCount = items.length;
    const featureCards = [
        {
            title: 'Easy Upload',
            description: 'Upload PDF or images in seconds.',
            icon: '/images/icon/cloud.png'
        },
        {
            title: 'Flipbook',
            description: 'Page-flip effect with smooth animation.',
            icon: '/images/icon/knowledge.png'
        },
        // {
        //     title: 'Customize',
        //     description: 'Add logo, colors, domain and branding.',
        //     icon: '/images/icon/edit.png'
        // },
        {
            title: 'Share ',
            description: 'Share, embed or download your flipbook.',
            icon: '/images/icon/share.png'
        }
    ];
    const totalGeneratedPages = useMemo(
        () => items.reduce((sum, item) => sum + (item.kind === 'image' ? 1 : item.pdfPages.length), 0),
        [items]
    );
    const totalUploadedBytes = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);

    const pages = useMemo(() => {
        return items.flatMap((item) => {
            if (item.kind === 'image') {
                return [{ type: 'image', src: item.previewUrl, label: item.file.name }];
            }

            return item.pdfPages.map((src, index) => ({
                type: 'image',
                src,
                label: `${item.file.name} - Page ${index + 1}`
            }));
        });
    }, [items]);
    const previewThumbnails = useMemo(
        () =>
            pages.map((page, index) => ({
                src: page.src,
                label: page.label || `Page ${index + 1}`
            })),
        [pages]
    );
    const previewSheets = useMemo(() => buildPreviewSheets(pages, useCover), [pages, useCover]);

    async function addFiles(fileList) {
        if (!fileList?.length) return;
        const incoming = Array.from(fileList).filter(isSupportedFile);
        if (!incoming.length) return;
        setUploadError('');
        setIsProcessingUploads(true);

        try {
            const availableSlots = Math.max(0, MAX_FILES - itemsRef.current.length);
            const accepted = ADMIN_MODE ? incoming : incoming.slice(0, availableSlots);
            const prepared = [];
            const failedFiles = [];
            let pageSlotsRemaining = ADMIN_MODE
                ? Number.POSITIVE_INFINITY
                : Math.max(0, MAX_PAGES - totalGeneratedPages);
            let bytesRemaining = ADMIN_MODE
                ? Number.POSITIVE_INFINITY
                : Math.max(0, MAX_TOTAL_UPLOAD_BYTES - totalUploadedBytes);

            for (const file of accepted) {
                if (!ADMIN_MODE && file.size > MAX_FILE_SIZE_BYTES) {
                    failedFiles.push(
                        `${file.name} (${formatBytes(file.size)} too large, max ${formatBytes(MAX_FILE_SIZE_BYTES)} — please compress first)`
                    );
                    continue;
                }

                if (!ADMIN_MODE && file.size > bytesRemaining) {
                    failedFiles.push(
                        `${file.name} (total upload limit ${formatBytes(MAX_TOTAL_UPLOAD_BYTES)} reached — please compress files)`
                    );
                    continue;
                }

                if (!ADMIN_MODE && pageSlotsRemaining <= 0) {
                    failedFiles.push(`${file.name} (page limit reached: max ${MAX_PAGES})`);
                    continue;
                }

                if (file.type.startsWith('image/')) {
                    prepared.push({
                        id: crypto.randomUUID(),
                        file,
                        kind: 'image',
                        previewUrl: URL.createObjectURL(file),
                        pdfPages: []
                    });
                    pageSlotsRemaining -= 1;
                    bytesRemaining -= file.size;
                    continue;
                }

                try {
                    const pdfPages = await convertPdfToPageImages(file);
                    const allowedPages = ADMIN_MODE ? pdfPages : pdfPages.slice(0, pageSlotsRemaining);
                    if (!allowedPages.length) {
                        failedFiles.push(`${file.name} (no page slots remaining)`);
                        continue;
                    }

                    if (!ADMIN_MODE && allowedPages.length < pdfPages.length) {
                        failedFiles.push(
                            `${file.name} (trimmed to ${allowedPages.length} pages due to max ${MAX_PAGES})`
                        );
                    }

                    prepared.push({
                        id: crypto.randomUUID(),
                        file,
                        kind: 'pdf',
                        previewUrl: allowedPages[0] || '',
                        pdfPages: allowedPages
                    });
                    pageSlotsRemaining -= allowedPages.length;
                    bytesRemaining -= file.size;
                } catch (error) {
                    failedFiles.push(`${file.name} (${error?.message || 'unknown error'})`);
                }
            }

            if (failedFiles.length) {
                setUploadError(`Could not read PDF: ${failedFiles.join('; ')}`);
            }

            if (prepared.length) {
                setItems((prev) => [...prev, ...prepared]);
            }
        } finally {
            setIsProcessingUploads(false);
        }
    }

    function removeItem(id) {
        setItems((prev) => {
            const target = prev.find((item) => item.id === id);
            if (target?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((item) => item.id !== id);
        });
    }

    function clearPreviewBook() {
        itemsRef.current.forEach((item) => {
            if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
        });
        setItems([]);
        setUploadError('');
        setCloudSaveError('');
        setCloudSaveMessage('');
    }

    function handleFileInput(event) {
        void addFiles(event.target.files);
        event.target.value = '';
    }

    async function createPageFileFromSource(src, index) {
        const response = await fetch(src);
        if (!response.ok) {
            throw new Error(`Could not prepare page ${index + 1} for upload.`);
        }

        const blob = await response.blob();
        const fallbackType = 'image/jpeg';
        const mimeType = blob.type || fallbackType;
        const extension = mimeType === 'image/png' ? 'png' : 'jpg';
        return new File([blob], `page-${String(index + 1).padStart(3, '0')}.${extension}`, { type: mimeType });
    }

    async function savePagesToCloudStorage() {
        const pageFiles = await Promise.all(pages.map((page, index) => createPageFileFromSource(page.src, index)));
        const body = new FormData();
        pageFiles.forEach((file) => body.append('pages', file));
        body.append('orientation', orientation);
        body.append('useCover', String(useCover));

        const response = await fetch('/api/flipbooks', {
            method: 'POST',
            body
        });

        const result = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(result?.error || 'Cloud upload failed.');
        }

        return result;
    }

    async function generateBook(openReader = true) {
        if (!pages.length) return;
        setCloudSaveError('');
        setCloudSaveMessage('');
        setIsSavingBook(true);

        try {
            const cloudResult = await savePagesToCloudStorage();
            setCloudSaveMessage(
                `Saved ${cloudResult.uploadedCount} page${cloudResult.uploadedCount === 1 ? '' : 's'} to cloud storage.`
            );
            if (openReader && cloudResult?.bookUrl) {
                router.push(cloudResult.bookUrl);
                return;
            }

            if (openReader && cloudResult?.bookId) {
                router.push(`/${cloudResult.bookId}`);
            }
        } catch (error) {
            setCloudSaveError(error?.message || 'Could not upload generated book to cloud storage.');
        } finally {
            setIsSavingBook(false);
        }
    }

    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    // Fake progress animation: climbs while processing, completes only when upload truly ends.
    useEffect(() => {
        if (isProcessingUploads) {
            setShowLoadingModal(true);
            setUploadProgress((prev) => (prev > 1 ? prev : 1));

            const timer = setInterval(() => {
                setUploadProgress((prev) => {
                    // Progress intentionally slows down near the end to avoid "stuck at 92%" perception.
                    if (prev >= 88) return prev;
                    const step = prev < 18 ? 2.2 : prev < 38 ? 1.6 : prev < 58 ? 1.1 : prev < 74 ? 0.8 : 0.4;
                    return Math.min(prev + step, 88);
                });
            }, 380);

            return () => clearInterval(timer);
        }

        if (!showLoadingModal) return;

        setUploadProgress(100);
        const closeTimer = setTimeout(() => {
            setShowLoadingModal(false);
            setUploadProgress(0);
        }, 460);

        return () => clearTimeout(closeTimer);
    }, [isProcessingUploads, showLoadingModal]);

    // Revoke any remaining object URLs only when the studio unmounts.
    useEffect(() => {
        return () => {
            itemsRef.current.forEach((item) => {
                if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
            });
        };
    }, []);

    return (
        <section className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6">
            <input
                ref={inputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                className="hidden"
                onChange={handleFileInput}
            />

            <div className="rounded-[30px] border border-slate-200/80 bg-white/95 p-4 text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
                <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-10">
                        <img src="/images/logo/main-logo-black.png" alt="Flipy logo" className="h-10 w-auto" />
                        <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 lg:flex">
                            <Link href="/">
                                <button type="button" className="text-indigo-600">
                                    Home
                                </button>
                            </Link>
                            <Link href="/my-books">
                                <button type="button">My Books</button>
                            </Link>
                        </nav>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* <button
                            type="button"
                            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                            Log in
                        </button>
                        <button
                            type="button"
                            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
                        >
                            Sign up free
                        </button> */}
                    </div>
                </header>

                <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
                    <section className="self-start rounded-3xl bg-[#f6f5fb] p-6 lg:p-8">
                        <span className="inline-flex rounded-full bg-indigo-100 px-4 py-1 text-sm font-semibold text-indigo-700">
                            Create. Upload. Flip.
                        </span>
                        <h1 className="mt-5 text-4xl font-black leading-[1.08] text-slate-900 sm:text-5xl">
                            Turn your PDFs and images into beautiful <span className="text-indigo-600">flipbooks.</span>
                        </h1>
                        <p className="mt-5 text-lg leading-relaxed text-slate-600">
                            Upload your PDF or PNG files and we will turn them into a flipbook in seconds.
                        </p>

                        <div className="mt-7 flex flex-wrap gap-3">
                            <button
                                type="button"
                                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                                onClick={() => inputRef.current?.click()}
                                disabled={isProcessingUploads}
                            >
                                {isProcessingUploads ? 'Processing...' : 'Upload Your File'}
                            </button>
                            <button
                                type="button"
                                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                onClick={() => void generateBook(true)}
                                disabled={!items.length || isProcessingUploads || isSavingBook}
                            >
                                {isSavingBook ? 'Saving...' : 'Try Demo'}
                            </button>
                        </div>

                        <p className="mt-4 text-sm text-slate-500">
                            PDF, PNG, JPG or ZIP.{' '}
                            {ADMIN_MODE
                                ? 'Admin mode: Unlimited upload size/pages/files'
                                : `Max ${formatBytes(MAX_TOTAL_UPLOAD_BYTES)}`}
                        </p>

                        <div className="mt-8 grid gap-4">
                            <article className="rounded-2xl border border-slate-200 bg-white p-5">
                                <h3 className="text-lg font-bold text-slate-900">Everything you need</h3>
                                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {featureCards.map((feature) => (
                                        <article
                                            key={feature.title}
                                            className="rounded-xl border border-slate-200 bg-[#f8f7fc] p-5"
                                        >
                                            <div className="mb-3 inline-flex rounded-xl bg-white p-3">
                                                <img
                                                    src={feature.icon}
                                                    alt={`${feature.title} icon`}
                                                    className="h-6 w-6 object-contain"
                                                />
                                            </div>
                                            <h4 className="text-base font-bold leading-tight text-slate-900">
                                                {feature.title}
                                            </h4>
                                            <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                                {feature.description}
                                            </p>
                                        </article>
                                    ))}
                                </div>
                            </article>
                            {/* <article className="rounded-2xl border border-slate-200 bg-[#f8f7fc] p-4">
                                <h3 className="text-lg font-bold text-slate-900">Recent books</h3>
                                <p className="mt-3 text-sm text-slate-600">
                                    {items.length
                                        ? `${items.length} source file${items.length > 1 ? 's' : ''} loaded`
                                        : 'No recent book yet'}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Generate a new book to get your unique share URL.
                                </p>
                            </article> */}
                        </div>
                    </section>

                    <section className="rounded-3xl bg-[#f8f7fc] p-6">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="mb-4 flex flex-wrap items-center gap-3">
                                {['portrait', 'landscape'].map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setOrientation(mode)}
                                        className={`rounded-lg border px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                                            orientation === mode
                                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                        }`}
                                    >
                                        {mode === 'portrait' ? 'Portrait' : 'Landscape'}
                                    </button>
                                ))}
                            </div>

                            <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={useCover}
                                    onChange={(event) => setUseCover(event.target.checked)}
                                    className="h-4 w-4 accent-indigo-600"
                                />
                                <span>Include cover page</span>
                                <span className="group relative inline-flex items-center">
                                    <span
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-500"
                                        aria-label="Cover page info"
                                    >
                                        i
                                    </span>
                                    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-60 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1.5 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                                        Adds your first uploaded page as a front cover before the rest of the book.
                                    </span>
                                </span>
                            </label>

                            <div
                                className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
                                    isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50'
                                }`}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setIsDragging(true);
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    setIsDragging(false);
                                    void addFiles(event.dataTransfer.files);
                                }}
                            >
                                <p className="text-sm font-semibold text-slate-700">Drag and drop files here</p>
                                <p className="mt-1 text-xs text-slate-500">
                                    {totalGeneratedPages}/{ADMIN_MODE ? 'Unlimited' : MAX_PAGES} pages from {totalCount}
                                    /{ADMIN_MODE ? 'Unlimited' : MAX_FILES} files ({formatBytes(totalUploadedBytes)}{' '}
                                    used)
                                </p>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="h-[300px] rounded-xl border border-slate-200 bg-slate-100 p-2.5 sm:h-[320px]">
                                {previewSheets.length ? (
                                    <div className="studio-book-preview mx-auto h-full max-w-[260px]">
                                        <Book
                                            sheets={previewSheets}
                                            title="Flipbook preview"
                                            orientation={orientation}
                                            showFullscreenButton={false}
                                            useCover={useCover}
                                            contentPageCount={pages.length}
                                            fullscreenThumbnails={previewThumbnails}
                                        />
                                    </div>
                                ) : (
                                    <div className="grid h-full place-items-center text-center text-slate-500">
                                        <div>
                                            <p className="text-sm font-semibold">Flipbook preview</p>
                                            <p className="mt-1 text-xs">Upload files to see live preview thumbnails.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-600">
                                <p>
                                    {items.length
                                        ? `Ready to generate ${totalGeneratedPages} page${totalGeneratedPages > 1 ? 's' : ''}.`
                                        : 'No pages yet'}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={clearPreviewBook}
                                        disabled={!items.length || isProcessingUploads || isSavingBook}
                                    >
                                        Discard
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                                        onClick={() => void generateBook(true)}
                                        disabled={!items.length || isProcessingUploads || isSavingBook}
                                    >
                                        {isSavingBook ? 'Saving to Cloud...' : 'Generate Book'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {(uploadError || cloudSaveError || cloudSaveMessage) && (
                    <div className="mt-5 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                        {uploadError && <p className="font-medium text-red-600">{uploadError}</p>}
                        {cloudSaveError && <p className="font-medium text-red-600">{cloudSaveError}</p>}
                        {cloudSaveMessage && <p className="font-medium text-emerald-700">{cloudSaveMessage}</p>}
                    </div>
                )}
            </div>

            {/* Upload/loading modal with fake progress that completes on real finish. */}
            {showLoadingModal && (
                <div className="fixed inset-0 z-100 grid place-items-center bg-black/55 px-4">
                    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
                        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Processing</p>
                        <h3 className="mt-2 text-xl font-bold">Preparing your flipbook...</h3>
                        <p className="mt-2 text-sm text-slate-600">Converting files and generating book pages.</p>

                        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                                className="h-full rounded-full bg-indigo-600 transition-[width] duration-200 ease-out"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <p className="mt-2 text-right text-sm font-semibold text-slate-600">
                            {Math.round(uploadProgress)}%
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
