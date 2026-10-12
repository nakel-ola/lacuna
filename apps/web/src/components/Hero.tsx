import darkAvif from '../assets/app-dark.png?w=800;1280;1920;2560&format=avif&as=srcset';
import darkWebp from '../assets/app-dark.png?w=800;1280;1920;2560&format=webp&as=srcset';
import lightAvif from '../assets/app-light.png?w=800;1280;1920;2560&format=avif&as=srcset';
import lightWebp from '../assets/app-light.png?w=800;1280;1920;2560&format=webp&as=srcset';
import fallback from '../assets/app-light.png?w=1920&quality=82&format=jpg';
import { DOWNLOAD_URL, SITE } from '../site';
import { Icon } from './Icon';

// Screenshot size at 2x; the window follows the visitor's light/dark setting.
const SHOT = { width: 2560, height: 1640 };
const SIZES = '(min-width: 1240px) 1100px, 92vw';

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container">
        <a className="announce" href={SITE.github} rel="noopener">
          <span className="announce-tag">
            <Icon name="star" size={13} />
            Open source
          </span>
          <span>
            <span className="announce-extra">Free forever. </span>Star Lacuna on <b>GitHub</b>
          </span>
          <span className="announce-arrow">
            <Icon name="arrow" size={14} />
          </span>
        </a>

        <h1 id="hero-title">
          See what's filling
          <br /> your Mac.
        </h1>
        <p className="lede">
          Lacuna is a free, open-source disk space analyzer for Mac. It scans millions of files in seconds, shows you
          exactly what’s taking up space, and moves what you don’t need to the Trash.
        </p>

        <div className="hero-actions">
          <a className="btn btn-ink btn-lg" href={DOWNLOAD_URL}>
            <Icon name="apple" size={20} />
            Download for Mac
          </a>
          <a className="btn btn-line btn-lg" href={SITE.github} rel="noopener">
            <Icon name="github" size={18} />
            View source
          </a>
        </div>
        <p className="fine">macOS {SITE.minimumMacOS} or later · MIT license</p>
      </div>

      <div className="container showcase-wrap">
        <div className="showcase">
          <div className="wallpaper" aria-hidden="true">
            <span className="blob blob-a" />
            <span className="blob blob-b" />
            <span className="blob blob-c" />
          </div>

          <figure className="window">
            <span className="lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <picture>
              <source media="(prefers-color-scheme: dark)" type="image/avif" srcSet={darkAvif} sizes={SIZES} />
              <source media="(prefers-color-scheme: dark)" type="image/webp" srcSet={darkWebp} sizes={SIZES} />
              <source type="image/avif" srcSet={lightAvif} sizes={SIZES} />
              <source type="image/webp" srcSet={lightWebp} sizes={SIZES} />
              <img
                src={fallback}
                width={SHOT.width}
                height={SHOT.height}
                alt="Lacuna's Overview: a bar chart of space by folder, a storage overview by file type, and a table of folders with two marked for cleanup."
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </figure>

          {/* Floating fragments of the real UI, like menus hovering over a desktop. */}
          <div className="float float-menu" aria-hidden="true">
            <div className="float-label">Disks</div>
            <div className="float-item">
              <span className="float-icon">
                <Icon name="disk" size={15} />
              </span>
              <span className="float-text">
                <b>Macintosh HD</b>
                <small>212 GB free · 995 GB</small>
                <i className="cap">
                  <i style={{ width: '79%' }} />
                </i>
              </span>
              <Icon name="check" size={15} />
            </div>
            <div className="float-item">
              <span className="float-icon">
                <Icon name="disk" size={15} />
              </span>
              <span className="float-text">
                <b>Backup SSD</b>
                <small>1.4 TB free · 2.0 TB</small>
                <i className="cap">
                  <i style={{ width: '30%' }} />
                </i>
              </span>
            </div>
          </div>

          <div className="float float-trash" aria-hidden="true">
            <span className="trash-icon">
              <Icon name="trash" size={18} />
            </span>
            <span>
              <b>390 GB</b> moved to the Trash<small>2 items · recoverable</small>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
