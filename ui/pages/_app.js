import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import '../styles/globals.css';

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      {/* next/font on the pages router: expose the families as CSS variables on :root */}
      <style jsx global>{`
        :root {
          --font-sans: ${GeistSans.style.fontFamily};
          --font-mono: ${GeistMono.style.fontFamily};
        }
      `}</style>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <Component {...pageProps} />
        </LazyMotion>
      </MotionConfig>
    </>
  );
}
