import { HostedFlipbookViewer } from 'components/hosted-flipbook-viewer';

export default async function BookPage({ params }) {
    const { bookId } = await params;
    return <HostedFlipbookViewer bookId={bookId} />;
}
