import { Head, Html, Main, NextScript } from 'next/document';

// Runs before first paint so the saved/system theme is applied with no flash.
const themeScript = `
try {
  var t = localStorage.getItem('codenex_theme');
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
} catch (e) { document.documentElement.dataset.theme = 'dark'; }
`;

export default function Document() {
  return (
    <Html lang="en" data-theme="dark">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
