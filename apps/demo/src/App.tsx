import { useState, useEffect, useRef } from 'react';
import '@lagplayer/player';
import '@lagplayer/image-controls';
import type { LagPlayer } from '@lagplayer/player';
import type { LagImageControls } from '@lagplayer/image-controls';
import { WasmSharpener } from '@lagplayer/wasm-sharpener';
import styles from './App.module.css';

const sampleVideos = Object.entries(
  import.meta.glob('../assets/*', { query: '?url', import: 'default', eager: true }) as Record<string, string>
).map(([path, url]) => ({
  name: path.replace(/^.*\//, '').replace(/\.[^.]+$/, ''),
  url,
}));

export default function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const sharpenerRef = useRef<WasmSharpener | null>(null);

  useEffect(() => {
    if (!videoUrl) return;

    const player = document.getElementById('main-player') as LagPlayer;
    const controls = player?.querySelector('lag-image-controls') as LagImageControls | null;
    if (!player || !controls) return;

    controls.init(player);

    const sharpener = new WasmSharpener();
    sharpenerRef.current = sharpener;
    sharpener.init(player).catch(console.error);

    return () => {
      controls.destroy();
      sharpener.destroy();
      sharpenerRef.current = null;
    };
  }, [videoUrl]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
  }

  return (
    <div className={styles.app}>
      {!videoUrl ? (
        <div className={styles.dropZone}>
          <p className={styles.hint}>Load a video to get started</p>
          <div className={styles.fileActions}>
            {sampleVideos.map(({ name, url }) => (
              <button key={url} className={styles.fileBtn} onClick={() => setVideoUrl(url)}>
                {name}
              </button>
            ))}
            <label className={styles.fileBtn}>
              Choose file
              <input type="file" accept="video/*" onChange={handleFile} hidden />
            </label>
          </div>
        </div>
      ) : (
        <div className={styles.playerSection}>
          {/* @ts-expect-error – custom elements not in JSX intrinsic elements */}
          <lag-player id="main-player" src={videoUrl} class={styles.player} autoplay>
            {/* @ts-expect-error */}
            <lag-image-controls />
          </lag-player>
        </div>
      )}
    </div>
  );
}
