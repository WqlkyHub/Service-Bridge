// Fabrique la vidéo de la pub à partir de pub.html (il faut ffmpeg dans le PATH) :
//   npx electron pub/rendre.cjs                      → pub/FoleyBox-pub-30s.mp4
//   npx electron pub/rendre.cjs --images 1,5.2 dossier → vignettes de contrôle dans « dossier »

const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

const FPS = 30, DUREE = 30;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, 'pub.html'));
  const js = (code) => win.webContents.executeJavaScript(code);
  const data = (url) => Buffer.from(url.split(',')[1], 'base64');
  await js('pret');

  const i = process.argv.indexOf('--images');
  if (i > 0) {
    const dir = process.argv[i + 2] || __dirname;
    for (const t of process.argv[i + 1].split(',')) fs.writeFileSync(path.join(dir, `image-${t}.jpg`), data(await js(`image(${Number(t)}, true)`)));
    return app.quit();
  }

  const wav = path.join(app.getPath('temp'), 'foleybox-pub.wav');
  fs.writeFileSync(wav, Buffer.from(await js('sonWav()'), 'base64'));
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', wav,
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest',
    path.join(__dirname, 'FoleyBox-pub-30s.mp4'),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < FPS * DUREE; f++) {
    if (!ff.stdin.write(data(await js(`image(${f / FPS})`)))) await once(ff.stdin, 'drain');
    if (f % FPS === 0) console.log(`${f / FPS} s / ${DUREE} s`);
  }
  ff.stdin.end();
  await once(ff, 'close');
  fs.rmSync(wav);
  app.quit();
});
