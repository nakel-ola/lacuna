import { FEATURES_URL } from '../site';
import { Icon } from './Icon';
import {
  CardCopy,
  MiniBars,
  MiniCleanup,
  MiniDuplicates,
  MiniHistory,
  MiniLarge,
  MiniPrivate,
  MiniSuggestions,
} from './Minis';

/** The home page's highlights; /features/ has the full list. */
export function Features() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="container">
        <header className="section-head">
          <p className="eyebrow">Features</p>
          <h2 id="features-title">Everything you need to get your space back.</h2>
          <p>
            One scan answers the question every Mac owner eventually asks: <em>where did all my storage go?</em>
          </p>
        </header>

        <div className="bento">
          <article className="card card-wide">
            <CardCopy icon="bars" title="Space by folder">
              See which folders take the most space at a glance, as bars or a treemap. Click one to open it; the chart and
              table follow you down.
            </CardCopy>
            <MiniBars />
          </article>

          <article className="card">
            <CardCopy icon="spark" title="Suggestions">
              Build output, caches, <code>node_modules</code> and old installers, each with why it’s safe to remove.
            </CardCopy>
            <MiniSuggestions />
          </article>

          <article className="card">
            <CardCopy icon="file" title="Big and forgotten files">
              The largest files, or what nobody has opened in a year or more.
            </CardCopy>
            <MiniLarge />
          </article>

          <article className="card">
            <CardCopy icon="copy" title="Duplicates">
              Files with exactly the same content. Clones and hard links count once.
            </CardCopy>
            <MiniDuplicates />
          </article>

          <article className="card">
            <CardCopy icon="history" title="What grew">
              Every scan is remembered on your Mac, so the next one shows what changed.
            </CardCopy>
            <MiniHistory />
          </article>

          <article className="card card-wide card-sage">
            <CardCopy icon="restore" title="Clean up without the fear">
              Collect folders and files with <b>+</b> or drag them onto the Cleanup card. Before anything moves you see every
              path and the total. Everything goes to the Trash, so you can always put it back.
            </CardCopy>
            <MiniCleanup />
          </article>

          <article className="card">
            <CardCopy icon="lock" title="Private by design">
              No network access, no account, no analytics. Your file list never leaves your Mac.
            </CardCopy>
            <MiniPrivate />
          </article>
        </div>

        <a className="btn btn-line more-link" href={FEATURES_URL}>
          See every feature
          <Icon name="arrow" size={16} />
        </a>
      </div>
    </section>
  );
}
