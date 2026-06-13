'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_FILES = 10;
const MAX_PAGES = 10;
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const MAX_TOTAL_UPLOAD_BYTES = 60 * 1024 * 1024; // 60 MB combined

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
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
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

    async function addFiles(fileList) {
        if (!fileList?.length) return;
        const incoming = Array.from(fileList).filter(isSupportedFile);
        if (!incoming.length) return;
        setUploadError('');
        setIsProcessingUploads(true);

        try {
            const availableSlots = Math.max(0, MAX_FILES - itemsRef.current.length);
            const accepted = incoming.slice(0, availableSlots);
            const prepared = [];
            const failedFiles = [];
            let pageSlotsRemaining = Math.max(0, MAX_PAGES - totalGeneratedPages);
            let bytesRemaining = Math.max(0, MAX_TOTAL_UPLOAD_BYTES - totalUploadedBytes);

            for (const file of accepted) {
                if (file.size > MAX_FILE_SIZE_BYTES) {
                    failedFiles.push(
                        `${file.name} (${formatBytes(file.size)} too large, max ${formatBytes(MAX_FILE_SIZE_BYTES)} — please compress first)`
                    );
                    continue;
                }

                if (file.size > bytesRemaining) {
                    failedFiles.push(
                        `${file.name} (total upload limit ${formatBytes(MAX_TOTAL_UPLOAD_BYTES)} reached — please compress files)`
                    );
                    continue;
                }

                if (pageSlotsRemaining <= 0) {
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
                    const allowedPages = pdfPages.slice(0, pageSlotsRemaining);
                    if (!allowedPages.length) {
                        failedFiles.push(`${file.name} (no page slots remaining)`);
                        continue;
                    }

                    if (allowedPages.length < pdfPages.length) {
                        failedFiles.push(`${file.name} (trimmed to ${allowedPages.length} pages due to max ${MAX_PAGES})`);
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
        <section className="relative mx-auto w-full max-w-6xl overflow-hidden px-4 py-10 sm:px-6">
            <div className="pointer-events-none absolute -left-24 -top-20 h-60 w-60 rounded-full bg-fuchsia-400/25 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 top-32 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl" />
            <div className="pointer-events-none absolute bottom-6 left-1/3 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />

            <div className="relative rounded-3xl border border-cyan-300/30 bg-linear-to-b from-cyan-300/18 via-slate-900/75 to-slate-950/85 p-6 shadow-[0_20px_48px_rgba(0,0,0,0.4)] backdrop-blur-sm sm:p-8">
                <div>
                    <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Make your flipbook look premium fast</h1>
                    <p className="mt-3 max-w-2xl text-lg font-medium text-white/80 sm:text-xl">Upload. Generate. Share.</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/20 bg-white/8 px-4 py-1.5 text-sm font-semibold text-white/90">
                            Client-ready
                        </span>
                        <span className="rounded-full border border-white/20 bg-white/8 px-4 py-1.5 text-sm font-semibold text-white/90">
                            Super quick
                        </span>
                        <span className="rounded-full border border-white/20 bg-white/8 px-4 py-1.5 text-sm font-semibold text-white/90">
                            Zero setup
                        </span>
                    </div>
                </div>

                <div className="mt-8 rounded-2xl border border-white/20 bg-black/30 p-5 sm:p-6">
                    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Build your book</h2>
                            <p className="mt-1 text-base text-white/75">Pick options, drop files, generate.</p>
                        </div>
                    </div>

                    {/* Orientation selector */}
                    <div className="mb-6">
                        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">Orientation</p>
                        <div className="flex flex-wrap gap-3">
                            {['portrait', 'landscape'].map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setOrientation(mode)}
                                className={`rounded-xl border px-5 py-2.5 text-base font-semibold transition ${
                                        orientation === mode
                                            ? 'border-cyan-200/80 bg-cyan-300/25 text-white'
                                            : 'border-white/20 bg-transparent text-white/75 hover:border-white/40'
                                    }`}
                                >
                                    {mode === 'portrait' ? 'Portrait Mode' : 'Landscape Mode'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Cover option */}
                    <div className="mb-6">
                        <label className="inline-flex cursor-pointer items-center gap-3 text-base font-semibold text-white/90">
                            <input
                                type="checkbox"
                                checked={useCover}
                                onChange={(event) => setUseCover(event.target.checked)}
                                className="h-4 w-4 accent-cyan-400"
                            />
                            Include cover page
                        </label>
                        <p className="mt-2 text-xs text-white/60">
                            If disabled, the book opens directly on Page 1 (left) and Page 2 (right).
                        </p>
                    </div>

                    {/* Upload area with drag-and-drop and picker */}
                    <div
                        className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
                            isDragging ? 'border-primary bg-primary/10' : 'border-white/25 bg-white/5'
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
                        <p className="text-2xl font-bold">Drop your files</p>
                        <p className="mt-2 text-base text-white/75">
                            Max {MAX_PAGES} generated pages, {MAX_FILES} source files, {formatBytes(MAX_FILE_SIZE_BYTES)} per file,
                            {formatBytes(MAX_TOTAL_UPLOAD_BYTES)} total. Supported: image/*, .pdf
                        </p>
                        <div className="mt-5">
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/*,.pdf,application/pdf"
                                multiple
                                className="hidden"
                                onChange={handleFileInput}
                            />
                            <button
                                type="button"
                                className="book-button px-7 py-3 text-base"
                                onClick={() => inputRef.current?.click()}
                                disabled={isProcessingUploads}
                            >
                                {isProcessingUploads ? 'Processing...' : 'Choose Files'}
                            </button>
                        </div>
                        <p className="mt-3 text-xs text-white/60">
                            {totalGeneratedPages}/{MAX_PAGES} pages from {totalCount}/{MAX_FILES} files (
                            {formatBytes(totalUploadedBytes)} used)
                        </p>
                        {uploadError && <p className="mt-2 text-xs text-red-300">{uploadError}</p>}
                    </div>

                    {/* Primary action sits after upload for better flow/UX. */}
                    <div className="mt-6 flex flex-col gap-3 rounded-xl border border-white/15 bg-white/8 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-base text-white/80">
                            {items.length
                                ? `Ready to generate ${totalGeneratedPages} page${totalGeneratedPages > 1 ? 's' : ''} from ${items.length} source file${items.length > 1 ? 's' : ''}.`
                                : 'Add at least one image or PDF to continue.'}
                        </p>
                        <button
                            type="button"
                            className="book-button w-full px-7 py-3 text-base sm:w-auto"
                            onClick={() => void generateBook(true)}
                            disabled={!items.length || isProcessingUploads || isSavingBook}
                        >
                            {isSavingBook ? 'Saving to Cloud...' : 'Generate Book'}
                        </button>
                    </div>
                    {cloudSaveError && <p className="mt-3 text-sm font-medium text-red-300">{cloudSaveError}</p>}
                    {cloudSaveMessage && <p className="mt-3 text-sm font-medium text-cyan-200">{cloudSaveMessage}</p>}
                </div>

                {/* Preview section */}
                <div className="mt-8">
                    <h2 className="mb-4 text-2xl font-bold">Asset preview</h2>
                    {!items.length && <p className="text-sm text-white/70">No files yet. Upload files to generate pages.</p>}
                    {!!items.length && (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {items.map((item) => (
                                <article key={item.id} className="rounded-lg border border-white/15 bg-black/20 p-3">
                                    <div className="mb-3 aspect-4/3 overflow-hidden rounded-md border border-white/10 bg-black/20">
                                        <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                                    </div>
                                    <p className="truncate text-sm font-semibold">{item.file.name}</p>
                                    <div className="mt-3 flex items-center justify-between">
                                        <p className="text-xs text-white/60">
                                            {item.kind === 'image' ? 'Image page' : `PDF · ${item.pdfPages.length} pages`}
                                        </p>
                                        <button
                                            type="button"
                                            className="text-xs font-semibold text-red-300 hover:text-red-200"
                                            onClick={() => removeItem(item.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Upload/loading modal with fake progress that completes on real finish. */}
            {showLoadingModal && (
                <div className="fixed inset-0 z-100 grid place-items-center bg-black/55 px-4">
                    <div className="w-full max-w-md rounded-xl border border-white/20 bg-slate-900/95 p-5 shadow-2xl">
                        <p className="text-sm uppercase tracking-[0.2em] text-white/55">Processing</p>
                        <h3 className="mt-2 text-xl font-bold text-white">Preparing your flipbook...</h3>
                        <p className="mt-2 text-sm text-white/70">Converting files and generating book pages.</p>

                        <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/15">
                            <div
                                className="h-full rounded-full bg-cyan-400 transition-[width] duration-200 ease-out"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <p className="mt-2 text-right text-sm font-semibold text-white/80">{Math.round(uploadProgress)}%</p>
                    </div>
                </div>
            )}
        </section>
    );
}
