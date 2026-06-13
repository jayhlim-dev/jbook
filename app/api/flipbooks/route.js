import { NextResponse } from 'next/server';
import { buildStorageClient, getBucketName } from './_storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
    try {
        const bucketName = getBucketName();
        const formData = await request.formData();
        const files = formData.getAll('pages').filter((entry) => entry instanceof File);

        if (!files.length) {
            return NextResponse.json({ error: 'No page files found in request.' }, { status: 400 });
        }

        const orientation = formData.get('orientation') || 'portrait';
        const useCover = formData.get('useCover') === 'true';
        const storage = buildStorageClient();
        const bucket = storage.bucket(bucketName);
        const bookId = crypto.randomUUID();
        const uploaded = await Promise.all(
            files.map(async (file, index) => {
                const extension = file.name.split('.').pop() || 'jpg';
                const objectPath = `flipbooks/${bookId}/page-${String(index + 1).padStart(3, '0')}.${extension}`;
                const object = bucket.file(objectPath);
                const buffer = Buffer.from(await file.arrayBuffer());
                const contentType = file.type || 'image/jpeg';

                await object.save(buffer, {
                    resumable: false,
                    contentType,
                    metadata: {
                        cacheControl: 'private, max-age=0, no-store'
                    }
                });

                return {
                    name: file.name,
                    path: objectPath,
                    contentType
                };
            })
        );

        const manifestPath = `flipbooks/${bookId}/manifest.json`;
        const manifestFile = bucket.file(manifestPath);
        const manifest = {
            bookId,
            createdAt: new Date().toISOString(),
            orientation,
            useCover,
            pages: uploaded
        };

        await manifestFile.save(JSON.stringify(manifest), {
            resumable: false,
            contentType: 'application/json',
            metadata: {
                cacheControl: 'private, max-age=0, no-store'
            }
        });

        return NextResponse.json({
            success: true,
            bookId,
            uploadedCount: uploaded.length,
            orientation,
            useCover,
            manifestPath,
            bookUrl: `/${bookId}`
        });
    } catch (error) {
        return NextResponse.json(
            { error: error?.message || 'Unexpected error while uploading to GCS.' },
            { status: 500 }
        );
    }
}
