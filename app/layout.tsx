import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: {
    default: 'TalkGroup.ai | Mission Critical Communications',
    template: '%s',
  },
  description:
    'TalkGroup.ai - Mission Critical Communications. Modern comms platform for mission-critical teams with talk groups, push-to-talk, and open mic capabilities.',
  twitter: {
    creator: '@talkgroupai',
    site: '@talkgroupai',
    card: 'summary_large_image',
  },
  openGraph: {
    url: 'https://talkgroup.ai',
    images: [
      {
        url: '/images/talkgroup-open-graph.png',
        width: 2000,
        height: 1000,
        type: 'image/png',
      },
    ],
    siteName: 'TalkGroup.ai',
  },
  icons: {
    icon: {
      rel: 'icon',
      url: '/favicon.ico',
    },
    apple: [
      {
        rel: 'apple-touch-icon',
        url: '/images/talkgroup-apple-touch.png',
        sizes: '180x180',
      },
      { rel: 'mask-icon', url: '/images/talkgroup-safari-pinned-tab.svg', color: '#FFD400' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#FFD400',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-lk-theme="default">
        <Toaster />
        {children}
      </body>
    </html>
  );
}
