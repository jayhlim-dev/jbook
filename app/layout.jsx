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
            <body className="antialiased text-slate-900">
                {/* <div className="relative flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_15%_12%,rgba(120,98,255,0.09),transparent_35%),radial-gradient(circle_at_80%_18%,rgba(94,234,212,0.08),transparent_32%),linear-gradient(180deg,#f4f5fb,#eef1f9_55%,#e9edf7)] px-3 sm:px-6"> */}
                <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#f8f7fc] px-3 sm:px-6">
                    <div className="pointer-events-none absolute inset-0 bg-noise opacity-25 mix-blend-overlay" />
                    <div className="relative mx-auto flex w-full max-w-[1480px] grow flex-col">
                        {/* <Header /> */}
                        <main className="grow">{children}</main>
                        {/* <Footer /> */}
                    </div>
                </div>
            </body>
        </html>
    );
}
