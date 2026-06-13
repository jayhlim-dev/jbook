import '../styles/globals.css';
import { Footer } from '../components/footer';
import { Header } from '../components/header';

export const metadata = {
    title: {
        template: '%s | Netlify',
        default: 'Netlify Starter'
    }
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link rel="icon" href="/favicon.svg" sizes="any" />
            </head>
            <body className="antialiased text-white bg-slate-950">
                <div className="relative flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_15%_12%,rgba(34,211,238,0.22),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(244,114,182,0.2),transparent_32%),radial-gradient(circle_at_48%_100%,rgba(167,139,250,0.24),transparent_40%),linear-gradient(180deg,#020617,#111827_55%,#1e1b4b)] px-6 sm:px-12">
                    <div className="pointer-events-none absolute inset-0 bg-noise opacity-35 mix-blend-soft-light" />
                    <div className="relative flex w-full max-w-5xl grow flex-col mx-auto">
                        {/* <Header /> */}
                        <main className="grow">{children}</main>
                        {/* <Footer /> */}
                    </div>
                </div>
            </body>
        </html>
    );
}
