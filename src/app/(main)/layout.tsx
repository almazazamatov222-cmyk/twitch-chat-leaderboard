/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from 'next';

import '../globals.css';

export const metadata: Metadata = {
  title: 'Twitch Chat Leaderboard',
  description: 'Статистика сообщений Twitch-чата для OBS',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&family=Roboto:wght@400;500;700;900&family=Manrope:wght@400;500;700;900&family=Montserrat:wght@400;500;700;900&family=Open+Sans:wght@400;500;700;900&family=Ubuntu:wght@400;500;700;900&family=Oswald:wght@400;500;700;900&family=Bebas+Neue&family=Rubik:wght@400;500;700;900&family=Russo+One&family=Unbounded:wght@400;500;700;900&family=Roboto+Condensed:wght@400;500;700;900&family=PT+Sans+Narrow:wght@400;700&family=Exo+2:wght@400;500;700;900&family=Fira+Mono:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;700;900&family=Play:wght@400;700&family=Jura:wght@400;500;700;900&family=Audiowide&family=Orbitron:wght@400;500;700;900&family=Press+Start+2P&family=Pixelify+Sans:wght@400;500;700;900&family=Caveat:wght@400;500;700&family=Pacifico&family=Lobster&family=Comfortaa:wght@400;500;700&display=swap" rel="stylesheet" precedence="default" />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}