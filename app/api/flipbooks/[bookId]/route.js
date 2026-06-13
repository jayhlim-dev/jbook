import { NextResponse } from 'next/server';
import { buildStorageClient, getBucketName, isValidBookId } from '../_storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

export async function GET(request, { params }) {
    const { bookId } = await params;
    if (!isValidBookId(bookId)) {
        return NextResponse.json({ error: 'Invalid book id format.' }, { status: 400 });
    }

    try {
        const bucketName = getBucketName();
        const storage = buildStorageClient();
        const bucket = storage.bucket(bucketName);
        const manifestPath = `flipbooks/${bookId}/manifest.json`;
        const manifestFile = bucket.file(manifestPath);
        const [exists] = await manifestFile.exists();

        if (!exists) {
            return NextResponse.json({ error: 'Book not found.' }, { status: 404 });
        }

        const [manifestBuffer] = await manifestFile.download();
        const manifest = JSON.parse(manifestBuffer.toString('utf8'));
        const expires = Date.now() + SIGNED_URL_TTL_MS;
        const pages = await Promise.all(
            (manifest.pages || []).map(async (page) => {
                const file = bucket.file(page.path);
                const [signedUrl] = await file.getSignedUrl({
                    version: 'v4',
                    action: 'read',
                    expires
                });

                return {
                    path: page.path,
                    contentType: page.contentType || 'image/jpeg',
                    signedUrl
                };
            })
        );

        return NextResponse.json({
            success: true,
            bookId,
            orientation: manifest.orientation || 'portrait',
            useCover: Boolean(manifest.useCover),
            createdAt: manifest.createdAt,
            pageCount: pages.length,
            pages
        });
    } catch (error) {
        return NextResponse.json(
            { error: error?.message || 'Failed to load stored flipbook.' },
            { status: 500 }
        );
    }
}
