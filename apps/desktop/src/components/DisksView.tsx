import { api } from '../lib/api';
import { formatBytes, usedPct } from '../lib/format';
import { useStore } from '../store';
import { Icon } from './Icon';

export function DisksView() {
  const volumes = useStore((s) => s.volumes);
  const fullDiskAccess = useStore((s) => s.fullDiskAccess);
  const scannedRoot = useStore((s) => s.summary?.root);
  const { setTab, startScan, chooseFolder, loadVolumes } = useStore.getState();

  return (
    <section className="disks">
      {!fullDiskAccess && (
        <div className="fda">
          <Icon name="lock" />
          <div>
            <strong>Allow Full Disk Access for a complete scan</strong>
            <small>Without it, protected folders (Mail, Safari, other apps' data) count as hidden space.</small>
          </div>
          <button className="btn-ghost" type="button" onClick={loadVolumes}>
            Check again
          </button>
          <button className="btn-dark" type="button" onClick={() => api.openFullDiskAccessSettings()}>
            Open Settings
          </button>
        </div>
      )}
      <div className="section-head">
        <h2>Disks</h2>
      </div>
      <div className="disk-grid">
        {volumes.map((v) => {
          const current = scannedRoot === v.scanPath;
          return (
            <article className="disk" key={v.scanPath}>
              <div className="disk-top">
                <Icon name="disk" className="kind-icon" />
                <div>
                  <strong>{v.name}</strong>
                  <small>{v.isBoot ? 'Startup disk' : v.mountPoint}</small>
                </div>
              </div>
              <div className="disk-free">
                {formatBytes(v.free)}
                <small>free</small>
              </div>
              <div className="capacity">
                <i style={{ width: usedPct(v.total, v.free) }} />
              </div>
              <small className="cell muted">
                {formatBytes(v.total - v.free)} used of {formatBytes(v.total)}
              </small>
              <button
                type="button"
                className="btn-dark btn-wide"
                onClick={() => (current ? setTab('overview') : startScan(v.scanPath, v.name))}
              >
                <span>{current ? 'Open scan' : 'Scan disk'}</span>
                <Icon name="arrow" />
              </button>
            </article>
          );
        })}
        <article className="disk add" onClick={chooseFolder}>
          <Icon name="plus" className="kind-icon" />
          <strong>Scan a folder</strong>
          <small>or drop one anywhere on this window</small>
        </article>
      </div>
    </section>
  );
}
