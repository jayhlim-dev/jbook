'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Book } from './Book';

const MAX_FILES = 10;

function isSupportedFile(file) {
    return file.type.startsWith('image/') || file.type === 'application/pdf';
}

function mockPdfPageCount(file) {
    // Mock conversion result for now (backend/PDF parser can replace this later).
    return Math.max(2, Math.min(8, (file.size % 5) + 2));
}

function createContentPageNode(page, orientation) {
    if (page.type === 'image') {
        return (
            <div className="h-full w-full overflow-hidden rounded-sm bg-black/20">
                <img src={page.src} alt={page.label} className="h-full w-full object-cover" />
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col justify-between rounded-sm border border-white/15 bg-black/15 p-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-white/60">PDF Page</p>
                <h3 className="mt-2 text-2xl font-bold">{page.label}</h3>
            </div>
            <p className="text-sm text-white/70">
                Mock PDF conversion preview ({orientation}). Replace with real PDF rendering in backend integration.
            </p>
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
            <p className="text-sm text-white/65">Generated automatically from your uploads.</p>
        </div>
    );
}

function createBackCoverNode() {
    return (
        <div className="flex h-full items-end">
            <p className="text-sm text-white/70">End of book</p>
        </div>
    );
}

function buildSheetsFromPages(pages, orientation, useCover) {
    const coverFront = createCoverNode('Your Flipbook', `${pages.length} generated page${pages.length === 1 ? '' : 's'}`);
    const backCover = createBackCoverNode();
    const blankPage = <div className="h-full w-full rounded-sm border border-white/10 bg-black/10" />;
    const pageNodes = pages.map((page) => createContentPageNode(page, orientation));

    if (!pages.length) {
        return [{ front: coverFront, back: useCover ? backCover : blankPage }];
    }

    if (!useCover) {
        // No-cover mode starts immediately at Page 1 (left) and Page 2 (right).
        const sheetCount = Math.max(2, Math.ceil(pageNodes.length / 2) + 1);
        const sheets = [];

        for (let i = 0; i < sheetCount; i += 1) {
            sheets.push({
                front: i === 0 ? blankPage : pageNodes[2 * i - 1] || blankPage,
                back: pageNodes[2 * i] || blankPage
            });
        }

        return sheets;
    }

    const sheetCount = Math.max(1, Math.ceil((pageNodes.length + 2) / 2));
    const sheets = [];

    for (let i = 0; i < sheetCount; i += 1) {
        if (i === 0) {
            sheets.push({
                front: coverFront,
                back: i === sheetCount - 1 ? backCover : pageNodes[0] || blankPage
            });
            continue;
        }

        sheets.push({
            front: pageNodes[2 * i - 1] || blankPage,
            back: i === sheetCount - 1 ? backCover : pageNodes[2 * i] || blankPage
        });
    }

    return sheets;
}

export function FlipbookStudio() {
    const [orientation, setOrientation] = useState('portrait');
    const [useCover, setUseCover] = useState(true);
    const [items, setItems] = useState([]);
    const [generatedSheets, setGeneratedSheets] = useState([]);
    const [isReaderOpen, setIsReaderOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef(null);
    const itemsRef = useRef(items);

    const totalCount = items.length;

    const pages = useMemo(() => {
        return items.flatMap((item) => {
            if (item.kind === 'image') {
                return [{ type: 'image', src: item.previewUrl, label: item.file.name }];
            }

            return Array.from({ length: item.mockPages }, (_, index) => ({
                type: 'pdf',
                label: `${item.file.name} - Page ${index + 1}`
            }));
        });
    }, [items]);

    function addFiles(fileList) {
        if (!fileList?.length) return;
        const incoming = Array.from(fileList).filter(isSupportedFile);
        if (!incoming.length) return;

        setItems((prev) => {
            const availableSlots = Math.max(0, MAX_FILES - prev.length);
            const accepted = incoming.slice(0, availableSlots).map((file) => ({
                id: crypto.randomUUID(),
                file,
                kind: file.type.startsWith('image/') ? 'image' : 'pdf',
                previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
                mockPages: file.type === 'application/pdf' ? mockPdfPageCount(file) : 0
            }));

            return [...prev, ...accepted];
        });
    }

    function removeItem(id) {
        setItems((prev) => {
            const target = prev.find((item) => item.id === id);
            if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((item) => item.id !== id);
        });
    }

    function handleFileInput(event) {
        addFiles(event.target.files);
        event.target.value = '';
    }

    function generateBook(openReader = true) {
        const sheets = buildSheetsFromPages(pages, orientation, useCover);
        setGeneratedSheets(sheets);
        if (openReader) setIsReaderOpen(true);
    }

    // Auto-generate after upload so users immediately get a readable book.
    useEffect(() => {
        if (!items.length) {
            setGeneratedSheets([]);
            setIsReaderOpen(false);
            return;
        }
        generateBook(true);
    }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

    // Orientation updates regenerate sheets without forcing fullscreen reopen.
    useEffect(() => {
        if (!items.length) return;
        generateBook(false);
    }, [orientation, useCover]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    // Revoke any remaining object URLs only when the studio unmounts.
    useEffect(() => {
        return () => {
            itemsRef.current.forEach((item) => {
                if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            });
        };
    }, []);

    return (
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-6 shadow-[0_12px_34px_rgba(0,0,0,0.2)] sm:p-8">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Create a flipbook from images or PDFs</h1>
                        <p className="mt-2 text-white/70">Upload files, preview pages, and open your generated book instantly.</p>
                    </div>
                    <button
                        type="button"
                        className="book-button w-full sm:w-auto"
                        onClick={() => generateBook(true)}
                        disabled={!items.length}
                    >
                        Generate Book
                    </button>
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
                                className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
                                    orientation === mode
                                        ? 'border-white/60 bg-white/15 text-white'
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
                    <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-semibold text-white/85">
                        <input
                            type="checkbox"
                            checked={useCover}
                            onChange={(event) => setUseCover(event.target.checked)}
                            className="h-4 w-4 accent-cyan-400"
                        />
                        Use cover page
                    </label>
                    <p className="mt-2 text-xs text-white/60">
                        If disabled, the book opens directly on Page 1 (left) and Page 2 (right).
                    </p>
                </div>

                {/* Upload area with drag-and-drop and picker */}
                <div
                    className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
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
                        addFiles(event.dataTransfer.files);
                    }}
                >
                    <p className="text-lg font-semibold">Drag & drop images or PDFs here</p>
                    <p className="mt-2 text-sm text-white/70">Up to {MAX_FILES} files. Supported: image/*, .pdf</p>
                    <div className="mt-5">
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            multiple
                            className="hidden"
                            onChange={handleFileInput}
                        />
                        <button type="button" className="book-button" onClick={() => inputRef.current?.click()}>
                            Choose Files
                        </button>
                    </div>
                    <p className="mt-3 text-xs text-white/60">
                        {totalCount}/{MAX_FILES} files selected
                    </p>
                </div>

                {/* Preview section */}
                <div className="mt-8">
                    <h2 className="mb-4 text-xl font-bold">Preview</h2>
                    {!items.length && <p className="text-sm text-white/70">No files yet. Upload files to generate pages.</p>}
                    {!!items.length && (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {items.map((item) => (
                                <article key={item.id} className="rounded-lg border border-white/15 bg-black/20 p-3">
                                    <div className="mb-3 aspect-4/3 overflow-hidden rounded-md border border-white/10 bg-black/20">
                                        {item.kind === 'image' ? (
                                            <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-sm text-white/80">
                                                PDF · {item.mockPages} pages (mock)
                                            </div>
                                        )}
                                    </div>
                                    <p className="truncate text-sm font-semibold">{item.file.name}</p>
                                    <div className="mt-3 flex items-center justify-between">
                                        <p className="text-xs text-white/60">{item.kind === 'image' ? 'Image page' : 'PDF source'}</p>
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

            {/* Fullscreen reader opens as soon as a book has been generated */}
            {isReaderOpen && generatedSheets.length > 0 && (
                <Book
                    sheets={generatedSheets}
                    title="Generated Flipbook"
                    fullScreen
                    onRequestClose={() => setIsReaderOpen(false)}
                    orientation={orientation}
                    showEmbeddedControls={false}
                    useCover={useCover}
                />
            )}
        </section>
    );
}
